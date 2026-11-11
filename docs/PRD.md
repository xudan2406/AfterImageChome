# Product Requirements — v0.2

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

### Product foundation

- Chrome Manifest V3 extension built with WXT.
- React Popup and Side Panel.
- Page image context menus and temporary source handoff.
- User-triggered page-image discovery with temporary active-tab access.
- Local image picker, drag-and-drop, and preview.
- Functional workspace navigation and privacy-oriented empty states.

### Core product scope

Provide single-image processing, bounded batch workflows, saved output history, basic local editing, and user-invoked browser image actions. The exact implemented scope and deferred features are maintained in [CURRENT_STATUS.md](./CURRENT_STATUS.md).

## Non-functional requirements

- Strict TypeScript; production WXT build.
- Minimal required permissions and optional per-site access.
- Clear, keyboard-accessible controls and responsive layout.
- Avoid uploading image content or retaining originals without user intent.

## Roadmap

1. Complete remaining v0.2 workspace preferences and release acceptance without replacing the existing engine, queue, or IndexedDB.
2. Follow with separately tested Editor tools and accessibility improvements.
3. Keep AI, accounts, subscriptions, credits, and cloud processing out of the current release scope.
