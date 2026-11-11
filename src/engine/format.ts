import type { DetectedFormat, OutputFormat } from './types';

const MIME_TYPES: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

const EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

export function mimeTypeForFormat(format: OutputFormat): string {
  return MIME_TYPES[format];
}

export function extensionForFormat(format: OutputFormat): string {
  return EXTENSIONS[format];
}

export function formatLabel(format: DetectedFormat): string {
  if (format === 'unknown') return 'Unknown';
  return format === 'jpeg' ? 'JPEG' : format.toUpperCase();
}

export async function detectImageFormat(file: Blob): Promise<DetectedFormat> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return 'png';
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) return 'webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
      if (['avif', 'avis'].includes(ascii(bytes, offset, 4))) return 'avif';
    }
  }
  return 'unknown';
}

export function mimeTypeToFormat(mimeType: string): OutputFormat | undefined {
  return OUTPUT_FORMATS_BY_MIME[mimeType.toLowerCase()];
}

const OUTPUT_FORMATS_BY_MIME: Record<string, OutputFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
