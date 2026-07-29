<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Catálogo de agentes

## Estructura (obligatoria)

```
agents/
  <tipo>/                      # capa de la consultora
    <categoría>/               # especialidad
      <agente-id>/
        AGENT.md               # frontmatter + system prompt + contrato
  catalog.json                 # índice machine-readable
  README.md
```

### Tipos actuales

| Tipo | Contenido |
|------|-----------|
| `core` | PO, LT, cuotas, guías de oficina |
| `engineering` | arquitectura, frontend, backend, quality |
| `data` | modelado y plataformas |
| `devops` | delivery y ops |
| `qa-security` | verificación y seguridad |
| `design` | wireframes, UX, flujos |
| `product` | discovery y roadmap |
| `business` | estrategia y ops de negocio |
| `marketing` | growth |
| `legal` | borradores orientativos |
| `onboarding` | guías de CLIs y cloud |
| `industry` | verticales |
| `harness-ops` | loop planner, recovery, eval, blast radius, spend control |

## Calidad mínima de un AGENT.md

1. Frontmatter con `id`, `name`, `type`, `category`, `talks_to_user`, `default_model_tier`
2. System prompt con misión y límites
3. Contrato de handoff JSON
4. Principios: contexto mínimo, estado en disco, maker ≠ verifier, stop conditions

## Buenas prácticas (investigación X / jul 2026)

- Harness first, model second
- Observar tool calls, cap de spend, bound blast radius
- Nunca self-grading del maker
- Cap de profundidad de subagentes (evitar runaway loops de cuota)
- Nested loops: agent (minutos) / sprint (horas) / mercado (días)

## API

- `GET /api/agents` — árbol + lista
- `GET /api/agents?type=engineering`
- `GET /api/agents/:id` — manifest completo con system prompt
