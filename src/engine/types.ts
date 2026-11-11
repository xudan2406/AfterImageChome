export const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type DetectedFormat = OutputFormat | 'unknown';
export type OutputCapabilities = Record<OutputFormat, boolean>;

export type ResizeOptions = {
  width?: number;
  height?: number;
  preserveAspectRatio: boolean;
};

export type ImageTransformOptions = {
  crop?: { x: number; y: number; width: number; height: number };
  rotation?: 0 | 90 | 180 | 270;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};

export type ImageProcessingOptions = {
  format: OutputFormat;
  quality: number;
  resize: ResizeOptions;
  backgroundColor: string;
  transform?: ImageTransformOptions;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type ImageInspection = ImageDimensions & {
  format: DetectedFormat;
};

export type DecodedImage<TImage> = ImageDimensions & {
  image: TImage;
  close: () => void;
};

export interface ProcessingSurface {
  readonly surface: unknown;
}

export interface ImageProcessingPlatform<TImage, TSurface extends ProcessingSurface> {
  decode(file: Blob): Promise<DecodedImage<TImage>>;
  createSurface(width: number, height: number): TSurface;
  render(
    surface: TSurface,
    image: DecodedImage<TImage>,
    dimensions: ImageDimensions,
    backgroundColor?: string,
    transform?: ImageTransformOptions,
  ): void;
  encode(surface: TSurface, mimeType: string, quality: number): Promise<Blob>;
}

export type ImageProcessingResult = {
  blob: Blob;
  format: OutputFormat;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  outputSize: number;
  reductionPercentage: number;
};

export type ImageEngineErrorCode =
  | 'INVALID_OPTIONS'
  | 'UNSUPPORTED_INPUT'
  | 'DECODE_FAILED'
  | 'IMAGE_TOO_LARGE'
  | 'CANVAS_UNAVAILABLE'
  | 'CODEC_UNAVAILABLE'
  | 'ENCODE_FAILED';

export class ImageEngineError extends Error {
  constructor(
    public readonly code: ImageEngineErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ImageEngineError';
  }
}
