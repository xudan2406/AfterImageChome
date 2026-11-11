import { Canvas, createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { detectImageFormat } from './format';
import { inspectImage, processImage } from './process-image';
import type { ImageProcessingPlatform, ProcessingSurface } from './types';
import { ImageEngineError } from './types';

type NapiImage = Awaited<ReturnType<typeof loadImage>>;
type NapiSurface = ProcessingSurface & { canvas: Canvas };

const canvasPlatform: ImageProcessingPlatform<NapiImage, NapiSurface> = {
  async decode(file) {
    const image = await loadImage(Buffer.from(await file.arrayBuffer()));
    return {
      image,
      width: image.width,
      height: image.height,
      close: () => undefined,
    };
  },
  createSurface(width, height) {
    return { surface: null, canvas: createCanvas(width, height) };
  },
  render(surface, decoded, dimensions, backgroundColor, transform) {
    const context = surface.canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, dimensions.width, dimensions.height);
    }
    const crop = transform?.crop ?? { x: 0, y: 0, width: decoded.width, height: decoded.height };
    const rotation = transform?.rotation ?? 0;
    const swapsAxes = rotation === 90 || rotation === 270;
    const drawWidth = swapsAxes ? dimensions.height : dimensions.width;
    const drawHeight = swapsAxes ? dimensions.width : dimensions.height;
    context.save();
    context.translate(dimensions.width / 2, dimensions.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.scale(transform?.flipHorizontal ? -1 : 1, transform?.flipVertical ? -1 : 1);
    context.drawImage(decoded.image, crop.x, crop.y, crop.width, crop.height, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  },
  async encode(surface, mimeType, quality) {
    const buffer = mimeType === 'image/png'
      ? surface.canvas.toBuffer('image/png')
      : mimeType === 'image/jpeg'
        ? surface.canvas.toBuffer('image/jpeg', quality * 100)
        : mimeType === 'image/webp'
          ? surface.canvas.toBuffer('image/webp', quality * 100)
          : surface.canvas.toBuffer('image/avif', quality * 100);
    return new Blob([new Uint8Array(buffer)], { type: mimeType });
  },
};

async function createSourceFile(name = 'pattern.png'): Promise<File> {
  const canvas = createCanvas(192, 128);
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 192, 128);
  gradient.addColorStop(0, '#ff3355');
  gradient.addColorStop(0.5, '#34aaff');
  gradient.addColorStop(1, '#ffe34a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 128);
  for (let index = 0; index < 40; index++) {
    context.fillStyle = `rgba(${(index * 37) % 255}, ${(index * 71) % 255}, ${(index * 19) % 255}, 0.6)`;
    context.fillRect((index * 29) % 192, (index * 17) % 128, 12, 9);
  }
  const png = canvas.toBuffer('image/png');
  return new File([new Uint8Array(png)], name, { type: 'application/octet-stream' });
}

async function createTransparentSource(): Promise<File> {
  const canvas = createCanvas(20, 10);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 20, 10);
  context.fillStyle = '#2244cc';
  context.fillRect(0, 0, 10, 10);
  return new File([new Uint8Array(canvas.toBuffer('image/png'))], 'alpha.png', { type: 'image/png' });
}

async function createAsymmetricSource(): Promise<File> {
  const canvas = createCanvas(2, 1);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = '#0000ff';
  context.fillRect(1, 0, 1, 1);
  return new File([new Uint8Array(canvas.toBuffer('image/png'))], 'asymmetric.png', { type: 'image/png' });
}

async function createVerticalSource(): Promise<File> {
  const canvas = createCanvas(1, 2);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = '#0000ff';
  context.fillRect(0, 1, 1, 1);
  return new File([new Uint8Array(canvas.toBuffer('image/png'))], 'vertical.png', { type: 'image/png' });
}

async function readPixels(blob: Blob): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

describe('image format detection', () => {
  it.each([
    ['image/jpeg', [0xff, 0xd8, 0xff], 'jpeg'],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'png'],
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'webp'],
    ['image/avif', [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x61, 0x76, 0x69, 0x66], 'avif'],
  ] as const)('detects %s by its signature, not its MIME type', async (mime, signature, expected) => {
    const file = new Blob([new Uint8Array(signature)], { type: mime });
    await expect(detectImageFormat(file)).resolves.toBe(expected);
  });

  it('does not accept an SVG based on its file extension or MIME type', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'image.png', { type: 'image/png' });
    expect(await detectImageFormat(svg)).toBe('unknown');
    await expect(processImage(svg, {
      format: 'png',
      quality: 0.8,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, canvasPlatform)).rejects.toMatchObject({ code: 'UNSUPPORTED_INPUT' });
  });
});

describe('image processing integration', () => {
  it('rejects decoded images above 100 megapixels before surface allocation and still closes the image', async () => {
    let released = false;
    let surfaceCreated = false;
    const oversizedPlatform: ImageProcessingPlatform<object, NapiSurface> = {
      async decode() {
        return {
          image: {},
          width: 10_001,
          height: 10_000,
          close: () => { released = true; },
        };
      },
      createSurface() {
        surfaceCreated = true;
        throw new Error('Surface allocation must not be attempted.');
      },
      render() {},
      async encode() {
        return new Blob();
      },
    };
    const source = new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'oversized.png');

    await expect(processImage(source, {
      format: 'png',
      quality: 0.8,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, oversizedPlatform)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(surfaceCreated).toBe(false);
    expect(released).toBe(true);
  });

  it('inspects real image metadata and releases the decoded bitmap', async () => {
    const source = await createSourceFile();
    let released = false;
    const trackingPlatform: ImageProcessingPlatform<NapiImage, NapiSurface> = {
      ...canvasPlatform,
      async decode(file) {
        const decoded = await canvasPlatform.decode(file);
        return { ...decoded, close: () => { released = true; } };
      },
    };

    await expect(inspectImage(source, trackingPlatform)).resolves.toEqual({
      format: 'png',
      width: 192,
      height: 128,
    });
    expect(released).toBe(true);
  });

  it.each(['jpeg', 'png', 'webp', 'avif'] as const)(
    'actually encodes and decodes %s output',
    async (format) => {
      const source = await createSourceFile();
      const output = await processImage(source, {
        format,
        quality: 0.72,
        resize: { preserveAspectRatio: true },
        backgroundColor: '#ffffff',
      }, canvasPlatform);

      expect(output.blob.type).toBe(`image/${format}`);
      expect(output.outputSize).toBe(output.blob.size);
      expect(await detectImageFormat(output.blob)).toBe(format);

      const decoded = await loadImage(Buffer.from(await output.blob.arrayBuffer()));
      expect(decoded.width).toBe(192);
      expect(decoded.height).toBe(128);
    },
  );

  it.each(['jpeg', 'png', 'webp', 'avif'] as const)(
    'decodes %s input pixels before converting to PNG',
    async (sourceFormat) => {
      const sourcePng = await createSourceFile();
      const encodedSource = await processImage(sourcePng, {
        format: sourceFormat,
        quality: 0.8,
        resize: { preserveAspectRatio: true },
        backgroundColor: '#ffffff',
      }, canvasPlatform);
      const source = new File(
        [new Uint8Array(await encodedSource.blob.arrayBuffer())],
        `source.${sourceFormat}`,
        { type: `image/${sourceFormat}` },
      );
      const output = await processImage(source, {
        format: 'png',
        quality: 0.8,
        resize: { preserveAspectRatio: true },
        backgroundColor: '#ffffff',
      }, canvasPlatform);

      expect(await detectImageFormat(source)).toBe(sourceFormat);
      expect(output.blob.type).toBe('image/png');
      const decoded = await loadImage(Buffer.from(await output.blob.arrayBuffer()));
      expect(decoded.width).toBe(192);
      expect(decoded.height).toBe(128);
    },
  );

  it.each(['jpeg', 'webp', 'avif'] as const)('changes the actual encoded %s size when quality is lowered', async (format) => {
    const source = await createSourceFile();
    const common = {
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    } as const;
    const high = await processImage(source, { ...common, format, quality: 0.95 }, canvasPlatform);
    const low = await processImage(source, { ...common, format, quality: 0.2 }, canvasPlatform);

    expect(low.blob.size).toBeLessThan(high.blob.size);
    expect(low.blob.size).toBeGreaterThan(0);
    expect(low.reductionPercentage).toBe((source.size - low.blob.size) / source.size * 100);
  });

  it('avoids recompressing an unchanged lossless PNG', async () => {
    const source = await createSourceFile();
    const output = await processImage(source, {
      format: 'png',
      quality: 0.8,
      resize: { width: 192, height: 128, preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, canvasPlatform);

    expect(output.blob.size).toBe(source.size);
    expect(new Uint8Array(await output.blob.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()));
  });

  it('resizes decoded pixels while preserving the original aspect ratio', async () => {
    const source = await createSourceFile();
    const output = await processImage(source, {
      format: 'png',
      quality: 0.8,
      resize: { width: 96, preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, canvasPlatform);

    expect(output.width).toBe(96);
    expect(output.height).toBe(64);
    const decoded = await loadImage(Buffer.from(await output.blob.arrayBuffer()));
    expect(decoded.width).toBe(96);
    expect(decoded.height).toBe(64);
  });

  it('crops the requested source pixels and updates output dimensions', async () => {
    const output = await processImage(await createAsymmetricSource(), {
      format: 'png',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: { crop: { x: 1, y: 0, width: 1, height: 1 } },
    }, canvasPlatform);

    expect(output.width).toBe(1);
    expect(output.height).toBe(1);
    const pixels = await readPixels(output.blob);
    expect(pixels.data.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]));
  });

  it('rotates source pixels by 90 degrees and swaps output dimensions', async () => {
    const output = await processImage(await createAsymmetricSource(), {
      format: 'png',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: { rotation: 90 },
    }, canvasPlatform);

    expect(output.width).toBe(1);
    expect(output.height).toBe(2);
    const pixels = await readPixels(output.blob);
    expect(pixels.data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]));
    expect(pixels.data.slice(4, 8)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]));
  });

  it('flips source pixels horizontally', async () => {
    const output = await processImage(await createAsymmetricSource(), {
      format: 'png',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: { flipHorizontal: true },
    }, canvasPlatform);
    const pixels = await readPixels(output.blob);
    expect(pixels.data.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]));
    expect(pixels.data.slice(4, 8)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]));
  });

  it('flips source pixels vertically', async () => {
    const output = await processImage(await createVerticalSource(), {
      format: 'png',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: { flipVertical: true },
    }, canvasPlatform);
    const pixels = await readPixels(output.blob);
    expect(pixels.data.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]));
    expect(pixels.data.slice(4, 8)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]));
  });

  it('rejects crop coordinates outside the source image', async () => {
    await expect(processImage(await createAsymmetricSource(), {
      format: 'png',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: { crop: { x: 1, y: 0, width: 2, height: 1 } },
    }, canvasPlatform)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('preserves transparent pixels in PNG output', async () => {
    const output = await processImage(await createTransparentSource(), {
      format: 'png',
      quality: 0.8,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, canvasPlatform);
    const decoded = await loadImage(Buffer.from(await output.blob.arrayBuffer()));
    const canvas = createCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d');
    context.drawImage(decoded, 0, 0);

    expect(context.getImageData(15, 5, 1, 1).data[3]).toBe(0);
  });

  it('composites transparent pixels onto the selected JPEG background color', async () => {
    const output = await processImage(await createTransparentSource(), {
      format: 'jpeg',
      quality: 1,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ff0000',
    }, canvasPlatform);
    const decoded = await loadImage(Buffer.from(await output.blob.arrayBuffer()));
    const canvas = createCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d');
    context.drawImage(decoded, 0, 0);
    const pixel = context.getImageData(15, 5, 1, 1).data;

    expect(pixel[0]).toBeGreaterThan(240);
    expect(pixel[1]).toBeLessThan(15);
    expect(pixel[2]).toBeLessThan(15);
  });

  it('surfaces a browser codec fallback instead of returning a mislabeled format', async () => {
    const source = await createSourceFile();
    const pngFallback: ImageProcessingPlatform<NapiImage, NapiSurface> = {
      ...canvasPlatform,
      async encode(surface) {
        return new Blob([new Uint8Array(surface.canvas.toBuffer('image/png'))], { type: 'image/png' });
      },
    };

    await expect(processImage(source, {
      format: 'avif',
      quality: 0.8,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, pngFallback)).rejects.toMatchObject({
      code: 'CODEC_UNAVAILABLE',
      message: expect.stringContaining('cannot encode AVIF'),
    });
  });

  it('rejects invalid quality settings before processing', async () => {
    const source = await createSourceFile();
    await expect(processImage(source, {
      format: 'jpeg',
      quality: 0,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, canvasPlatform)).rejects.toBeInstanceOf(ImageEngineError);
  });

  it('releases the decoded bitmap when processing rejects an unsafe image size', async () => {
    const source = await createSourceFile();
    let released = false;
    const oversizedImage: ImageProcessingPlatform<NapiImage, NapiSurface> = {
      ...canvasPlatform,
      async decode(file) {
        const decoded = await canvasPlatform.decode(file);
        return { ...decoded, width: 20_000, height: 10_000, close: () => { released = true; } };
      },
    };
    await expect(processImage(source, {
      format: 'png',
      quality: 0.8,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
    }, oversizedImage)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(released).toBe(true);
  });
});
