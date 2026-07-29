<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Coding adapters

La v0.4 solo habilita ejecución autónoma cuando el contrato puede garantizar
argumentos seguros, cancelación, timeout y entorno acotado.

| ID | Estado v0.4 | Binario / entrada típica |
| --- | --- | --- |
| `codex` | chat, coding y verificación autónomos | `codex` |
| `claude-code` | detección/login; coding manual | `claude` |
| `cursor` | detección/login; coding manual | Cursor |
| `grok-build` | detección/login; coding manual | `grok` |
| `kimi` | detección/login; coding manual | CLI/API Kimi |
| `antigravity` | detección/login; coding manual | aplicación GUI |

Cada carpeta documenta el contrato previsto. Una capacidad no aparece en la UI
como ejecutable hasta que el adapter la declara y sus pruebas la demuestran.
