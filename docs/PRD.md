# Product Requirements

## Target users

People who routinely save, prepare, or convert images while browsing, including creators, researchers, students, and small teams that prefer not to upload source images to a third party.

## User problem and value

Common image tasks are scattered across websites, desktop utilities, and browser downloads. AfterImage aims to provide one approachable browser workspace with local-first processing and clear permission boundaries.

## Product principles

- Process ordinary images locally; no account or mandatory service.
- Ask for browser access only when a user invokes a web-image feature.
- Make task state and failures visible; never imply an operation succeeded when it did not.
- Keep extension UI responsive and explain capability limitations.

## Functional requirements

### Foundation implemented

- Chrome Manifest V3 extension built with WXT.
- React Popup and Side Panel.
- Page image context menus and temporary source handoff.
- User-triggered page-image discovery with temporary active-tab access.
- Local image picker, drag-and-drop, and preview.
- Functional workspace navigation and privacy-oriented empty states.

### MVP remaining

- Local conversion, compression, resize, and format capability detection.
- Queue, bounded batch processing, retries, cancellation, and ZIP export.
- IndexedDB task history, retention, and clear-history controls.
- Context-menu remote image acquisition with robust CORS and size handling, using origin-specific optional permission only when implemented.
- English and Simplified Chinese localization, accessibility review, and automated coverage.

## Non-functional requirements

- Strict TypeScript; production WXT build.
- Minimal required permissions and optional per-site access.
- Clear, keyboard-accessible controls and responsive layout.
- Avoid uploading image content or retaining originals without user intent.

## Roadmap

1. MVP image engine and browser integration.
2. Crop, transforms, adjustments, watermarking, presets, undo/redo.
3. Local AI interfaces and optional inference; no cloud AI in the MVP.
