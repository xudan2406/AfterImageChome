export const MAX_BATCH_FILES = 100;
export const MAX_BATCH_SOURCE_BYTES = 500 * 1024 * 1024;
export const MAX_BATCH_OUTPUT_BYTES = 500 * 1024 * 1024;

export function getBatchImportError(
  currentCount: number,
  currentBytes: number,
  incomingCount: number,
  incomingBytes: number,
): string | null {
  if (currentCount + incomingCount > MAX_BATCH_FILES) {
    return `A batch can contain at most ${MAX_BATCH_FILES} images. Remove tasks before adding more.`;
  }
  if (currentBytes + incomingBytes > MAX_BATCH_SOURCE_BYTES) {
    return 'A batch can contain up to 500 MB of source images. Remove tasks or choose smaller files.';
  }
  return null;
}
