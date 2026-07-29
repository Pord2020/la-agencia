<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Threat model / Modelo de amenazas

## Resumen en español

Se protegen código del usuario, secretos, archivos personales, permisos,
procesos y exposición de red. Las fronteras principales son navegador/API,
runtime/CLI, workspace/staging, catálogo/repositorios y preview/túnel.

Controles obligatorios: sesión local HttpOnly y origen estricto; payloads Zod;
rutas canonicalizadas; permisos persistentes y consumibles; chat temporal;
coding staged; escrituras atómicas; QA con evidencia; túneles opt-in con
caducidad; adquisición fijada a commit y escaneada; secretos solo en entorno o
memoria.

## English details

## Protected assets

User workspaces, subscription credentials, environment secrets, local services,
model spend and files outside the selected project.

## Trust boundaries

Browser ↔ loopback API; API ↔ coding CLI; workspace ↔ host filesystem; local
preview ↔ public tunnel; model output ↔ executable action; GitHub catalog
metadata ↔ model context.

## Required controls

- One-time session bootstrap, HttpOnly cookie and origin checks.
- Canonical workspace paths and no shell interpolation.
- Per-adapter environment allowlist, timeout and cancellation.
- Persisted permission before sensitive actions.
- Separate maker and command-based verifier.
- Explicit public sharing with TTL and revocation.
- Redacted logs, atomic state and recoverable backups.
- Resource catalog entries are metadata only: they are never cloned, installed
  or executed by refresh. Unknown and incompatible repository licenses are
  filtered; skill files retain a mandatory license-review risk flag.
- The optional GitHub token is read from the process environment and is never
  persisted. Failed updates retain the last valid local snapshot.

The browser launcher temporarily stores its active bootstrap token in
`~/.la-agencia/runtime.json` with mode `0600`, solely so the same operating
system user can reopen the already-running office. It removes the file on a
clean shutdown. The desktop sidecar keeps its token in process memory and asks
the operating system for an ephemeral loopback port; no client-supplied port is
accepted.

Prompt output is untrusted input. It cannot grant itself permissions or widen a
workspace. A CLI capability that cannot enforce these boundaries is marked
experimental and disabled.
