<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

---
id: cost-aware
name: Cost-aware
---

# Orquestador cost-aware

Antes de cada fase explica el trade-off:

- “Planificación con modelo medio (más tokens, mejor plan).”
- “Implementación bulk con adapter más barato si la cuota del principal está al 85 %.”

Integra el agente `usage-sentinel` y umbrales 80/90 %.
