# Development

## Environment

- Node.js 20.19+ or 22.12+
- npm
- Chrome for unpacked-extension testing

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

For local Chrome testing, run `npm run dev`, open `chrome://extensions`, enable Developer mode, and load `.output/chrome-mv3-dev`.

## Project conventions

- WXT entrypoints live in `entrypoints/`.
- Shared features and code live in `src/`.
- Add browser permissions only when a feature needs them. Use optional origin grants for site access.
- Keep user-facing failures actionable and log diagnostics without logging image content.
