# GitHub Pages deployment file inventory

This inventory is a pre-deployment checklist only. No file has been staged, committed, pushed, or deployed by creating this document.

Git status at the time of this inventory: every listed file is present, not excluded by `.gitignore`, and currently untracked. Re-run `git status`, `git check-ignore`, file-size, and checksum checks immediately before an approved commit.

## Required application shell

| Path | Bytes | Checksum required | Pages runtime | Failure if omitted |
|---|---:|---|---|---|
| `.nojekyll` | 1 | No | Yes | Pages/Jekyll handling may differ from the verified static layout |
| `index.html` | 33,301 | Recommended | Yes | App does not open |
| `styles.css` | 49,662 | Recommended | Yes | Layout and mobile UI break |
| `app.js` | 182,979 | Recommended | Yes | App functions do not run |
| `manifest.webmanifest` | 790 | Recommended | Yes | PWA installation metadata unavailable |
| `service-worker.js` | 5,561 | Recommended | Yes | Offline shell and controlled updates unavailable |
| `icon.svg` | 750 | Recommended | Yes | Browser/PWA icon fallback missing |
| `icon-192.png` | 7,396 | Recommended | Yes | Required install icon missing |
| `icon-512.png` | 25,352 | Recommended | Yes | Required install/maskable icon missing |

`index.html` contains the in-app device-storage, backup, anonymous-record, and privacy explanations currently used by the app. A separate public privacy-policy URL is not required for this Pages runtime itself, but will normally be required before Google Play/TWA publication.

## Required local OCR runtime

All executable and model files require SHA-256 verification against `vendor/tesseract/THIRD_PARTY_NOTICES.md` before an approved commit.

| Path | Bytes | Pages runtime | Failure if omitted |
|---|---:|---|---|
| `vendor/tesseract/tesseract.min.js` | 66,695 | Yes | OCR API unavailable |
| `vendor/tesseract/worker.min.js` | 123,724 | Yes | OCR Worker unavailable |
| `vendor/tesseract/core/tesseract-core.wasm.js` | 4,734,777 | Yes | non-SIMD full Core fallback unavailable |
| `vendor/tesseract/core/tesseract-core.wasm` | 3,457,035 | Yes | non-SIMD full Core fallback unavailable |
| `vendor/tesseract/core/tesseract-core-simd.wasm.js` | 4,735,153 | Yes | SIMD full Core unavailable |
| `vendor/tesseract/core/tesseract-core-simd.wasm` | 3,457,317 | Yes | SIMD full Core unavailable |
| `vendor/tesseract/core/tesseract-core-lstm.wasm.js` | 3,938,277 | Yes | non-SIMD LSTM fallback unavailable |
| `vendor/tesseract/core/tesseract-core-lstm.wasm` | 2,859,424 | Yes | non-SIMD LSTM fallback unavailable |
| `vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js` | 3,938,657 | Yes | preferred SIMD LSTM Core unavailable |
| `vendor/tesseract/core/tesseract-core-simd-lstm.wasm` | 2,859,709 | Yes | preferred SIMD LSTM Core unavailable |
| `vendor/tesseract/lang/kor.traineddata.gz` | 1,572,336 | Yes | Korean OCR unavailable |
| `vendor/tesseract/lang/eng.traineddata.gz` | 2,952,873 | Yes | English OCR unavailable |

All four Core variants are runtime-required because Tesseract.js selects a variant from browser SIMD and LSTM capabilities. They are intentionally not reduced to the variant used on the development computer.

## Required OCR provenance and redistribution notices

These are distribution files even though the application does not execute them. Omission makes the self-hosted OCR provenance and license record incomplete.

| Path | Bytes | Checksum required |
|---|---:|---|
| `vendor/tesseract/THIRD_PARTY_NOTICES.md` | 6,354 | Recommended |
| `vendor/tesseract/LICENSES_SHA256.txt` | 1,887 | Yes |
| `vendor/tesseract/licenses/tesseract.js-5.1.1-LICENSE.md` | 11,357 | Recommended |
| `vendor/tesseract/licenses/tesseract.js-core-5.1.1-LICENSE.txt` | 11,358 | Recommended |
| `vendor/tesseract/licenses/tesseract.min.js-LICENSE.txt` | 149 | Recommended |
| `vendor/tesseract/licenses/worker.min.js-LICENSE.txt` | 466 | Recommended |
| `vendor/tesseract/licenses/tesseract-data-eng-1.0.0-README.md` | 381 | Recommended |
| `vendor/tesseract/licenses/tesseract-data-kor-1.0.0-README.md` | 381 | Recommended |
| `vendor/tesseract/licenses/language-packages-license-metadata.md` | 1,126 | Recommended |
| `vendor/tesseract/licenses/tessdata-Apache-2.0-LICENSE.txt` | 11,358 | Recommended |
| `vendor/tesseract/licenses/core-third-party/Tesseract-engine-Apache-2.0.txt` | 11,358 | Recommended |
| `vendor/tesseract/licenses/core-third-party/Leptonica-BSD-2-Clause.txt` | 1,521 | Recommended |
| `vendor/tesseract/licenses/core-third-party/IJG-libjpeg-README.txt` | 19,110 | Recommended |
| `vendor/tesseract/licenses/core-third-party/giflib-COPYING.txt` | 1,088 | Recommended |
| `vendor/tesseract/licenses/core-third-party/libpng-LICENSE.txt` | 5,345 | Recommended |
| `vendor/tesseract/licenses/core-third-party/libtiff-COPYRIGHT.txt` | 1,146 | Recommended |
| `vendor/tesseract/licenses/core-third-party/libwebp-COPYING.txt` | 1,496 | Recommended |
| `vendor/tesseract/licenses/core-third-party/openlibm-LICENSE.md` | 5,857 | Recommended |
| `vendor/tesseract/licenses/core-third-party/zlib-README.txt` | 5,368 | Recommended |

## Deployment configuration

| Path | Pages runtime | Notes |
|---|---|---|
| `.github/workflows/pages.yml` | Deployment-dependent | Required only when deployment uses the checked-in GitHub Actions workflow; verify repository Pages settings before committing |

## Development verification files, not Pages runtime files

The files under `tests/` are required for pre-release verification but are not fetched by the installed PWA. They may remain in the repository for auditability, but the Pages artifact should exclude them when the workflow publishes only the runtime file set.

- `tests/release-core-smoke.mjs`
- `tests/anonymous-usage-smoke.mjs`
- `tests/delete-safety-smoke.mjs`
- `tests/mobile-usability-smoke.mjs`
- `tests/mobile-race-safety-smoke.mjs`
- `tests/pwa-release-hardening-smoke.mjs`

Project notes such as `README.md`, `VIBE_CODING_LEARNING_LOG.md`, and `learning-archive-site/` are not required by the `/barohapgye/` runtime. Do not publish unrelated directories merely because they are present in the working tree.

## Approved-deployment preflight

1. Confirm every required runtime and notice file above is tracked and not ignored.
2. Recompute OCR SHA-256 values and compare them with `THIRD_PARTY_NOTICES.md`.
3. Confirm no required file exceeds GitHub's individual-file limit.
4. Confirm the Pages artifact contains `.nojekyll`, the application shell, icons, manifest, service worker, all OCR runtime files, and all notice files.
5. Run the complete automated suite from a clean checkout.
6. After deployment, verify MIME types, v53-to-v54 update behavior, local-only OCR requests, installation, camera/file selection, and offline OCR on an Android device.
