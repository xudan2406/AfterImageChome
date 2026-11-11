import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRemoteImage,
  requestImageHostPermission,
  validateRemoteImageUrl,
} from './remote-image';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateRemoteImageUrl', () => {
  it('allows ordinary HTTP(S) image URLs', () => {
    expect(validateRemoteImageUrl('https://images.example.com/photo.png').href)
      .toBe('https://images.example.com/photo.png');
  });

  it.each([
    'file:///tmp/image.png',
    'https://user:password@example.com/image.png',
    'http://localhost/image.png',
    'http://127.0.0.1/image.png',
    'http://192.168.1.4/image.png',
    'http://[::ffff:127.0.0.1]/image.png',
    'http://[::1]/image.png',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateRemoteImageUrl(url)).toThrow();
  });
});

describe('remote image access', () => {
  it('requests only the selected image origin', async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request,
      },
    });

    await expect(requestImageHostPermission(new URL('https://images.example.com/a.png'))).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ['https://images.example.com/*'] });
  });

  it('requests permission without an asynchronous preflight that can lose user activation', async () => {
    const request = vi.fn().mockResolvedValue(true);
    const contains = vi.fn();
    vi.stubGlobal('chrome', {
      permissions: {
        contains,
        request,
      },
    });

    await expect(requestImageHostPermission(new URL('https://images.example.com/a.png'))).resolves.toBe(true);
    expect(contains).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith({ origins: ['https://images.example.com/*'] });
  });

  it('returns actual image bytes and rejects unsupported MIME types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      { headers: { 'content-type': 'image/png' } },
    )));

    const file = await fetchRemoteImage(new URL('https://images.example.com/photo.png'));
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(4);
    await expect(file.arrayBuffer()).resolves.toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not image', {
      headers: { 'content-type': 'text/html' },
    })));
    await expect(fetchRemoteImage(new URL('https://images.example.com/photo.png'))).rejects.toThrow('not a supported');
  });

  it('rejects oversized and failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(101 * 1024 * 1024) },
    })));
    await expect(fetchRemoteImage(new URL('https://images.example.com/large.png'))).rejects.toThrow('larger than 100 MB');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(fetchRemoteImage(new URL('https://images.example.com/private.png'))).rejects.toThrow('HTTP 403');
  });

  it('aborts stalled remote requests after the bounded timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })));

    const request = fetchRemoteImage(new URL('https://images.example.com/stalled.png'));
    const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
  });
});
