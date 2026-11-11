import { describe, expect, it } from 'vitest';
import { resizeOptionsForMode } from './home-mode';

describe('Home processing modes', () => {
  it.each(['convert', 'compress'] as const)('%s does not inherit hidden resize values', (mode) => {
    expect(resizeOptionsForMode(mode, '320', '240', false)).toEqual({ preserveAspectRatio: true });
  });

  it('uses the requested dimensions only in Resize mode', () => {
    expect(resizeOptionsForMode('resize', '320', '240', false)).toEqual({
      width: 320,
      height: 240,
      preserveAspectRatio: false,
    });
  });
});
