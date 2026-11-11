import { sanitizeFilename } from '../utils/sanitize-filename';

const MAX_REMOTE_IMAGE_BYTES = 100 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 60_000;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function validateRemoteImageUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new Error('The selected image URL is invalid.', { cause });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS image URLs are supported.');
  }
  if (url.username || url.password) throw new Error('Image URLs containing credentials are not allowed.');
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new Error('Images hosted on localhost or a private network cannot be fetched by AfterImage.');
  }
  return url;
}

export async function requestImageHostPermission(url: URL): Promise<boolean> {
  const originPattern = `${url.origin}/*`;
  return chrome.permissions.request({ origins: [originPattern] });
}

export async function fetchRemoteImage(url: URL, signal?: AbortSignal): Promise<File> {
  const requestController = new AbortController();
  const timeout = setTimeout(
    () => requestController.abort(new DOMException('The image request timed out after 60 seconds.', 'TimeoutError')),
    REMOTE_IMAGE_TIMEOUT_MS,
  );
  const abortFromCaller = () => requestController.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(url.href, {
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: requestController.signal,
      });
    } catch (cause) {
      if (requestController.signal.aborted) {
        const reason = requestController.signal.reason;
        throw reason instanceof Error ? reason : new DOMException('The image request was cancelled.', 'AbortError');
      }
      throw new Error('The image could not be fetched. The site may block extension access, require authentication, or no longer host the image.', { cause });
    }
    if (!response.ok) throw new Error(`The image host returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
      throw new Error('The remote resource is not a supported JPEG, PNG, WebP, or AVIF image.');
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error('Remote images larger than 100 MB cannot be fetched.');
    }
    if (!response.body) throw new Error('The image host returned an empty response.');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REMOTE_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error('Remote images larger than 100 MB cannot be fetched.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (total === 0) throw new Error('The image host returned an empty image.');

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const filename = safeFilename(url.pathname.split('/').pop() || 'web-image', contentType);
    return new File([bytes.buffer], filename, { type: contentType });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function safeFilename(filename: string, mimeType: string): string {
  const decodedName = (() => {
    try {
      return decodeURIComponent(filename);
    } catch {
      return 'web-image';
    }
  })();
  const cleanName = sanitizeFilename(decodedName);
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
  return /\.[a-z\d]{2,5}$/i.test(cleanName) ? cleanName : `${cleanName}.${extension}`;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa')
  ) return true;
  if (host.includes(':')) return true;

  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}
