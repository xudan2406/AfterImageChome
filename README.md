# AfterImage

AfterImage is a privacy-first image workspace for Chrome. It inspects, converts, resizes, and compresses local images, supports serial batches, and keeps completed output history on the device.

## Features

- Import one image at a time in Home, or up to 100 images in Batch by file picker or drag-and-drop.
- Detect image formats from file signatures rather than filenames.
- Convert to JPEG, PNG, or WebP; offer AVIF output only when the browser's real encoder supports it.
- Adjust quality, dimensions, aspect ratio, and the background used when converting transparency to JPEG.
- In Compress mode, choose whether to keep the source format or compress into another supported format.
- Switch between Convert, Compress, and Resize modes in one Home workspace without dropping the selected image.
- Crop by source-pixel bounds, rotate in 90° steps, and flip horizontally or vertically in the local Editor.
- Process images in a short-lived Web Worker; cancel running/queued tasks and retry failures.
- Review real batch totals, target formats, output sizes, and size changes; retry failures and download selected results.
- Download individual outputs or export a ZIP in a separate Worker.
- Keep up to 100 recent history entries and 500 MB of output Blobs in IndexedDB, including operation metadata. Delete individual records or clear history.
- Use image context-menu actions. Fetching a page image requires a user gesture and optional permission for that exact site origin.
- Honor the operating-system light/dark color scheme.

The per-image input limit is 100 MB and the decoded/output pixel limit is 100 megapixels. A batch is limited to 100 images and 500 MB total input/output. ZIP export is limited to 500 MB. Browser codecs and available memory may impose lower practical limits.

## Technology

- WXT, Vite, React 19, strict TypeScript
- Chrome Manifest V3, Chrome Side Panel, Web Workers, OffscreenCanvas, ImageBitmap
- Tailwind CSS v4, Lucide React, JSZip
- Vitest and `@napi-rs/canvas` for real image codec tests

The current UI is English-only. Store and product copy is available in English and Simplified Chinese under `docs/`.
Editor watermark, brightness/contrast/saturation adjustments, and presets are planned but not implemented. AI image processing, subscriptions, credits, and cloud services are not part of this release.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- Chrome 116 or later

## Install and run

```sh
npm install
npm run dev
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3-dev`.

Build the production extension:

```sh
npm run build
```

The production output is `.output/chrome-mv3`. Create a distributable ZIP with `npm run zip`. This project does not publish to the Chrome Web Store automatically.

## Quality checks

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm test
npm run build
npm audit
```

See [docs/TESTING.md](./docs/TESTING.md) for what automated tests cover and the remaining manual Chrome checks. Release copy and operational requirements are in [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).

## Privacy and permissions

Local processing does not upload image bytes. Completed outputs and task metadata are stored in IndexedDB under the retention limits above. Context-menu fetches omit credentials and referrers, reject redirects, and may fail if the site blocks extension access. Hostname checks cannot prevent DNS rebinding; do not treat remote-image fetching as a general-purpose URL fetch service.

Read the [privacy policy](./docs/PRIVACY_POLICY.md) and [permission rationale](./docs/PERMISSIONS.md) before distribution.
