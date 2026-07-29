<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Contribuir a La Agencia

[English version](CONTRIBUTING.en.md)

Gracias por aportar a un proyecto open source pensado para personas **0 % técnicas**
y para quien escribe en X y no perdona el slop.

## Antes de escribir código

Lee:

1. [`docs/CODE_STYLE.md`](docs/CODE_STYLE.md) — calidad pública
2. [`docs/VISION.md`](docs/VISION.md) — qué es / qué no es
3. [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) — localhost vs Tauri

## Formas de contribuir

1. **Agentes** — `agents/<tipo>/<categoría>/<id>/AGENT.md`
2. **Harnesses / orquestadores**
3. **Adapters** de coding (suscripción, no API keys en el camino feliz)
4. **UI de oficina** — diálogo Pokémon, animaciones, No-TI
5. **Docs / i18n**
6. **Desktop Tauri** — shell, no reimplementar lógica de agentes

## Reglas de oro

- **MIT only** — no copies código GPL ni assets de terceros.
- Local-first, sin telemetría por defecto.
- No commitear secretos.
- Maker ≠ verifier.
- Texto de UI sin jerga (salvo modo advanced).
- Un PR = un cambio enfocado + cómo probarlo.
- Comentarios: el *por qué*, no la narración.
- Cada commit debe incluir el sign-off DCO: `git commit -s`.
- No se aceptan capacidades simuladas como si estuvieran terminadas.
- Todo cambio de comportamiento incluye tests y, si modifica una interfaz, documentación.

## Desarrollo

```bash
npm install
npm run agency          # web + server + browser
npm run catalog:validate
npm run check
```

## Developer Certificate of Origin

Al añadir `Signed-off-by` confirmas que tienes derecho a contribuir el cambio
bajo la licencia MIT, según el [Developer Certificate of Origin 1.1](https://developercertificate.org/).

## Pull requests

Describe qué cambia, por qué, cómo se probó y qué riesgos quedan. Los cambios
visuales incluyen capturas. Las decisiones de seguridad explican su modelo de
amenazas. Un PR no puede reducir los controles de permisos, workspace o secretos.
