# Self-hosted OCR files

These files are unmodified artifacts from the official npm packages listed below. They are hosted locally so the app does not load OCR code or language data from a third-party CDN at runtime.

## Packages and provenance

| Package | Version | Registry source | Declared license | npm package integrity |
|---|---:|---|---|---|
| `tesseract.js` | 5.1.1 | `https://registry.npmjs.org/tesseract.js/-/tesseract.js-5.1.1.tgz` | Apache-2.0 | `sha512-lzVl/Ar3P3zhpUT31NjqeCo1f+D5+YfpZ5J62eo2S14QNVOmHBTtbchHm/YAbOOOzCegFnKf4B3Qih9LuldcYQ==` |
| `tesseract.js-core` | 5.1.1 | `https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-5.1.1.tgz` | Apache-2.0 | `sha512-KX3bYSU5iGcO1XJa+QGPbi+Zjo2qq6eBhNjSGR5E5q0JtzkoipJKOUQD7ph8kFyteCEfEQ0maWLu8MCXtvX5uQ==` |
| `@tesseract.js-data/kor` | 1.0.0 | `https://registry.npmjs.org/@tesseract.js-data/kor/-/kor-1.0.0.tgz` | MIT | `sha512-tepYhsYiRJ8E44R27MHxVteEDDLfYQxuvM6u4JlEHcCYqwpefvI5TGzoMgB67kunOvtyEJYtT5zfJ/6R6FVU9w==` |
| `@tesseract.js-data/eng` | 1.0.0 | `https://registry.npmjs.org/@tesseract.js-data/eng/-/eng-1.0.0.tgz` | MIT | `sha512-mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==` |

The language files are the packages' `4.0.0_best_int` LSTM data, matching the existing `OEM.LSTM_ONLY` (`1`) initialization. Package README files and license notices are preserved in `licenses/`. No supplied executable or language-data file was modified.

## Scope and limitation

This file preserves provenance and official notices for the redistributed OCR artifacts. It is not legal advice and does not claim that the upstream npm packages contain a complete software bill of materials. The exact `tesseract.js-core` v5.1.1 source tag points at the nine submodules listed below. Those official license or copyright files are preserved verbatim under `licenses/core-third-party/`.

The upstream Core package does not ship a consolidated third-party NOTICE for its compiled WASM artifacts. The submodule list establishes build inputs, but the published package does not provide enough information to prove which optional code from every submodule is linked into every one of the four WASM variants. This uncertainty is retained here rather than replaced with a legal conclusion.

## tesseract.js-core v5.1.1 build inputs

| Component | Exact source revision | Official source | Preserved notice |
|---|---|---|---|
| Tesseract engine fork | `e20b1c6553c8f68c4bbff1feef0a64064959a427` | `https://github.com/Balearica/tesseract` | `licenses/core-third-party/Tesseract-engine-Apache-2.0.txt` |
| Leptonica | `4af068b56a9674da915debea4ed7e1b9885b17e8` | `https://github.com/DanBloomberg/leptonica` | `licenses/core-third-party/Leptonica-BSD-2-Clause.txt` |
| IJG libjpeg | `6c0fcb8ddee365e7abc4d332662b06900612e923` | `https://github.com/LuaDist/libjpeg` | `licenses/core-third-party/IJG-libjpeg-README.txt` |
| giflib | `fa37672085ce4b3d62c51627ab3c8cf2dda8009a` | `https://github.com/mirrorer/giflib` | `licenses/core-third-party/giflib-COPYING.txt` |
| libpng | `a37d4836519517bdce6cb9d956092321eca3e73b` | `https://github.com/glennrp/libpng` | `licenses/core-third-party/libpng-LICENSE.txt` |
| libtiff | `b51bb157123264e26d34c09cc673d213aea61fc7` | `https://gitlab.com/libtiff/libtiff` | `licenses/core-third-party/libtiff-COPYRIGHT.txt` |
| libwebp | `20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c` | `https://github.com/webmproject/libwebp` | `licenses/core-third-party/libwebp-COPYING.txt` |
| zlib | `21767c654d31d2dccdde4330529775c6c5fd5389` | `https://github.com/madler/zlib` | `licenses/core-third-party/zlib-README.txt` |
| openlibm | `ae2d91698508701c83cab83714d42a1146dccf85` | `https://github.com/JuliaMath/openlibm` | `licenses/core-third-party/openlibm-LICENSE.md` |

The submodule revisions above are taken from the official `tesseract.js-core` v5.1.1 tag (`027867a5ab2e2e5b3736757b199b39e07706cf99`) and its `.gitmodules` file. The Core source and Tesseract engine use Apache-2.0; each bundled dependency remains governed by its own preserved notice.

## Language data provenance and license boundary

The exact npm packages `@tesseract.js-data/kor@1.0.0` and `@tesseract.js-data/eng@1.0.0` declare `MIT` in their official package metadata but do not contain a standalone LICENSE file. Their README files are preserved. The packages identify `https://github.com/naptha/tessdata` as their repository, and the official tessdata repository documents these npm files as the `4.0.0_best_int` integerized form derived from `tesseract-ocr/tessdata_best`. The tessdata repository's Apache-2.0 license is preserved as `licenses/tessdata-Apache-2.0-LICENSE.txt`.

Because the package-level MIT declaration and the upstream data repository's Apache-2.0 license describe different layers and upstream does not supply a standalone package LICENSE explaining that relationship, both facts are recorded without asserting that one replaces the other. See `licenses/language-packages-license-metadata.md`.

SHA-256 values for every preserved license and notice file are recorded in `LICENSES_SHA256.txt` so that the deployment package can be checked for accidental changes.

## Included file SHA-256 checksums

```text
5db58ea4d1bd4256be81e8ae3b4fa226c4625dfba1850b1b3308dbf3700e9929  core/tesseract-core-lstm.wasm
8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa  core/tesseract-core-lstm.wasm.js
66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef  core/tesseract-core-simd-lstm.wasm
ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf  core/tesseract-core-simd-lstm.wasm.js
baa2f54ef5af43ada4605fd7ae999bde3c6ecc96bfe0d0410b0b4f4a5f9c8b91  core/tesseract-core-simd.wasm
63f232c4f7a97b04e52eb940202700b2c6239783a75d0ff0553274fac530cd5c  core/tesseract-core-simd.wasm.js
b47a852b19181ae0999f9d970c368cd351135a320ea978b35bd38602d8bcc0bc  core/tesseract-core.wasm
2b8c8c92b8788807061fb4bb16c5acdf000c149e100255f879f78d2c58ca9969  core/tesseract-core.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  lang/eng.traineddata.gz
78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126  lang/kor.traineddata.gz
a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8  tesseract.min.js
aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc  worker.min.js
```

