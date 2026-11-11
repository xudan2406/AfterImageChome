# Security

For the canonical permission list and Chrome Web Store rationale, see [PERMISSIONS.md](./PERMISSIONS.md).

## Processing boundary

Image inspection and processing run in a short-lived extension Web Worker, and decoded `ImageBitmap` resources are closed after each operation. Local image content is not uploaded to AfterImage. A user-triggered webpage-image request goes to the selected source site; the user-facing retention and privacy terms are in [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

## Cross-origin handling

Page discovery reads image element URLs and intrinsic dimensions in the active tab after a user action, using temporary `activeTab` access. It does not fetch page images. A context-menu fetch first asks for optional access to that image's exact origin; denial leaves local file import available. Requests omit cookies, reject redirects, omit the referrer, accept only JPEG/PNG/WebP/AVIF MIME types, and enforce a 100 MB streamed-byte limit. Local/private IP literals and common local hostnames are rejected. The browser's host-permission and CORS policies may still prevent access; failures are reported rather than bypassed.

## Threat model and limitations

- Page DOM values are untrusted; displayed source URLs are text, not executable markup.
- Only ordinary web page origins are eligible for discovery; extension, browser-internal, and other schemes are rejected.
- A remote host can mislabel or change its content; fetched bytes still undergo signature and decoder validation in the image engine.
- Hostname validation cannot reliably prevent DNS rebinding to private infrastructure. Remote-fetch support is user initiated, limited by explicit per-origin browser permission, does not send site credentials, and is subject to browser network isolation. Do not treat it as a general-purpose URL fetch service.
- No remote executable code, `eval`, analytics, or image upload is included.
