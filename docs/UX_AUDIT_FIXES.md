<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Correcciones auditoría UX (jul 2026)

## 1. Estabilidad
- `npm run agency` → server + web + **abre navegador**
- Banner de reconexión si cae la API (botón + instrucción `npm run agency`)
- Health ping cada 4s + SSE con reintento

## 2. Apps conectadas
Detección ampliada de PATH y apps macOS:
- Claude, Cursor, Codex, Grok, Kimi, Antigravity → todos detectados en la máquina del autor
- Login abre la app GUI o CLI de suscripción (sin API key)

## 3. Onboarding / Chat
- Boot: solo **Entrar a la oficina**
- Chat inferior estilo Pokémon al hablar con un líder (F/E)
- Sin panel de chat gigante lateral permanente

## 4. Interlocutores
- Pau, Alex, Ana, Maya, Leo, Nora, Sam (líderes)
- Subagentes visibles en suboficina, no hablables

## 5. Oficina
- Indicador busy (puntos) sobre agentes trabajando
- Nombres bilingües, toggle ES/EN
- Etiquetas de departamento

## 6. Sprint checks
- Épica + casillas de sprints / tareas (✓)

## 7. Pendientes (Ana)
- userTodos + pasos + enlaces + marcar hecho → notifica a Alex

## 8. Cola
- `.agency/queue.json` por proyecto

## 9. Multioficina
- Sidebar colapsable siempre visible
- + Nueva oficina → flujo de cuentas
