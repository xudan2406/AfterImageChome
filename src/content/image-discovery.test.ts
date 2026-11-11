import { describe, expect, it } from 'vitest';
import { isPageImageDiscoveryAvailable } from './image-discovery';

describe('page image discovery availability', () => {
  it.each([
    ['https://example.com/gallery', true],
    ['http://localhost:3000', true],
    ['chrome://extensions', false],
    ['chrome-extension://abcdefghijklmnop/page.html', false],
    ['about:blank', false],
    ['not a URL', false],
    [undefined, false],
  ])('returns %s support as %s', (url, expected) => {
    expect(isPageImageDiscoveryAvailable(url)).toBe(expected);
  });
});
