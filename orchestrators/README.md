<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Orquestadores

Un **orquestador** decide *quién* habla, *quién* planifica y *a qué oficina/adapter* se manda la implementación.

| ID | Estado |
| --- | --- |
| `po-techlead` | Implementado y único orquestador visible en v0.4 |
| `cost-aware` | Catálogo/roadmap; no ejecutable |
| `multi-office` | Catálogo/roadmap; no ejecutable |

La arquitectura admite extensiones, pero la superficie pública v0.4 expone
únicamente `po-techlead + consultancy`.
