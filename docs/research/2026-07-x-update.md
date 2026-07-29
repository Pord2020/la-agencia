<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Actualización X · patrones incorporados al runtime

## Hallazgos clave (jul 2026)

1. **Harness engineering > loop engineering** si no observas fallos, caps y blast radius (SRE/agent production).
2. **Think → Act → Observe → Verify → Evolve → Repeat** como esquema de loop.
3. **Never let the agent grade itself** — generator/evaluator separados.
4. **State on disk**, worktrees, isolation.
5. **Subagent nesting depth caps** — runaway subagents queman cuota (caso Codex reportado en X).
6. **Grok Build OSS** como referencia de harness (agent loop, tools, headless, skills/MCP).
7. **Antigravity / agy** usable como executor barato en multi-office.

## Cómo está reflejado en La Agencia

| Patrón | Implementación |
|--------|----------------|
| Harness pluggable | `harnesses/*` + setting `harness` |
| Orquestador pluggable | `orchestrators/*` + setting `orchestrator` |
| Maker ≠ verifier | Tareas QA separadas en sprint; agente `qa-verifier` |
| State on disk | `~/AgencyProjects/.../.agency/project.json` + jobs |
| Spend / usage | `usage-sentinel` + settings warnAt/blockHeavyAt |
| Subagent governor | agente `subagent-governor` + docs |
| Coding real | adapters CLI headless (grok, claude, …) |
| Multi-office | UI sidebar + adapters múltiples |

## Lecturas citadas en la comunidad

Addy Osmani (loop), OpenAI harness notes, Martin Fowler (harness for coding agents), Anthropic workshops (Ralph loop), Firecrawl, Mem0, learn-harness-engineering courses.
