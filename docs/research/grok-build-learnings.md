<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Aprendizajes · Grok Build open source (xAI / SpaceXAI)

## Qué liberaron

- Repo: [github.com/xai-org/grok-build](https://github.com/xai-org/grok-build) (Apache-2.0)
- Anuncio: [Grok Build is Now Open Source](https://x.ai/news/grok-build-open-source) (15 jul 2026)
- Docs: [docs.x.ai/build/overview](https://docs.x.ai/build/overview)

Grok Build es el **coding agent + TUI + harness** de xAI (Rust): loop de agente, tools (fs, shell, search…), UI fullscreen, extensiones (skills, plugins, hooks, MCP, subagents). Puede correr interactivo, **headless** (`grok -p "..."`), o vía **ACP** embebido en otras apps.

## Por qué importa para La Agencia

El harness de Grok Build es referencia de industria de lo que un **coding runtime** debe tener:

| Pieza Grok Build | Enseñanza para La Agencia |
|------------------|---------------------------|
| Agent loop (context → model → parse → tools) | Nuestro server no reimplementa un coder completo; **orquesta** y delega |
| Tools + workspace/checkpoints | Los adapters deben reportar diffs y estado |
| Headless / streaming-json | Ideal para integrar sprints sin TUI manual |
| Skills / plugins / MCP / subagents | Modelo para nuestros **agent packs** y extensiones comunitarias |
| Plan mode + review en TUI | Paralelo a wireframes/informes de consultora |
| Config local (`~/.grok/config.toml`) + custom models | BYOK y multi-modelo |
| Sandbox / permisos | Seguridad del adapter |
| ACP | Posible protocolo común entre oficinas |

## Qué NO copiamos ciegamente

- No somos un fork de Grok Build.
- No dependemos de un solo vendor.
- La Agencia añade **PO, sprints, multi-oficina, cuotas, lenguaje de negocio** encima.

## Cómo lo conectamos

Adapter `adapters/grok-build/`:

1. Detectar binario `grok`.
2. Auth (`XAI_API_KEY` o login).
3. `grok -p "<task brief>" --output-format streaming-json` en el cwd del proyecto.
4. Parsear eventos → UI de oficina.
5. (Opcional) usage si la CLI/API lo expone.

## Nota de confianza

El open source llegó también tras debate de privacidad de uploads; el código es auditable. La Agencia insiste en **local-first** y en que el usuario elija qué adapter corre.
