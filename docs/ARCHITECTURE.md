<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Arquitectura

## Vista general

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri o launcher Node                                      │
│  sesión · instancia única · health check · recuperación     │
└──────────────────────────┬──────────────────────────────────┘
                           │ 127.0.0.1:8787
┌──────────────────────────▼──────────────────────────────────┐
│  apps/web                                                   │
│  Oficina 8-bit (default) · Sidebar multi-oficina (advanced) │
│  Chat · sprints · wireframes · biblioteca de recursos       │
└──────────────────────────┬──────────────────────────────────┘
                           │ mismo origen + cookie HttpOnly
┌──────────────────────────▼──────────────────────────────────┐
│  apps/server · Agency Runtime                               │
│  · Orchestrator po-techlead (estable)                       │
│  · Harness consultancy (estable)                            │
│  · Agent loader (agents/**/manifest.md)                     │
│  · Project brain: brief, backlog, sprints, artifacts        │
│  · Usage / quota watcher                                    │
│  · Coding adapter registry                                  │
│  · Resource catalog diario (metadatos, sin ejecución)        │
└───────┬──────────────────────────────┬──────────────────────┘
        │                              │
        ▼                              ▼
  LLM chat (PO, LT, roles)      Adapter (Cursor, Codex, Grok,
  modelos baratos por defecto   Kimi, Antigravity, Claude Code…)
        │                              │
        └──────────┬───────────────────┘
                   ▼
         Workspace del usuario + .agency/
```

## Capas de ingeniería de agentes

Inspirado en el consenso de julio 2026 (X + industria):

| Capa | Responsabilidad en La Agencia |
|------|-------------------------------|
| Prompt | System prompts por agente en `agents/` |
| Context | Brief recortado, archivos de la tarea, handoffs en disco |
| Harness | Tools, reintentos, subagentes, verifier separado del maker |
| Loop | Sprints, stop conditions, plan→act→verify→feedback humano |

## Harnesses

En v0.4 solo `consultancy` participa en el runtime. Los demás manifiestos
describen capacidades previstas y permanecen ocultos:

| Harness | Cuándo usarlo |
|---------|----------------|
| `consultancy` | Default: sprints, wireframes, feedback de cliente |
| `ralph-loop` | Experimental, objetivo v0.5 |
| `generator-evaluator` | Experimental, objetivo v0.5 |
| `long-running` | Experimental |
| `multi-office` | Experimental, objetivo v0.6 |

Ver `harnesses/*/manifest.md`.

## Orquestadores

| Orquestador | Decisiones |
|-------------|------------|
| `po-techlead` | Default: Usuario→PO→LT→especialistas→adapter |
| `cost-aware` | Experimental, objetivo v0.5 |
| `multi-office` | Experimental, objetivo v0.6 |

## Adapters de coding (reales)

Al arrancar, el sistema pregunta qué conectar:

- **Claude Code / Cursor** (Cloud Code)
- **Codex** (OpenAI)
- **Grok Build** (xAI CLI, OSS harness Apache-2.0)
- **Kimi**
- **Antigravity** (Google agent-first CLI `agy` — viable como executor barato)

Cada adapter implementa:

```ts
interface CodingAdapter {
  id: string;
  capabilities: {
    chat: boolean;
    coding: boolean;
    verify: boolean;
    usage: boolean;
    login: boolean;
  };
  policy: {
    timeoutMs: number;
    safeArguments: string[];
    allowedEnvironment: string[];
  };
}
```

## Verificación (regla de oro)

**Nunca** dejar que el mismo agente se auto-apruebe.
Maker ≠ Verifier. El harness `generator-evaluator` y el rol QA lo refuerzan.

## Persistencia

Todo estado importante **en disco** (`.agency/`), no solo en la ventana de contexto:

- `brief.json`, `backlog.json`, `sprints/`, `artifacts/`, `handoffs/`, `logs/`

El catálogo de recursos es global y vive en
`~/.la-agencia/resource-catalog.json`. Su escritura es atómica y la copia
anterior se conserva si una fuente remota falla.

## Seguridad

- Keys solo locales
- Workspace canonicalizado para coding
- Permiso persistido y bloqueante para acciones sensibles
- Túneles públicos temporales y opt-in
- Sin telemetría por defecto
