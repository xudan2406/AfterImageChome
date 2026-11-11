import type {
  DecodedImage,
  ImageDimensions,
  OutputCapabilities,
  ImageProcessingPlatform,
  ProcessingSurface,
} from './types';
import { ImageEngineError } from './types';

type BrowserSurface = ProcessingSurface & {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
};

export const browserImagePlatform: ImageProcessingPlatform<ImageBitmap, BrowserSurface> = {
  async decode(file): Promise<DecodedImage<ImageBitmap>> {
    if (typeof createImageBitmap !== 'function') {
      throw new ImageEngineError('DECODE_FAILED', 'This browser does not support ImageBitmap decoding.');
    }
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  },

  createSurface(width, height): BrowserSurface {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new ImageEngineError('CANVAS_UNAVAILABLE', 'This browser does not support OffscreenCanvas processing.');
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new ImageEngineError('CANVAS_UNAVAILABLE', 'A 2D OffscreenCanvas is unavailable.');
    return { surface: canvas, canvas, context };
  },

  render(surface, decoded, dimensions: ImageDimensions, backgroundColor, transform) {
    const { context } = surface;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
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
    context.drawImage(
      decoded.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
  },

  encode(surface, mimeType, quality) {
    return surface.canvas.convertToBlob({ type: mimeType, quality });
  },
};

export async function detectOutputCapabilities(): Promise<OutputCapabilities> {
  if (typeof OffscreenCanvas === 'undefined') {
    return { jpeg: false, png: false, webp: false, avif: false };
  }
  const canvas = new OffscreenCanvas(1, 1);
  if (!canvas.getContext('2d')) return { jpeg: false, png: false, webp: false, avif: false };
  const formats = ['jpeg', 'png', 'webp', 'avif'] as const;
  const results = await Promise.all(formats.map(async (format) => {
    const mimeType = `image/${format === 'jpeg' ? 'jpeg' : format}`;
    try {
      const blob = await canvas.convertToBlob({ type: mimeType, quality: 0.8 });
      return [format, blob.type === mimeType] as const;
    } catch {
      return [format, false] as const;
    }
  }));
  const capabilities: OutputCapabilities = { jpeg: false, png: false, webp: false, avif: false };
  for (const [format, available] of results) capabilities[format] = available;
  return capabilities;
}
