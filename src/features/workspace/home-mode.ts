import type { ResizeOptions } from '../../engine/types';

export type HomeMode = 'convert' | 'compress' | 'resize';

export function resizeOptionsForMode(
  mode: HomeMode,
  width: string,
  height: string,
  preserveAspectRatio: boolean,
): ResizeOptions {
  if (mode !== 'resize') return { preserveAspectRatio: true };
  return {
    width: width ? Number(width) : undefined,
    height: height ? Number(height) : undefined,
    preserveAspectRatio,
  };
}
