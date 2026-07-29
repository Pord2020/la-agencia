<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Third-party notices

La Agencia depends on third-party packages distributed under compatible
licenses including MIT, Apache-2.0, BSD, ISC, 0BSD and MPL-2.0. MPL-2.0 is
currently limited to unmodified transitive dependencies of the experimental
Tauri shell. The TLS certificate dataset used by Tauri is distributed under
CDLA-Permissive-2.0.

The authoritative package names, versions and license declarations are stored
in `package-lock.json` and `apps/desktop/src-tauri/Cargo.lock` when generated.
Release automation produces a CycloneDX SBOM from those lockfiles.

Desktop packages include a self-contained
[Node.js](https://github.com/nodejs/node) runtime (Node.js contributors, MIT and
the third-party notices published with Node.js). The executable is assembled
with `@yao-pkg/pkg` (MIT), and the server bundle is assembled with `esbuild`
(MIT). The package ships this notice, the project MIT license and `LICENSES/`.

Third-party provider names and trademarks belong to their respective owners.
Their appearance describes interoperability and does not imply endorsement.

## Resumen en español

Las dependencias permitidas usan licencias MIT, Apache-2.0, BSD, ISC, 0BSD,
MPL-2.0 o CDLA-Permissive-2.0 compatibles. `package-lock.json` y `Cargo.lock`
son la fuente exacta de paquetes y versiones; cada release genera SBOM
CycloneDX para npm y Cargo. Los paquetes Desktop incluyen Node.js y
avisos/licencias correspondientes. Nombres y marcas de proveedores solo
describen interoperabilidad.
