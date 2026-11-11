# Installation

## Install a development build

1. Install Node.js 20.19+ or 22.12+ and npm.
2. From the project root, run:

   ```sh
   npm install
   npm run dev
   ```

3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Choose **Load unpacked** and select `.output/chrome-mv3-dev`.
5. Pin AfterImage if desired, open its Popup, then choose **Open workspace**.

## Build a production package

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run zip
```

For local production testing, use **Load unpacked** with `.output/chrome-mv3`. Do not upload or publish the ZIP as part of this procedure.

## Update or remove

For an unpacked build, rebuild and use **Reload** on `chrome://extensions`. To remove it, choose **Remove** on that page. Before removing, export any output you want to keep; IndexedDB history is local to the extension installation/profile.

For a store installation, use Chrome's extension management page to update or remove the extension.
