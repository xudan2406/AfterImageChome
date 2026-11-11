import { ImageEngineError, type ImageDimensions, type ResizeOptions } from './types';

export function calculateOutputDimensions(
  original: ImageDimensions,
  resize: ResizeOptions,
): ImageDimensions {
  const width = resize.width;
  const height = resize.height;

  if (width === undefined && height === undefined) return original;
  if (
    (width !== undefined && (!Number.isInteger(width) || width < 1)) ||
    (height !== undefined && (!Number.isInteger(height) || height < 1))
  ) {
    throw new ImageEngineError('INVALID_OPTIONS', 'Image width and height must be positive whole numbers.');
  }

  if (width === undefined) {
    const targetHeight = height as number;
    return resize.preserveAspectRatio
      ? { width: Math.max(1, Math.round(original.width * targetHeight / original.height)), height: targetHeight }
      : { width: original.width, height: targetHeight };
  }
  if (height === undefined) {
    const targetWidth = width;
    return resize.preserveAspectRatio
      ? { width: targetWidth, height: Math.max(1, Math.round(original.height * targetWidth / original.width)) }
      : { width: targetWidth, height: original.height };
  }
  if (!resize.preserveAspectRatio) return { width, height };

  const scale = Math.min(width / original.width, height / original.height);
  return {
    width: Math.max(1, Math.round(original.width * scale)),
    height: Math.max(1, Math.round(original.height * scale)),
  };
}
