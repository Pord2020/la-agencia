<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Changelog

## 0.4.0 — Unreleased

### Security

- Local session authentication and strict origin validation.
- Persisted, blocking permissions and operation lifecycle.
- Project-scoped CLI execution and non-persistent API keys.
- Explicit, expiring public-preview sharing.

### Changed

- QA and wireframes now require evidence.
- Only implemented harnesses and orchestrators are exposed.
- Sprint approval uses an explicit decision instead of keyword matching.
- Production web and API now share one loopback runtime.
- The experimental desktop package owns a self-contained sidecar, waits for
  readiness, enforces a single instance and performs bounded recovery.

### Added

- Daily metadata-only Resource Library for reputable repositories, official
  skills and the verified `Shubhamsaboo/awesome-llm-apps` collection.
- Per-resource indexing for agent templates and skills, with provenance,
  license, trust and conservative capability-risk indicators.
- Catalog recommendations in PO, planning and coding context without automatic
  installation or execution.
- Explicit, commit-pinned resource acquisition with scanning, read-only
  versions, recoverable removal and integrity-checked rollback.
- Broad server/shared coverage gates (80% lines, 75% branches).

### Open source

- DCO, SPDX/REUSE metadata, CI, governance, security policy and contribution templates.

## Resumen en español

La v0.4 incorpora sesión local, permisos persistentes, operaciones recuperables,
coding staged, QA con evidencia, previews opt-in, ledger completo y adquisición
open source fijada a commit con escaneo y rollback verificado. Solo se muestran
`consultancy + po-techlead`; Desktop continúa experimental hasta cumplir firma,
updater y pruebas de instalador.
