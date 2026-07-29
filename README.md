<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# La Agencia

**Consultora local de software asistida por agentes de IA** — open source y orientada a personas no técnicas.

[English documentation](README.en.md)

Habla con un Product Owner (Pau). El Líder Técnico organiza sprints con wireframes e informes. Por detrás se conectan **tus** herramientas reales (Claude Code, Cursor, Codex, Grok Build, Kimi, Antigravity) y se escribe código en tu máquina.

## Para personas no técnicas

La distribución de escritorio abre La Agencia desde su icono. El launcher inicia
el runtime local, espera hasta que esté listo y lo recupera automáticamente si
se cae. No hay que recordar una URL ni volver a levantar un servidor.

Los instaladores experimentales se generan con `npm run desktop:build`. Consulta
la [guía de distribución](docs/DISTRIBUTION.md).

## Arranque para contribuir

```bash
cd "La Agencia"
npm install   # solo la primera vez
npm run agency
```

Compila una sola aplicación web+API en `127.0.0.1:8787`, abre una sesión privada
y mantiene el proceso disponible mientras el launcher siga abierto.

### Uso (0 % TI)

1. **Entrar a la oficina** (un botón)
2. **Cuentas** → Claude / Grok / Cursor / ChatGPT… → **Iniciar sesión** (como Netflix)
3. **WASD** caminar · **F** o **E** hablar con un líder (estilo Pokémon)
4. **Pau** negocio · **Alex** técnico · **Ana** pendientes (AWS, GitHub…)
5. Checks de sprint a la derecha

Datos locales: `~/.la-agencia/` y `~/AgencyProjects/`.

## Qué incluye

| Pieza                       | Descripción                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **168 definiciones de rol** | Prompts catalogados; solo se ejecutan cuando el runtime los asigna                                               |
| **Runtime estable v0.4**    | consultancy + po-techlead con permisos y verificación                                                            |
| **Roadmap experimental**    | otros harnesses y orquestadores permanecen ocultos hasta tener tests                                             |
| **6 adapters**              | claude-code, cursor, codex, grok-build, kimi, antigravity                                                        |
| **UI 8-bit**                | Oficina pixel + chat + sprints + equipo                                                                          |
| **Biblioteca diaria**       | Índice y adquisición segura de plantillas/agentes; incluye `awesome-llm-apps` como fuente verificada             |
| **Desktop experimental**    | Sidecar autocontenido, instancia única y recuperación acotada                                                    |
| **Multi-oficina**           | Vista experimental; el routing real llegará en v0.6                                                              |
| **Cuotas**                  | Avisos 80/90 % y jornada Cursor configurable                                                                     |

## Estructura del repo

```
La Agencia/
  agents/           # catálogo por tipo/categoría
  harnesses/        # modelos de loop
  orchestrators/    # quién decide
  adapters/         # contratos de coding CLIs
  apps/web          # oficina React + Vite
  apps/server       # runtime Hono (local)
  packages/shared   # tipos TypeScript
  docs/             # visión, research, sprints, cuotas
```

## Seguridad v0.4

- El servidor escucha exclusivamente en loopback y requiere una sesión local.
- Los sprints esperan autorización antes de ejecutar herramientas.
- Las previews son locales; compartir por internet es una acción separada y temporal.
- QA conserva comandos, logs y artefactos. Sin evidencia, el sprint queda bloqueado.
- Las API keys no se guardan en el archivo de configuración.
- La biblioteca no ejecuta recursos. Una adquisición exige permiso individual,
  fija el commit, escanea secretos/licencias/symlinks y conserva versiones
  inmutables con rollback verificado.

Consulta [SECURITY.md](SECURITY.md) y el [modelo de amenazas](docs/THREAT_MODEL.md).

## Principios

Prompt → Context → **Harness** → **Loop**

- Maker ≠ Verifier
- Estado en disco (`.agency/`)
- Caps de spend y profundidad de subagentes
- Feedback humano al cerrar cada sprint

## Scripts

```bash
npm run agency           # server + web
npm run desktop:build    # instalador local experimental
npm run catalog:validate # verifica AGENT.md
npm run catalog:count
npm run build
npm run check            # validación completa antes de un PR
```

## Licencia

MIT — ver `LICENSE`.

Las contribuciones usan DCO (`git commit -s`). Ver [CONTRIBUTING.md](CONTRIBUTING.md).
