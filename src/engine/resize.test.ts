import { describe, expect, it } from 'vitest';
import { calculateOutputDimensions } from './resize';
import { ImageEngineError } from './types';

describe('calculateOutputDimensions', () => {
  it('keeps the aspect ratio when only one dimension is provided', () => {
    expect(calculateOutputDimensions(
      { width: 1200, height: 800 },
      { width: 600, preserveAspectRatio: true },
    )).toEqual({ width: 600, height: 400 });
  });

  it('fits inside both requested dimensions while preserving aspect ratio', () => {
    expect(calculateOutputDimensions(
      { width: 1200, height: 800 },
      { width: 500, height: 500, preserveAspectRatio: true },
    )).toEqual({ width: 500, height: 333 });
  });

  it('uses the exact requested dimensions when aspect ratio is disabled', () => {
    expect(calculateOutputDimensions(
      { width: 1200, height: 800 },
      { width: 300, height: 240, preserveAspectRatio: false },
    )).toEqual({ width: 300, height: 240 });
  });

  it('retains the original dimensions when no resize is requested', () => {
    expect(calculateOutputDimensions(
      { width: 1200, height: 800 },
      { preserveAspectRatio: true },
    )).toEqual({ width: 1200, height: 800 });
  });

  it('rejects zero, negative, and fractional dimensions', () => {
    for (const width of [0, -1, 1.5]) {
      expect(() => calculateOutputDimensions(
        { width: 100, height: 100 },
        { width, preserveAspectRatio: true },
      )).toThrow(ImageEngineError);
    }
  });
});
