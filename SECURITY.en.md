<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Security policy

Only the latest minor release receives security fixes while the project is
pre-1.0.

Once the public repository exists, report vulnerabilities through GitHub
Private Vulnerability Reporting. Do not disclose secrets, exploits, personal
paths, or private source code in a public issue. Maintainers will acknowledge a
report within 72 hours and coordinate disclosure.

Security invariants:

- The API is loopback-only and authenticated.
- Sensitive work requires a persisted human decision.
- Public tunnels never start automatically.
- API keys are not persisted in `config.json`.
- Coding processes are constrained to a canonical project workspace.
