<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Experimental distribution

La Agencia has one product implementation (`apps/web`, `apps/server` and
`agents`) with two launch surfaces.

`npm run agency` is the contributor path: it builds one loopback-only web/API
runtime, opens a private local session and supervises bounded restarts.

`npm run desktop:build` packages the same runtime in an experimental Tauri
shell. The native process allocates an ephemeral port, owns and terminates the
sidecar, enforces one application instance and performs bounded exponential
recovery. Users open an icon and never manage localhost or a server command.

Local packages remain experimental. Public release automation must have
platform signing/notarization configured, signed updater manifests and an
install-and-launch smoke test on macOS, Windows and Linux before artifacts are
attached to a release.

All original project code and assets are MIT licensed. Strong-copyleft code is
not incorporated.
