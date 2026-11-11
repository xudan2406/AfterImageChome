# Testing

## Automated test coverage

Run the focused suites or all checks:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm test
npm run build
```

- Unit tests cover image dimension validation, remote URL/permission and response limits, page-image discovery eligibility, worker cancellation/termination, queue serialism/cancellation/failure isolation at a 100-task workload, IndexedDB persistence/retention, and ZIP filename behavior.
- Integration tests encode and decode actual PNG, JPEG, and WebP pixel images through `@napi-rs/canvas`, verify crop/rotation/flips, resize/quality/alpha behavior, and open generated ZIPs to check actual file content. AVIF behavior is tested only when the local adapter supports it.
- The production build targets Chrome Manifest V3 and bundles image and ZIP Workers.

These are Node/Vitest tests; they are not a substitute for testing the extension in Chrome.

## Browser codec smoke test

A prior Chrome 157 `OffscreenCanvas` smoke check encoded and decoded a real 192 × 128 pixel test image. JPEG changed from 7,051 bytes at 95% quality to 1,643 bytes at 20%; WebP changed from 3,980 to 1,412 bytes. PNG remained lossless at 30,968 bytes. Chrome decoded a 306-byte AVIF sample and converted it to WebP. AVIF encoding returned `image/png`, so AVIF output was correctly disabled. This was a browser codec smoke test, not a full installed-extension test.

## Required manual Chrome acceptance

Follow the step-by-step list in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md), including:

- Install `.output/chrome-mv3` as an unpacked extension in a clean Chrome profile.
- Exercise Popup and Side Panel navigation, including narrow Side Panel widths and light/dark system themes.
- Process real images near the 100 MB/100-megapixel limits and reject malformed/over-limit images.
- Import/process 100 small images; inspect real task state, individual downloads, ZIP contents, cancellation, retry, history persistence, and memory release.
- Test browser permission prompts, permission denial/revocation, CORS failures, redirects, HTTP errors, unsupported MIME types, and large remote bodies.
- Test current Chrome and the minimum supported Chrome version. AVIF output varies by browser.

## Recorded automated QA results

Latest verified run after the P0.5 refinement (November 11, 2026, approximately 20:25 local time):

| Check | Result |
| --- | --- |
| Strict TypeScript | Pass |
| ESLint | Pass |
| Unit tests | Pass (7 files, 38 tests) |
| Integration tests | Pass (2 files, 32 tests) |
| Full Vitest suite | Pass (9 files, 70 tests) |
| Chrome MV3 production build | Pass |
| Chrome Web Store ZIP package | Pass (14 files; 162.88 kB, including both Workers and four provided icon sizes) |
| `npm audit --omit=dev` | Pass (0 known vulnerabilities) |
| Full dependency audit | Pass (0 known vulnerabilities) |
| Installed Chrome smoke checks | Existing Chrome 157 observations only; this refinement has not yet been manually exercised in Chrome. |

P0.5 added real engine transform tests for crop, 90° rotation, horizontal and vertical flips, and invalid crop bounds, plus Home-mode tests verifying Convert/Compress do not inherit hidden resize values. The WorkspaceApp, Home mode controls, batch statistics/actions, history metadata, and Editor UI compile and pass lint, but no dedicated React DOM/browser UI tests are configured in this repository.

## Recorded manual Chrome checks

On November 11, 2026, the production build was loaded unpacked in Google Chrome 157.0.8103.39 (arm64, macOS 27.2.1).

- Popup rendered and its **Open workspace** action opened the Side Panel.
- Side Panel loaded the home, batch, and history views.
- A generated 192 × 128 PNG was processed in the image Worker to WebP (9.4 KB → 1.2 KB, 87.3% smaller); Chrome completed the individual download.
- Closing and reopening the Side Panel showed the saved history record and its output metadata.
- Two generated PNGs were batch processed and exported. The downloaded ZIP opened successfully and contained `one.webp` and `two.webp` with non-empty image data.
- A 100-image batch completed with 100 completed, 0 waiting, 0 failed, and 0 cancelled tasks. The downloaded ZIP contained exactly 100 WebP files (66,606 bytes total).
- A malformed `.png` was rejected with an unsupported-image error. A sparse 100 MiB + 1 byte file was rejected with the over-100-MB message. This does not cover valid images near the byte or pixel limit.
- The webpage-image context-menu action displayed Chrome's optional host-permission prompt for `placehold.co`, with the text “Read and change your data on placehold.co.” The first prompt was denied. After the user confirmed the origin was permitted, the same context-menu action fetched a 1.9 KB PNG and converted it to a 1.1 KB WebP successfully; no second prompt appeared.
- Chrome Task Manager showed the AfterImage extension process at 55.4 MB while the Side Panel was open. After closing the Side Panel, filtering Task Manager for AfterImage returned no process row, including after the 100-image run, consistent with the workspace renderer and its Workers being released.

These are focused smoke checks, not full manual acceptance. Cancellation/retry and individual downloads from the 100-image batch, valid images near the byte/pixel limits, permission-denial error handling, revoked permission, CORS/redirect/HTTP/MIME/oversized-response cases, ZIP size-limit refusal, narrow-panel and dark-theme layout, and Chrome 116 remain untested. Chrome's displayed memory value includes the extension process and is not a heap-level measurement. System theme switching was not available in this browser session.

The production build and ZIP were regenerated with the user-provided icon source at `assets/brand/extension-icon-source.png`, resized to 16, 32, 48, and 128 px. The final ZIP contains 14 files (162.88 kB) including the MV3 manifest, both Workers, UI bundles, and all four icon sizes.

## Follow-up acceptance attempt

Earlier QA launch attempts in this environment did not register the extension in a fresh isolated Chrome profile. Chrome 157.0.8103.39 is available; Chrome 116 is not. The P0.5 changes have not been manually exercised in an installed extension. Therefore narrow/dark Side Panel layout, UI batch cancel/retry/download-selected, history operation display and deletion, crop/rotate/flip controls, and end-to-end transformed-image downloads remain unverified in Chrome. Existing Chrome observations above predate this refinement and must not be interpreted as validation of the new UI.
