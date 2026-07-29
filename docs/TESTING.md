<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Pruebas / Testing

## Español

`npm run test` mide todo el runtime importable de server/shared y exige al menos
80% de líneas, 75% de branches, 80% de funciones y 80% de statements. El
bootstrap de proceso se valida por Playwright; no se cuenta como unidad.

Los tests no usan cuentas reales ni red. Config, workspaces, chats, adquisición
y previews usan directorios temporales y adapters/runtimes deterministas.

## English

```bash
npm run test:unit
npm run test
npm run check
```

Unit tests never require a provider account or network access. Runtime tests use
temporary config/workspace directories. Integration and E2E work must use the
deterministic fake adapter; real-provider smoke tests are opt-in and never run
for pull requests from forks.

Critical tests prove negative behavior: denial executes nothing, duplicate
idempotency keys execute once, failed QA blocks delivery, and public sharing
cannot start without a valid permission.
