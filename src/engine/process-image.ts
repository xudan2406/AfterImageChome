import { detectImageFormat, mimeTypeForFormat } from './format';
import { calculateOutputDimensions } from './resize';
import {
  ImageEngineError,
  type ImageProcessingOptions,
  type ImageProcessingPlatform,
  type ImageProcessingResult,
  type ImageTransformOptions,
  type ProcessingSurface,
  type ImageInspection,
} from './types';

export const MAX_IMAGE_PIXELS = 100_000_000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const QUALITY_MIN = 0.1;
const QUALITY_MAX = 1;
const HEX_COLOR = /^#[\da-f]{6}$/i;

export async function inspectImage<TImage, TSurface extends ProcessingSurface>(
  file: File,
  platform: ImageProcessingPlatform<TImage, TSurface>,
): Promise<ImageInspection> {
  if (file.size === 0) {
    throw new ImageEngineError('UNSUPPORTED_INPUT', 'The selected file is empty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageEngineError('IMAGE_TOO_LARGE', 'Images larger than 100 MB cannot be processed.');
  }
  const format = await detectImageFormat(file);
  if (format === 'unknown') {
    throw new ImageEngineError('UNSUPPORTED_INPUT', 'This file is not a supported JPEG, PNG, WebP, or AVIF image.');
  }
  let decoded;
  try {
    decoded = await platform.decode(file);
  } catch (cause) {
    throw new ImageEngineError('DECODE_FAILED', `The ${format.toUpperCase()} image could not be decoded by this browser.`, { cause });
  }
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
      throw new ImageEngineError('IMAGE_TOO_LARGE', 'This image exceeds the safe processing limit of 100 megapixels.');
    }
    return { format, width: decoded.width, height: decoded.height };
  } finally {
    decoded.close();
  }
}

export async function processImage<TImage, TSurface extends ProcessingSurface>(
  file: File,
  options: ImageProcessingOptions,
  platform: ImageProcessingPlatform<TImage, TSurface>,
): Promise<ImageProcessingResult> {
  validateOptions(file, options);
  const detectedFormat = await detectImageFormat(file);
  if (detectedFormat === 'unknown') {
    throw new ImageEngineError('UNSUPPORTED_INPUT', 'This file is not a supported JPEG, PNG, WebP, or AVIF image.');
  }

  let decoded;
  try {
    decoded = await platform.decode(file);
  } catch (cause) {
    throw new ImageEngineError('DECODE_FAILED', `The ${detectedFormat.toUpperCase()} image could not be decoded by this browser.`, { cause });
  }

  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
      throw new ImageEngineError('IMAGE_TOO_LARGE', 'This image exceeds the safe processing limit of 100 megapixels.');
    }

    const transform = normalizeTransform(options.transform, decoded.width, decoded.height);
    const rotated = transform.rotation === 90 || transform.rotation === 270;
    const transformedSource = {
      width: rotated ? transform.crop.height : transform.crop.width,
      height: rotated ? transform.crop.width : transform.crop.height,
    };
    const dimensions = calculateOutputDimensions(transformedSource, options.resize);
    if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      throw new ImageEngineError('IMAGE_TOO_LARGE', 'The requested output exceeds the safe processing limit of 100 megapixels.');
    }

    const mimeType = mimeTypeForFormat(options.format);
    const doesNotNeedReencoding = detectedFormat === options.format
      && dimensions.width === decoded.width
      && dimensions.height === decoded.height
      && (options.format === 'png' || options.quality === QUALITY_MAX)
      && isIdentityTransform(transform, decoded.width, decoded.height);
    if (doesNotNeedReencoding) {
      const blob = file.slice(0, file.size, mimeType);
      return {
        blob,
        format: options.format,
        width: dimensions.width,
        height: dimensions.height,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        originalSize: file.size,
        outputSize: blob.size,
        reductionPercentage: 0,
      };
    }

    let surface: TSurface;
    try {
      surface = platform.createSurface(dimensions.width, dimensions.height);
      platform.render(
        surface,
        decoded,
        dimensions,
        options.format === 'jpeg' ? options.backgroundColor : undefined,
        transform,
      );
    } catch (cause) {
      throw new ImageEngineError('CANVAS_UNAVAILABLE', 'The browser could not allocate or render this image. Try smaller dimensions.', { cause });
    }

    let blob: Blob;
    try {
      blob = await platform.encode(surface, mimeType, options.quality);
    } catch (cause) {
      throw new ImageEngineError('ENCODE_FAILED', `The browser failed to encode this image as ${options.format.toUpperCase()}.`, { cause });
    }
    if (blob.type.toLowerCase() !== mimeType) {
      throw new ImageEngineError(
        'CODEC_UNAVAILABLE',
        `This browser cannot encode ${options.format.toUpperCase()} images. Choose another output format.`,
      );
    }
    if (blob.size === 0) {
      throw new ImageEngineError('ENCODE_FAILED', 'The browser returned an empty image. Try different settings.');
    }

    return {
      blob,
      format: options.format,
      width: dimensions.width,
      height: dimensions.height,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      originalSize: file.size,
      outputSize: blob.size,
      reductionPercentage: file.size > 0 ? (file.size - blob.size) / file.size * 100 : 0,
    };
  } finally {
    decoded.close();
  }
}

function normalizeTransform(
  transform: ImageTransformOptions | undefined,
  imageWidth: number,
  imageHeight: number,
): Required<ImageTransformOptions> {
  const crop = transform?.crop ?? { x: 0, y: 0, width: imageWidth, height: imageHeight };
  if (
    !Number.isInteger(crop.x) ||
    !Number.isInteger(crop.y) ||
    !Number.isInteger(crop.width) ||
    !Number.isInteger(crop.height) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > imageWidth ||
    crop.y + crop.height > imageHeight
  ) {
    throw new ImageEngineError('INVALID_OPTIONS', 'Crop coordinates must fit inside the source image.');
  }
  const rotation = transform?.rotation ?? 0;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    throw new ImageEngineError('INVALID_OPTIONS', 'Rotation must be 0, 90, 180, or 270 degrees.');
  }
  return {
    crop,
    rotation,
    flipHorizontal: transform?.flipHorizontal ?? false,
    flipVertical: transform?.flipVertical ?? false,
  };
}

function isIdentityTransform(
  transform: Required<ImageTransformOptions>,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return transform.rotation === 0 &&
    !transform.flipHorizontal &&
    !transform.flipVertical &&
    transform.crop.x === 0 &&
    transform.crop.y === 0 &&
    transform.crop.width === imageWidth &&
    transform.crop.height === imageHeight;
}

function validateOptions(file: File, options: ImageProcessingOptions): void {
  if (file.size === 0) {
    throw new ImageEngineError('UNSUPPORTED_INPUT', 'The selected file is empty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageEngineError('IMAGE_TOO_LARGE', 'Images larger than 100 MB cannot be processed.');
  }
  if (!Number.isFinite(options.quality) || options.quality < QUALITY_MIN || options.quality > QUALITY_MAX) {
    throw new ImageEngineError('INVALID_OPTIONS', 'Image quality must be between 10% and 100%.');
  }
  if (!HEX_COLOR.test(options.backgroundColor)) {
    throw new ImageEngineError('INVALID_OPTIONS', 'Choose a valid six-digit background color.');
  }
}
