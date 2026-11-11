import { describe, expect, it } from 'vitest';
import { getBatchPresetSettings } from './batch-presets';
import type { OutputCapabilities } from '../engine/types';

const allFormats: OutputCapabilities = { jpeg: true, png: true, webp: true, avif: true };

describe('batch preset settings', () => {
  it('uses editable WebP settings for web optimization without resizing', () => {
    expect(getBatchPresetSettings('web-optimization', allFormats, 'jpeg')).toEqual({
      format: 'webp',
      quality: 0.82,
      width: '',
      height: '',
      keepAspectRatio: true,
    });
  });

  it('uses a widely compatible JPEG setting for social media without inventing dimensions', () => {
    expect(getBatchPresetSettings('social-media', allFormats, 'webp')).toMatchObject({
      format: 'jpeg',
      quality: 0.88,
      width: '',
      height: '',
      keepAspectRatio: true,
    });
  });

  it('keeps the selected supported format for high quality', () => {
    expect(getBatchPresetSettings('high-quality', allFormats, 'png').format).toBe('png');
    expect(getBatchPresetSettings('high-quality', allFormats, 'png').quality).toBe(0.95);
  });

  it('prefers WebP for smaller output but falls back to an available encoder', () => {
    expect(getBatchPresetSettings('small-file-size', allFormats, 'jpeg')).toMatchObject({
      format: 'webp',
      quality: 0.65,
    });
    expect(getBatchPresetSettings(
      'small-file-size',
      { jpeg: false, png: true, webp: false, avif: false },
      'webp',
    ).format).toBe('png');
  });

  it('uses the current supported format when a preset format is unavailable', () => {
    expect(getBatchPresetSettings(
      'web-optimization',
      { jpeg: true, png: false, webp: false, avif: false },
      'jpeg',
    ).format).toBe('jpeg');
  });
});
