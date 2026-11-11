# Testing

This is the canonical record of automated results, historical browser observations, and outstanding coverage. [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) tracks which release gates have been completed.

## Latest automated verification

Latest run after the Batch, History, and Editor changes:

| Check | Result |
| --- | --- |
| Strict TypeScript | Pass |
| ESLint | Pass |
| Unit tests | Pass — 10 files, 52 tests |
| Integration tests | Pass — 2 files, 33 tests |
| Full Vitest suite | Pass — 14 files, 89 tests |
| Chrome MV3 production build | Pass |
| `npm audit` | Not rerun for this phase |
| Distributable ZIP | Not regenerated for this phase |
| Installed Chrome UI acceptance | Not run for this phase |

The unit and integration selectors account for 85 tests; the full run includes four additional tests from files outside those selectors.

Run the checks with:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm test
npm run build
npm audit
npm run zip
```

The unit suite covers dimension and resize validation, remote URL/permission/response limits, page-image discovery eligibility, Worker cancellation/termination, queue serialization/cancellation/retry/failure isolation (including a 100-task workload), batch limits and presets, Home mode options, History filtering and IndexedDB persistence/retention, Editor crop geometry and undo/redo, and ZIP filename and client behavior.

Integration tests encode and decode real image pixels through `@napi-rs/canvas`, exercising PNG/JPEG/WebP behavior, crop/rotation/flips, resize, quality, alpha, and generated ZIP contents. AVIF tests run only when the local adapter supports the relevant codec. These run in Node/Vitest; they do not prove browser codecs, the built Worker bundle, or React UI behavior. No React DOM or browser end-to-end test runner is configured.

## Historical Chrome observations

On November 11, 2026, an earlier production build was loaded unpacked in Google Chrome 157.0.8103.39 (arm64, macOS 27.2.1). These observations are useful smoke-test evidence but do not validate the latest Batch, History, or Editor UI changes.

- Popup rendered and **Open workspace** opened the Side Panel; Home, Batch, and History loaded.
- A generated 192 × 128 PNG was processed in the Worker to WebP (9.4 KB to 1.2 KB, 87.3% smaller), and Chrome completed the individual download. Reopening the Side Panel showed the persisted history output.
- Two generated PNGs were batch processed and exported; the ZIP opened and contained non-empty `one.webp` and `two.webp` entries.
- A 100-image batch completed with 100 completed, 0 waiting, 0 failed, and 0 cancelled tasks. Its ZIP contained 100 WebP files (66,606 bytes total).
- A malformed `.png` and a sparse 100 MiB + 1 byte file were rejected. Valid images near byte or pixel limits were not tested.
- The context-menu flow showed Chrome's optional permission prompt for `placehold.co`. After denial, a later approved action fetched a 1.9 KB PNG and converted it to a 1.1 KB WebP.
- Task Manager showed the extension process at 55.4 MB with the Side Panel open and no AfterImage process row after closing it, including after the 100-image run. This is not a heap-level measurement.
- A separate `OffscreenCanvas` codec smoke check encoded/decoded a 192 × 128 image: JPEG changed from 7,051 bytes at 95% quality to 1,643 bytes at 20%; WebP changed from 3,980 to 1,412 bytes; PNG remained lossless at 30,968 bytes. Chrome decoded a 306-byte AVIF sample, but AVIF encoding returned `image/png`, so AVIF output was correctly disabled.

The earlier ZIP was 14 files (162.88 kB), including the MV3 manifest, both Workers, UI bundles, and 16/32/48/128 px icons. It predates the latest Editor changes. Chrome 116 was unavailable, and system theme switching was not available during the recorded browser session.

## Outstanding coverage

### Extension runtime and permissions

- Load the exact release build in clean profiles on Chrome 116 and current stable. Exercise Popup, Side Panel, service-worker suspension/restart, context-menu actions, repeated clicks, and close/reopen behavior.
- Verify `chrome.storage.session` handoff with multiple, stale, and dismissed actions.
- Test page discovery on ordinary HTTP(S), internal/blocked pages, cross-origin images, empty pages, and large DOMs.
- Test optional host permission grant, denial, revocation, re-request, and cancellation during the prompt. Verify CORS/policy failures, redirects, HTTP errors, MIME/signature mismatch, malformed bytes, timeout, chunked over-limit bodies, and stream errors.
- Cover adversarial host inputs such as non-canonical numeric IPv4, IPv6 edge cases, IDNA/trailing-dot names, and DNS names resolving to private addresses. Do not assume hostname filtering can prevent DNS rebinding.

### Image limits, memory, and Worker lifecycle

- Test valid images near 100 MiB and 100 megapixels, just below/above each limit, truncated files, malformed headers, decode errors, and Canvas allocation/encode failures.
- Measure peak memory for 24 MP and near-100 MP images, 100 small files, high-output batches, and ZIPs near 500 MiB. Record browser/device and whether the Side Panel is open; synthetic Blob-size tests are not allocation tests.
- Repeat import/replace/remove/cancel/history-download cycles and inspect object URL and Worker release. Verify the UI recovers with a truthful error after memory pressure.
- Workers have no watchdog timeout; cancellation tests do not establish recovery from a browser operation that stalls without an error.

### Batch queue and ZIP

- In Chrome, cancel active and queued jobs; verify task states, Worker termination, and no download after ZIP cancellation. Verify a later export succeeds.
- Retry failed and mixed-success batches; confirm completed tasks are not repeated and totals remain correct. Test removing tasks and closing/reopening the Side Panel during work.
- Verify the actual 100-image UI limit, 500 MiB input/output boundaries, 500 MiB ZIP preflight and final-size guard, without uncontrolled allocations.
- Verify individual/selected downloads and archives containing one, many, duplicate-name, Unicode-name, and mixed-format images; decode archive entries as real images.

### IndexedDB, History, Editor, and accessibility

- Test IndexedDB open/upgrade/blocked behavior, transaction aborts, quota exhaustion, eviction, and retention ordering in Chrome.
- Verify operation/settings/status metadata for each processing path, retained-Blob download availability, delete/clear failures, repeated clicks, and reload/reopen behavior.
- In the current Editor UI, drag crop at multiple aspect ratios and narrow widths; check numeric bounds, undo/redo/reset, and downloaded output pixels.
- Verify navigation preserves Home state, loading/error/success states, keyboard-only focus, screen-reader labels/status, zoom, 300–380 px Side Panel widths, themes, and long filenames/URLs. Confirm Planned Editor features cannot be activated and Settings stays clearly unavailable.

Do not treat Node codec tests as browser codec tests, mocked Worker tests as real Worker-runtime tests, a 100-task queue unit test as a 100-image browser stress test, or a synthetic over-limit Blob as a large-memory test.
