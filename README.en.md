<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# La Agencia

La Agencia is a local-first, open-source software consultancy interface powered
by the coding tools already installed on the user's computer.

Version 0.4 intentionally supports one stable orchestration path: the
`consultancy` harness with the `po-techlead` orchestrator. Other harnesses, MCP
execution, and multi-office routing remain hidden until they have real runtimes
and tests.

For non-technical users, the experimental desktop package owns the local
runtime: clicking the app icon starts it, waits for readiness and performs
bounded recovery after crashes. No server command or localhost URL is required.

## Quick start

```bash
npm install
npm run agency
```

The launcher starts a loopback-only API, opens the web office, and bootstraps a
private local session. A sprint cannot execute until the user explicitly grants
permission. Public previews are never started automatically.

The Resource Library refreshes a metadata-only index of reputable open-source
repositories and official agent skills once per day. Explicit acquisition pins
an immutable commit, scans content without executing it, installs a read-only
copy and retains verified versions for rollback.

Build an experimental native package with `npm run desktop:build`. See
[distribution](docs/DISTRIBUTION.md) and the
[resource catalog](docs/RESOURCE_CATALOG.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), run `npm run check`, and sign commits
with `git commit -s`. Contributions are licensed under MIT.

Spanish is the primary product language. Source code and technical JSDoc use
English; essential public documentation is maintained in Spanish and English.
