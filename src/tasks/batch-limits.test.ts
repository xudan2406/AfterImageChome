import { describe, expect, it } from 'vitest';
import { getBatchImportError, MAX_BATCH_FILES, MAX_BATCH_SOURCE_BYTES } from './batch-limits';

describe('batch import limits', () => {
  it('accepts a batch of exactly 100 images', () => {
    expect(getBatchImportError(0, 0, MAX_BATCH_FILES, 0)).toBeNull();
  });

  it('rejects an import that would exceed 100 images without partially importing it', () => {
    expect(getBatchImportError(0, 0, MAX_BATCH_FILES + 1, 0)).toContain('at most 100 images');
    expect(getBatchImportError(MAX_BATCH_FILES, 0, 1, 0)).toContain('at most 100 images');
  });

  it('accepts a total source size of exactly 500 MB and rejects anything larger', () => {
    expect(getBatchImportError(0, 0, 1, MAX_BATCH_SOURCE_BYTES)).toBeNull();
    expect(getBatchImportError(0, 0, 1, MAX_BATCH_SOURCE_BYTES + 1)).toContain('up to 500 MB');
    expect(getBatchImportError(1, MAX_BATCH_SOURCE_BYTES, 1, 1)).toContain('up to 500 MB');
  });
});
