<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Visión · La Agencia

> Este documento describe la dirección del producto. En v0.4 la única
> combinación ejecutable es `consultancy + po-techlead`, y Codex es el único
> adapter autónomo. Multi-oficina, otros adapters y harnesses siguen en roadmap.

## El problema

Antes de la IA agéntica, un no-técnico contrataba una **consultora**: hablaba con un PO, validaba wireframes y entregas, y recibía software. No tocaba el código.

Hoy, con el vibe coding, mucha gente entra sin saber qué es frontend, backend o un sprint. Se le pide prompt engineering, arquitectura y CLIs. **Esa fricción es el enemigo.**

## La solución

**La Agencia** es un repositorio open source que recrea la experiencia de consultora:

1. El usuario habla en lenguaje de negocio con un **Product Owner**.
2. Un **Líder Técnico** organiza backlog y sprints.
3. Agentes especialistas preparan el trabajo con **contexto acotado** (ahorro de tokens).
4. Un **adapter** ejecuta la implementación con la herramienta real del usuario
   (Codex en v0.4; otros proveedores se habilitarán solo al completar su
   contrato y pruebas).
5. El usuario recibe **wireframes, diagramas, capturas e informes** y da feedback al final de cada sprint.

Todo corre **en su máquina**, con **sus suscripciones**.

## No es

- Un SaaS que cobra por encima de tus tokens
- Un generador de código basura predeterminado
- Un “modo demo falso” como producto (el producto es real; se usa en el día a día)
- Un único harness rígido

## Visión objetivo

- Un **harness multi-modelo** + **varios orquestadores**
- Un catálogo grande de **agentes especialistas** (~200 y creciendo)
- Una UI cercana (8-bit) + modo avanzado multi-oficina
- Guía paso a paso para **conectar la suscripción** (Claude, Grok, Cursor, ChatGPT…) con login en el navegador — **sin API keys** para el usuario 0% TI
- El PO y el coding usan la **misma cuenta de suscripción**
- Control de **cuotas/usage** y transparencia de costes
- (Opcional avanzado) API keys solo ocultas para perfiles técnicos

## Analogía operativa

```
Usuario  →  “Quiero el botón de pagos verde”
PO       →  confirma alcance en lenguaje llano
LT       →  lo mete en el sprint de frontend
Sprint   →  wireframe + tarea + adapter de coding
Coding   →  Claude Code / Codex / Grok / … escribe código real
Entrega  →  capturas + URL + “¿vamos bien?”
Usuario  →  prueba, pregunta, pide cambios
```

## Customización vs. zero-config

- **Por defecto:** cero fricción. Conectar cuenta → empezar. Nivel de intro *guiado*.
- **Si quieres:** cambiar harness, orquestador, oficina, modelos por rol, packs de agentes.

## Meta de comunidad

Nutrir el repo con agentes, harnesses y adapters que la gente ya está construyendo en el ecosistema (Harness Engineer, Loop Engineer, agent packs). Cada agente es un MD ligero; el valor es la **cobertura de roles**.
