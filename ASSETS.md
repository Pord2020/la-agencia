<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Assets

All source-controlled visual assets must include provenance, author, license and
the generating source when applicable.

The Tauri monogram is an original design created for this repository and
licensed MIT. Its canonical source is `apps/desktop/assets/icon.svg`. The RGBA
PNGs and Windows ICO container are generated offline with
`npm run assets:generate`; CI verifies them with `npm run assets:check`.

No third-party logo implies endorsement by its provider.

## Español

Todo asset versionado debe declarar procedencia, autor, licencia y fuente
reproducible. El monograma Tauri es original del proyecto y MIT; su fuente es
`apps/desktop/assets/icon.svg`; los PNG y el ICO de Windows se regeneran con
`npm run assets:generate`. Ningún nombre o logo de terceros implica respaldo.
