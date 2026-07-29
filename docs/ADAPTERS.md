<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Contrato de adapters / Adapter contract

## Español

Cada adapter declara capacidades `chat`, `coding`, `verify`, `usage` y `login`,
además de timeout, cancelación, argumentos seguros, aislamiento y allowlist de
entorno. Detectar una herramienta no equivale a estar autenticado.

En v0.4 solo Codex ofrece coding autónomo: trabaja sobre una copia staged del
workspace y sus cambios se aplican de forma atómica después de revisar el diff.
Claude, Cursor, Grok, Kimi y Antigravity quedan en modo manual porque sus CLIs no
ofrecen todavía una política que La Agencia pueda imponer y verificar. Abrir una
app GUI nunca marca una tarea como terminada.

El chat se ejecuta en un directorio temporal vacío. Solo Codex está habilitado
para chat por suscripción en v0.4 porque permite sandbox read-only verificable.

## English

Every adapter declares `chat`, `coding`, `verify`, `usage` and `login`
capabilities. Detection is not authentication. Unsupported capabilities remain
false and are not shown as ready.

Adapters execute through argument arrays, never interpolated shells. Chat uses
an empty runtime directory; coding uses the canonical project workspace.
Environment variables are allowlisted, output is bounded, and processes have a
timeout. Codex autonomous coding uses a staged workspace and atomic application;
all other adapters remain manual-only until an enforceable policy exists.
Opening a GUI never completes a task. Subscription chat is enabled only for a
verifiably isolated Codex read-only session. Verification is a separate
invocation or deterministic command runner and cannot rely on the maker's
self-report.
