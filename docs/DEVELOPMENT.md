# Development and installation

## Environment

- Node.js 20.19+ or 22.12+
- npm
- Chrome 116+ for unpacked-extension testing

## Setup

```sh
npm install
```

## Commands

```sh
npm run dev          # WXT development build
npm run build        # Chrome MV3 production build
npm run build:firefox
npm run zip          # Package the Chrome build
npm run typecheck    # WXT-generated TypeScript project check
npm run lint         # ESLint
npm run test:unit    # Focused unit tests
npm run test:integration # Real image-codec and ZIP integration tests
npm test             # Complete Vitest suite
npm audit            # Audit production and development dependencies
npm run test:watch   # Watch tests during development
```

## Install an unpacked build

1. Run `npm run dev`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select `.output/chrome-mv3-dev`.
4. Pin AfterImage if desired, open its Popup, then choose **Open workspace**.

For a production package, run the validation commands above, then `npm run build` and `npm run zip`. Load `.output/chrome-mv3` to test the production build. Do not upload or publish the ZIP as part of local testing.

To update an unpacked build, rebuild and choose **Reload** on `chrome://extensions`. To remove it, choose **Remove** there. IndexedDB history is local to the extension installation/profile and may be removed with the extension.

## Project conventions

- WXT entrypoints live in `entrypoints/`.
- Shared features and code live in `src/`.
- Add browser permissions only when a feature needs them. Use optional origin grants for site access.
- Keep user-facing failures actionable and log diagnostics without logging image content.
