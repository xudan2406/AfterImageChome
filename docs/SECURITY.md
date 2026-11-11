# Security and Privacy

## Permission rationale

| Permission | Purpose |
| --- | --- |
| `activeTab` | Inspect the active tab after a user invokes the extension. |
| `contextMenus` | Offer image-specific actions from the browser context menu. |
| `scripting` | Run the page-image discovery function after explicit user action. |
| `sidePanel` | Open the image workspace beside the current page. |
| `storage` | Temporarily transfer a selected image URL to the Side Panel. |
| Optional `http://*/*`, `https://*/*` | Request access at runtime to the specific origin of a user-selected web image. No host is requested until the user chooses an image action and approves the browser prompt. |

## Processing and retention

Image inspection and processing run locally in a short-lived extension Web Worker; decoded `ImageBitmap` resources are closed after each operation. Original files and previews remain in memory. Up to 100 records and 500 MB of completed output Blobs are retained in IndexedDB on this device; the oldest records are removed when either limit is reached. History can be deleted per item or cleared. Nothing is uploaded to AfterImage. Context-menu source URLs are transferred temporarily through `chrome.storage.session`.

The engine rejects files over 100 MB, decoded images over 100 megapixels, unknown signatures, invalid dimensions, and unsupported encoder output MIME types. Batch input and completed output are each limited to 500 MB, with at most 100 images; ZIP archives are limited to 500 MB. PNG preserves alpha; JPEG output composites alpha onto an explicit six-digit background color.

## Cross-origin handling

Page discovery reads image element URLs and intrinsic dimensions in the active tab after a user action, using temporary `activeTab` access. It does not fetch page images. A context-menu fetch first asks for optional access to that image's exact origin; denial leaves local file import available. Requests omit cookies, reject redirects, omit the referrer, accept only JPEG/PNG/WebP/AVIF MIME types, and enforce a 100 MB streamed-byte limit. Local/private IP literals and common local hostnames are rejected. The browser's host-permission and CORS policies may still prevent access; failures are reported rather than bypassed.

## Threat model and limitations

- Page DOM values are untrusted; displayed source URLs are text, not executable markup.
- Only ordinary web page origins are eligible for discovery; extension, browser-internal, and other schemes are rejected.
- A remote host can mislabel or change its content; fetched bytes still undergo signature and decoder validation in the image engine.
- Hostname validation cannot reliably prevent DNS rebinding to private infrastructure. Remote-fetch support is user initiated, limited by explicit per-origin browser permission, does not send site credentials, and is subject to browser network isolation. Do not treat it as a general-purpose URL fetch service.
- No remote executable code, `eval`, analytics, or image upload is included.
- Browser acceptance and adversarial image tests remain outstanding.
