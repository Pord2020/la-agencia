<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Cuotas, usage y jornada

Todo el control de uso es **guiado y en lenguaje claro**.

## Principios

1. Antes de una tarea cara: explicar el trade-off
   - “Para planificar usaremos un modelo que gasta más, pero sacamos el plan en una pasada.”
2. Avisar **antes** de quedarse sin cuota, no después.
3. Nunca esconder qué oficina/herramienta está gastando.

## Umbrales

| Umbral | Acción |
|--------|--------|
| ~80 % | Aviso suave + sugerencia de modelo más barato o pausar sprints no críticos |
| ~90 % | Aviso fuerte + pedir confirmación antes de lanzar tareas pesadas |
| ~100 % / fin de jornada | Parar jobs nuevos; el PO resume qué quedó pendiente |

## “Usage” por adapter

Cuando el adapter lo permita, el runtime ejecuta comandos de usage (o API equivalente) de forma periódica y al acercarse a umbrales:

- Cursor: horas de agente / límites del plan
- Claude Code / Anthropic: usage de la suscripción o API
- Codex / OpenAI: límites del plan
- Grok Build / xAI: según plan o `XAI_API_KEY`
- Kimi / Antigravity: según el proveedor

Si un adapter **no expone** usage de forma fiable, se estima por tokens/tiempo de sesión y se etiqueta como *estimado*.

## Avisos de jornada

Ejemplo Cursor con cupo de 5 h:

- A las ~4 h: “Te quedan ~60 min de jornada Cursor. ¿Priorizamos el botón de pagos o dejamos QA para mañana?”
- Al límite: jobs en cola, no se pierden; el PO propone reanudar cuando renueve la cuota.

## Configuración

```json
{
  "usage": {
    "warnAt": 0.8,
    "blockHeavyAt": 0.9,
    "pollMinutes": 15
  }
}
```
