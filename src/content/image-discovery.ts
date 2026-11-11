export type PageImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function isPageImageDiscoveryAvailable(pageUrl?: string): boolean {
  if (!pageUrl) return false;
  try {
    const protocol = new URL(pageUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function collectPageImages(): PageImage[] {
  const images = Array.from(document.images);
  const unique = new Map<string, PageImage>();

  for (const image of images) {
    const src = image.currentSrc || image.src;
    if (!src || !/^https?:/.test(src)) continue;
    if (!unique.has(src)) {
      unique.set(src, {
        src,
        alt: image.alt,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }
  }

  return Array.from(unique.values());
}
