<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Adapters de coding · viabilidad

Al arrancar, La Agencia pregunta: **¿qué quieres conectar?**

| Adapter | Qué es | Headless / automatizable | Notas |
|---------|--------|--------------------------|-------|
| **Claude Code / Cursor** | CLI/app de Anthropic + IDE Cursor | Sí (CLI print/headless según versión) | Muy usado; cuotas por horas/plan |
| **Codex** | OpenAI coding agent CLI | Sí | Buen “work OS” multi-agente |
| **Grok Build** | xAI harness OSS + CLI `grok` | Sí (`grok -p`) | Harness de referencia; Apache-2.0 |
| **Kimi** | Modelos/agent Moonshot | Depende del CLI/API oficial | Adapter pluggable |
| **Antigravity** | Google agent-first (`agy` CLI) | Sí (`agy -p`, headless) | **Viable** como executor; a menudo más barato; login Google |

## Antigravity — ¿opción viable?

**Sí.** Google Antigravity es plataforma agent-first con CLI que hereda el espíritu de Gemini CLI: skills, hooks, subagents, plugins. Comunidad ya lo usa como **sub-agente executor** (p. ej. Claude planifica, `agy` implementa trabajo pesato barato).

Para La Agencia:

- Oficina “Antigravity” en sidebar avanzado.
- Adapter con preflight de instalación (`curl … install.sh`).
- Buen candidato en orquestador **cost-aware** para tareas de alto volumen.

## Suscripciones reales

El producto asume **cuentas y planes reales del usuario**. No hay simulación de resultados de coding en producción.

> Aclaración sobre “mock”: en ingeniería a veces se usa un *adapter mock* **solo para tests unitarios del harness** (sin llamar a la red). **No es un modo de producto** ni algo que el usuario final active. Tu uso diario y en otro equipo con otra suscripción = **adapters reales**.

## Contrato común

Ver `adapters/README.md` y `packages/shared` (tipos cuando se implemente el runtime).
