# Release checklist

This checklist is a preparation aid only. **It does not publish to the Chrome Web Store.**

## Product and compliance

- [x] Confirm product name, publisher identity (AfterBuy Studio), and support email (chenjianyu944@gmail.com).
- [x] Publish the privacy policy on GitHub Pages: https://xudan2406.github.io/AfterImage/ (deployment verified).
- [ ] Enter the public privacy-policy URL in the Chrome Web Store Developer Dashboard.
- [x] Prepare English store listing in [STORE_LISTING_EN.md](./STORE_LISTING_EN.md) and Chinese product copy in [PRODUCT_ZH.md](./PRODUCT_ZH.md). Final accuracy review remains tied to manual acceptance.
- [x] Confirm English-only runtime UI is acceptable; Simplified Chinese UI localization is not required for this release.
- [ ] Test the declared Chrome 116 minimum version.
- [x] Review current Chrome Web Store requirements for permission justifications, remote-code declaration, data-use certification, and a public privacy-policy link. The local policy now includes the Limited Use statement; complete declarations in the Developer Dashboard after publisher identity and URL are supplied.
- [x] Verify the actual optional host permission prompt and successful user-authorized remote conversion in Chrome.
- [ ] Verify permission revocation and permission-denial error handling in Chrome.

## Engineering

- [ ] `npm ci`
- [x] `npm run typecheck` (latest QA report: pass)
- [x] `npm run lint` (latest QA report: pass)
- [x] `npm run test:unit` (latest QA report: 38 tests passed)
- [x] `npm run test:integration` (latest QA report: 32 tests passed, including actual crop/rotate/flip pixels)
- [x] `npm test` (latest QA report: 70 tests passed)
- [x] `npm run build` (latest QA report: pass)
- [x] Review `npm audit` for both runtime and development dependencies; latest full and production-only audits report no known vulnerabilities.
- [x] Inspect `.output/chrome-mv3/manifest.json` and generated package: MV3, minimum Chrome 116, self-only script CSP, documented permissions, both Workers and the provided 16/32/48/128 PNG extension icons included, no development-only package files. `.output/afterimage-0.1.0-chrome.zip` generated locally (14 files; 162.88 kB).
- [x] Confirm there is no telemetry, analytics, remote code, or automatic publishing step (code and package review).

## Manual Chrome acceptance (required)

- [x] Load the unpacked production build in Chrome 157 and verify Popup, Side Panel navigation, a single-image conversion/download, and history after reopening.
- [ ] Verify Side Panel sizing, keyboard focus, and light/dark system themes.
- [ ] Process valid images near the 100 MB and 100-megapixel limits. Rejecting a malformed file and a file over 100 MB is verified.
- [x] Import and process 100 small test images; all 100 completed and a downloaded ZIP contained exactly 100 WebP files.
- [ ] Verify serial task states during the run, cancellation, retry, individual downloads, and memory release after removing/replacing/cancelling tasks. Closing the Side Panel removed its AfterImage process from Chrome Task Manager.
- [ ] Verify object URLs/workers are released after removing tasks, replacing images, cancelling jobs, closing the Side Panel, and cancelling ZIP export.
- [ ] Open saved history after a Side Panel reload; verify output downloads, 100-record/500-MB retention, and deletion/clear behavior.
- [x] Export ZIPs containing real images; open two-image and 100-image archives and verify their WebP entries.
- [ ] Verify ZIP cancellation and the 500 MB refusal path.
- [ ] Test right-click open, PNG, WebP, compression, and batch actions on same-origin and cross-origin images.
- [ ] Test permission denial, revoked permission, CORS denial, HTTP errors, redirects, invalid MIME, misleading extension, and over-limit response.
- [ ] Test the minimum supported Chrome version and the current stable Chrome version; validate AVIF capability detection separately.

## Store submission (manual and gated)

- [ ] Complete Chrome Web Store privacy/data-use declarations using the final privacy policy.
- [ ] Prepare and review store screenshots; the extension icon assets are present in the production package.
- [ ] Upload the reviewed screenshots and final ZIP only after all checks above pass.
- [ ] Have a human review listing claims against tested behavior and complete submission.
- [ ] Do not submit while required manual checks or publisher/policy placeholders remain incomplete.

## Current QA status

Automated checks pass after the P0.5 refinement: TypeScript, lint, 70 tests, production build, and dependency audits. Engine integration tests verify real crop, rotation, and horizontal/vertical flip pixel output; unit tests verify Convert/Compress do not inherit hidden resize options. Existing Chrome 157 manual observations predate this UI refinement; Home mode routing, batch statistics and selection actions, history metadata, and Editor controls still need installed-extension acceptance. Chrome 116 is unavailable in the current environment. The full acceptance matrix remains incomplete, including valid near-limit images, cancellation/retry and per-file batch downloads, history retention/deletion, ZIP cancellation/size refusal, permission revocation/failure, and narrow/dark layouts. Publisher identity/contact and the public privacy-policy page are ready; Developer Dashboard disclosures and remaining manual checks still block store submission. See [TESTING.md](./TESTING.md) for the recorded results.
