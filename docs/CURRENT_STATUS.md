# AfterImage v0.2 — Current Status

**Baseline date:** November 11, 2026

This is the source of truth for implemented product scope. See [PRD.md](./PRD.md) for product direction, [ARCHITECTURE.md](./ARCHITECTURE.md) for implementation design, and [TESTING.md](./TESTING.md) for verification details.

## Product position

AfterImage is a local-first Chrome image workspace. Core image processing does not upload local images or require an account. Web-image retrieval is a separate, user-triggered flow that requests optional permission for the selected origin.

## v0.2 feature status

| Area | Status | Current scope and boundary |
| --- | --- | --- |
| Extension foundation | Implemented | WXT, React, Manifest V3, Popup, Side Panel, background service worker, context menus, and on-demand page-image discovery (not a persistent content script). |
| Home and image engine | Implemented | Local import/preview, signature detection, JPEG/PNG/WebP conversion, AVIF input and conditional AVIF output, compression, resize, aspect-ratio handling, and download through the shared Worker engine. |
| Batch | Implemented | Multi-image import, serial queue, actual task states, cancellation, retry, shared settings, four presets, selected downloads, and ZIP export. Limits: 100 images, 500 MiB input, 500 MiB output, and 500 MiB ZIP. |
| History | Implemented | IndexedDB persistence, up to 100 records/500 MiB of output Blobs, filename search, operation/status filters, date sorting, output downloads, individual deletion, and confirmed clear. Browser quota recovery is not implemented. |
| Editor | Implemented | Drag and numeric crop, quarter-turn rotation, horizontal/vertical flip, bounded undo/redo, reset, and real output through the shared image Worker. Watermark, tonal adjustments, crop-ratio presets, and Editor presets remain unimplemented. |
| Settings | Not implemented | Navigation remains a clear placeholder; no user preferences are persisted. |
| AI / Pro / Cloud | Out of scope | No AI processing, account, subscription, credits, or cloud image processing is implemented. |

## Verification and release state

Automated tests, TypeScript, lint, and the production build pass; exact results and coverage boundaries are recorded in [TESTING.md](./TESTING.md). The latest Batch, History, and Editor UI refinements have not been manually verified in Chrome; historical browser observations do not count as acceptance.

The project is **not ready for an unqualified public release** until the required manual acceptance in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) is complete. Dependency audits and a distributable ZIP were not regenerated for the latest Editor changes.
