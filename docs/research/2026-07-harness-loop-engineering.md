<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Investigación · Harness & Loop Engineering (últimas ~2 semanas, jul 2026)

Fuentes principales: conversación en X + papers/guías citadas por la comunidad + open source reciente.

## Las 4 capas (consenso)

Un agente no es “un prompt bueno”. Es un **while loop** con capas:

1. **Prompt engineering** — una llamada: rol, instrucciones, formato, CoT, few-shot.
2. **Context engineering** — todo lo que entra en la ventana: query, memoria, tools, docs; rankear y recortar.
3. **Harness engineering** — el código alrededor del modelo: tools, parseo, reintentos, subagentes, permisos, verifier.
4. **Loop engineering** — el bucle exterior: auto-schedule, multi-turno sin prompt humano, stop conditions reales, state en disco.

Referencias repetidas en X: Addy Osmani, OpenAI harness notes, Martin Fowler (harness for coding agents), Anthropic workshops (Ralph loop, generator vs evaluator), Firecrawl, Mem0, Lilian Weng (harness for self-improvement).

## Patrones que La Agencia adopta

| Patrón | Idea | Uso en La Agencia |
|--------|------|-------------------|
| Maker ≠ Verifier | El agente que construye no se auto-aprueba | Harness `generator-evaluator` + QA |
| State on disk | Persistencia fuera del context window | `.agency/` handoffs, backlog, artifacts |
| Worktrees / aislamiento | Paralelo sin pisarse | Sprint tasks aisladas |
| Caps de turno/tokens | Stop real, no “el agente dice done” | Runtime + cost-aware orchestrator |
| Discovery loop | El agente encuentra trabajo (CI, issues) | Post-MVP long-running |
| Nested loops | Minutos (agent) / horas (dev) / días (mercado) | Sprints + feedback de usuario |
| Meta-harness | Mejorar el harness con señales claras | Roadmap; no “self-improve” sin métrica |

## Lecturas / repos citados por la comunidad

- Codex CLI, OpenHands, PydanticAI, OpenAI Agents SDK
- Cursos tipo “learn harness engineering”
- Workshops Anthropic AI Engineer Europe 2026: context rot, weak planning, self-grading
- “Ralph loop”: una feature por sesión, estado en archivos, repetir

## Implicación de producto

La Agencia **no compite** con Grok Build / Claude Code / Codex como “otro CLI de coding”.
Compite como **capa de consultora + multi-harness + multi-orquestador + catálogo de roles + UI para neófitos** que *usa* esos harnesses vía adapters.
