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
- [ ] Re-verify the optional host permission prompt and successful user-authorized remote conversion on the release build.
- [ ] Verify permission revocation and permission-denial error handling in Chrome.

## Engineering

- [x] `npm run typecheck` passes for the latest Editor phase.
- [x] `npm run lint` passes for the latest Editor phase.
- [x] `npm run test:unit` passes for the latest Editor phase.
- [x] `npm run test:integration` passes for the latest Editor phase.
- [x] `npm test` passes for the latest Editor phase.
- [x] `npm run build` passes for the latest Editor phase.
- [ ] Run `npm ci` and `npm audit` against the exact release dependency tree.
- [ ] Inspect the production manifest and regenerate/inspect a distributable ZIP for the exact release source tree.
- [x] Confirm there is no telemetry, analytics, remote code, or automatic publishing step (code and package review).

## Manual Chrome acceptance (required)

- [ ] Load the current unpacked production build in Chrome and verify Popup, Side Panel navigation, a single-image conversion/download, and history after reopening.
- [ ] Verify Side Panel sizing, keyboard focus, and light/dark system themes.
- [ ] Process valid images near the 100 MB and 100-megapixel limits; verify malformed and over-limit image errors.
- [ ] Import and process 100 small test images, verify task states, and inspect the ZIP contents.
- [ ] Verify cancellation, retry, individual downloads, and memory release after removing/replacing/cancelling tasks.
- [ ] Verify object URLs/workers are released after removing tasks, replacing images, cancelling jobs, closing the Side Panel, and cancelling ZIP export.
- [ ] Open saved history after a Side Panel reload; verify output downloads, 100-record/500-MB retention, and deletion/clear behavior.
- [ ] Verify History filename search, operation/status filters, date sorting, retained output size, and clear-history confirmation in Chrome.
- [ ] In Editor, drag a crop selection, verify numeric bounds update, exercise undo/redo/reset, and confirm the downloaded output matches the visible transform.
- [ ] Export ZIPs containing real images and verify the archive entries.
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

The latest automated checks pass, but the latest Batch, History, and Editor UI refinements have not been manually verified in Chrome. Historical Chrome 157 observations do not satisfy current release acceptance. Dependency audit, final ZIP inspection, minimum-version testing, and the remaining manual acceptance are open. Publisher identity/contact and the public privacy-policy page are ready; Developer Dashboard disclosures and remaining checks still block store submission. See [TESTING.md](./TESTING.md) for the authoritative test results and outstanding coverage.
