<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Auditoría UI/UX — octubre 2026

Alcance: `apps/web` (oficina pixel, HUD, paneles y modales) y el mensaje de
bienvenida del servidor. Método: lectura completa del código + la app real
ejecutada en Chromium a 1440×900, 1280×720 y 390×844.

## Diagnóstico en una frase

La idea (oficina 8-bit estilo Pokémon) tiene personalidad, pero **no hay un
sistema**: cada componente decide su propio tamaño de letra, borde, sombra,
color, botón y estructura de modal. Esa suma de decisiones locales es lo que
se percibe como "amateur". Además hay tres fallos que rompen la experiencia
(teclado, fuentes y móvil).

## Cifras del problema

| Señal                                           | Valor actual                                      |
| ----------------------------------------------- | ------------------------------------------------- |
| Tamaños de texto arbitrarios (`text-[Npx]`)     | 6 distintos (5, 7, 8, 9, 10, 11 px) × 54 usos     |
| Colores Tailwind por defecto fuera de la paleta | 13 (green-300/700/800, amber-*, blue-700, white…) |
| Sistemas de botón                               | 3 (`.pixel-btn`, `.hud-btn`, texto subrayado)     |
| Grosor de borde / sombra                        | 2·3·4 px / 3·6·8 px, sin regla                    |
| Valores de `z-index`                            | 7 distintos (10 → 100)                            |
| Atributos `aria-*` / `role`                     | **0**                                             |
| Estilos de foco                                 | **0**                                             |
| Soporte `prefers-reduced-motion`                | **0**                                             |
| Ternarios `locale === "en"` inline              | 37 (más 4 componentes solo en español)            |
| `window.alert()` para errores                   | 5                                                 |

---

## P0 — Rompe la experiencia

1. **El chat no dejaba escribir W, A, S, D, E, F ni espacios.** El motor
   escucha `keydown` en `window` y hace `preventDefault()` aunque el foco esté
   en un input. Escribir "hola wasd fe test" producía `holtt`.
   ✅ **Corregido en esta rama** (`apps/web/src/pixel/engine.tsx`): el motor
   ignora teclas cuyo destino es un campo de formulario.

2. **Las fuentes nunca se cargan.** `Press Start 2P` e `IBM Plex Sans` se
   nombran en CSS/Tailwind pero no hay `@font-face`, `@fontsource` ni `<link>`.
   Resultado: el título "LA AGENCIA" y todos los botones salen en la
   monoespaciada del sistema. La identidad 8-bit desaparece y cada SO muestra
   algo distinto. → Autoalojar ambas con `@fontsource/press-start-2p` y
   `@fontsource/ibm-plex-sans` (licencia OFL, anotar en `THIRD_PARTY_NOTICES`);
   la app es local-first, no depender de Google Fonts.

3. **Por debajo de ~900 px la oficina desaparece.** El sidebar (192 px) y el
   panel derecho (`w-full max-w-sm`) se comen el ancho y el canvas queda en 0;
   en 390 px solo se ven las etiquetas de los NPC apiladas. → Layout
   responsive (ver "Reglas · Layout").

4. **El mensaje de bienvenida decía "Pulsa F o A para hablar"** — `A` camina a
   la izquierda. ✅ **Corregido** a "F o E" (`apps/server/src/app.ts`).
   Pendiente: el diálogo muestra el Markdown crudo (`**Pau**`). Renderizar un
   subconjunto mínimo (negrita, listas) o que el servidor envíe texto plano.

## P1 — Accesibilidad (WCAG 2.1 AA)

| Problema                                                                                             | Dónde                                                    | Arreglo                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Modales sin `role="dialog"`, `aria-modal`, título asociado, trampa de foco, `Esc` ni retorno de foco | Settings, Team, Library, Cost, Permission, diálogo       | Un único componente `<Modal>` (ver Reglas)                                                                  |
| Botones sin nombre accesible: `$`, `♪ / –`, `✕`, `»`                                                 | `App.tsx` HUD, `PokemonDialogue`, `OfficeSidebar`        | `aria-label` + texto visible donde quepa                                                                    |
| Sin indicador de foco visible                                                                        | todo                                                     | `:focus-visible` con anillo de 2 px `sun` + offset                                                          |
| Contraste de etiquetas del mapa: 1,6:1 (crema 50 % sobre madera) y 1,8:1 (amarillo sobre madera)     | `DEPARTMENT_LABELS`, `.npc-tag`                          | Etiqueta con fondo tinta (placa), mínimo 4,5:1                                                              |
| Texto de 5–8 px (ilegible, más en fuente pixel)                                                      | etiquetas, botones `text-[7px]`/`[8px]`, hint de boot    | Mínimo 12 px para texto, 8 px solo en la pixel-font a tamaños de su rejilla (8/16/24) y nunca para párrafos |
| Animaciones sin `prefers-reduced-motion`                                                             | parpadeo de boot (setInterval), `animate-pulse`, sprites | Desactivar parpadeo/pulso y reducir animación de sprites                                                    |
| La oficina es solo canvas: un lector de pantalla no puede hablar con nadie                           | `OfficeEngine`                                           | Menú "Hablar con…" en el HUD (también es un atajo para usuarios no técnicos)                                |
| `lang="es"` fijo aunque cambies a EN                                                                 | `index.html`                                             | Actualizar `document.documentElement.lang` al cambiar idioma                                                |
| Objetivos táctiles de ~24 px                                                                         | `.hud-btn`                                               | Mínimo 40 px de alto (44 en táctil)                                                                         |
| Estado de toggles no expuesto                                                                        | "Mis pendientes", "Sprint"                               | `aria-pressed` + estilo activo                                                                              |

## P1 — Sistema visual (la causa del "amateur")

- **Tres botones distintos.** `.pixel-btn` (borde 3 px + sombra), `.hud-btn`
  (borde 2 px sin sombra, inyectado con un `<style>` dentro de `App.tsx`) y
  botones de texto subrayado (`EN`, `✕`, `cerrar`). No hay variante
  secundaria/terciaria/peligro coherente.
- **Jerarquía de acciones rota.** En Cuentas hay **seis** botones amarillos
  "Iniciar sesión" idénticos más "Guardar y seguir" también amarillo: si todo
  es primario, nada lo es. En Permisos, "No, detener" pesa lo mismo que
  "Permitir solo esta vez".
- **Caja dentro de caja.** El panel Sprint tiene marco de 4 px → tarjeta de
  2 px → botón de 3 px con sombra. Cada nivel añade borde y sombra; el ojo no
  encuentra el contenido. Regla: un solo marco "pixel" por superficie; dentro,
  separadores finos o fondo tonal.
- **Anatomía de modal distinta en cada uno.** Settings: título suelto + botón
  "Cerrar"; Equipo/Biblioteca: banda crema con borde 4 px; Gasto: sin banda;
  Diálogo: `✕` subrayado. El cierre cambia de forma y de lugar.
- **Paleta paralela.** Hay tokens (`ink`, `cream`, `sun`, `sky`) pero el
  estado se pinta con `green-800`, `amber-700`, `blue-700`, `bg-white`. Inputs
  y tarjetas blancas sobre crema producen dos blancos distintos.
- **Escala tipográfica inexistente.** El título de un modal mide 9, 10 u 11 px
  según el archivo; la pixel-font se usa a veces para títulos, a veces para
  botones y a veces para etiquetas de 5 px.
- **Iconografía mezclada.** Lucide en el HUD, Unicode en tareas (`☑ ◐ ☒`),
  emoji en informes (`📄`), `▸` en eventos, `★` en la biblioteca.
- **Código muerto.** `components/DialogueBox.tsx` no se usa.

## P1 — Layout y flujos

**Oficina (pantalla principal)**

- El canvas flota centrado con ~170 px vacíos arriba (1440×900); el registro
  de eventos queda colgando debajo y el panel derecho es una columna blanca de
  altura completa casi vacía. → El canvas debe llenar su área (escala entera
  ×2/×3 para pixel-perfect) y el panel derecho debe crecer con contenido.
- El sidebar de oficinas ocupa 192 px para una sola oficina con "—". Mostrarlo
  solo con ≥2 oficinas o colapsado por defecto.
- **HUD con 8 controles del mismo peso.** Mezcla toggles de panel (Pendientes,
  Sprint), modales (Biblioteca, Equipo, Cuentas, Gasto), preferencias
  (música, idioma). Agrupar: `[Proyecto ▾] … [Sprint] [Pendientes] | [Equipo]
[Biblioteca] | [⚙ menú: Cuentas, Gasto, Idioma, Sonido]`.
- `$` es críptico; la música aparece activa pero no hace nada sin cuenta
  (falla en silencio). El estado del proyecto se muestra en crudo (`setup`).
- "+ Nueva" (oficina) abre el modal de **Cuentas**: la acción no cumple lo que
  promete.
- El registro muestra errores técnicos al entrar ("No se pudo actualizar la
  biblioteca…") a un usuario no técnico, sin hora ni severidad.

**Primer uso**

- No hay un estado guiado de "conecta tu cuenta primero"; se entra a la
  oficina y se puede hablar con Pau sin suscripción. → Banner persistente en
  el HUD hasta conectar, con un único CTA.
- "Entrar a la oficina" no muestra carga en el propio botón y, si el servidor
  no responde, vuelve sin decir nada.
- Errores con `window.alert()` (5 sitios): bloqueante, sin estilo, sin
  idioma. → Toasts no bloqueantes con `role="status"`/`alert`.

**Diálogo con líderes**

- Solo muestra las 2 últimas líneas al abrir: se pierde el hilo.
- El mensaje propio solo se distingue por un `›`; no hay burbuja ni alineación.
- No se cierra con `Esc`. El indicador de "pensando" son tres puntos de 8 px.

**Sprints**

- "Aprobar" y "Pedir cambios" envían comentarios fijos ("Todo bien,
  aprobamos.", "Necesitamos cambios."): pedir cambios sin poder decir cuáles.
  → Abrir un campo de texto al pedir cambios.
- Los sprints hechos se tachan **y** se pintan verdes **y** llevan ✓: triple
  codificación que ensucia la lista.

**Equipo / Biblioteca / Gasto**

- Categorías con slugs internos (`qa-security`, `harness-ops`).
- Contratar cierra el modal sin confirmación visible.
- Biblioteca muestra valores internos (`★ 0 · CHECK_SOURCE`) y etiquetas
  duplicadas (`agent-skills agent-skills`).
- Tokens sin separador de miles; la cabecera de la tabla no alinea números a
  la derecha.

**Internacionalización**

- `CostPanel`, `AgentsPanel`, `PermissionModal` y `SettingsModal` están solo
  en español; el resto usa 37 ternarios inline en lugar del diccionario
  `i18n.ts`. Todo texto visible debe pasar por `t()`.

## P2 — Transiciones y movimiento

Hoy los modales y el diálogo aparecen y desaparecen de golpe; la única
transición es el ancho del sidebar (`transition-all`). Para una estética 8-bit
el movimiento debe ser **corto y escalonado**, no suave tipo iOS:

- Entrada de modal: 160 ms, `steps(4)` en `opacity` + `translateY(8px → 0)`.
- Diálogo: sube desde abajo 200 ms `steps(5)`; texto con efecto máquina de
  escribir opcional (desactivable, y nunca para mensajes largos).
- Hover de botón: sin transición (cambio inmediato es más "arcade"); `:active`
  hunde 2 px como hoy.
- Toasts: entran 160 ms, salen 120 ms.
- Con `prefers-reduced-motion: reduce`: solo cambios de opacidad, sin
  desplazamientos ni parpadeos.

---

## Reglas (sistema de diseño propuesto)

Estas reglas son el contrato. Un PR de UI que las rompa debe justificarlo.

### 1. Color — tokens semánticos

Definir en `tailwind.config.js` y como variables CSS; prohibido usar colores
Tailwind por defecto o hex sueltos en componentes.

| Token            | Valor     | Uso                                     |
| ---------------- | --------- | --------------------------------------- |
| `bg`             | `#1a1a2e` | fondo de la app                         |
| `bg-raised`      | `#24243e` | HUD, sidebar                            |
| `surface`        | `#fffdf5` | paneles y modales                       |
| `surface-sunken` | `#f3ead8` | cabeceras de panel, inputs, filas hover |
| `ink`            | `#22223b` | texto principal y bordes                |
| `ink-muted`      | `#4a4e69` | texto secundario (7,98:1 sobre surface) |
| `accent`         | `#ffd866` | acción primaria, foco, selección        |
| `info` / `link`  | `#2f5d8a` | enlaces y mensajes informativos         |
| `success`        | `#2f7a43` | completado, instalado                   |
| `warning`        | `#9a5b00` | avisos, límites                         |
| `danger`         | `#b23a3a` | denegar, borrar, riesgo crítico         |

Cada color de estado tiene su variante `*-soft` (fondo al 12 %) para avisos.
Comprobar ≥4,5:1 para texto y ≥3:1 para bordes/iconos.

### 2. Tipografía — dos familias, escala cerrada

- **Pixel (`Press Start 2P`)**: solo para marca, títulos de pantalla/modal y
  etiquetas cortas en MAYÚSCULAS. Tamaños permitidos: **8, 12, 16, 24 px**
  (múltiplos de su rejilla). Nunca para párrafos ni texto de botón largo.
- **Sans (`IBM Plex Sans`)**: todo lo demás. Escala: **12 · 14 · 16 · 20** px
  (`text-xs/sm/base/xl`). Interlineado 1,5 en cuerpo.
- Se eliminan todos los `text-[Npx]`.

| Rol               | Estilo                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| Marca             | pixel 12 (HUD) / 24 (boot)                                                      |
| Título de modal   | pixel 12, mayúsculas                                                            |
| Título de sección | sans 16 semibold                                                                |
| Cuerpo            | sans 14                                                                         |
| Secundario/meta   | sans 12, `ink-muted`                                                            |
| Botón             | sans 14 semibold (pixel 8 solo en botones de 1–2 palabras del HUD si se quiere) |

### 3. Espaciado y forma

- Escala de 4 px: `4 · 8 · 12 · 16 · 24 · 32`. Padding de modal 24; de panel 16;
  de tarjeta 12; gap entre controles 8.
- **Bordes**: 4 px solo en el marco exterior de una superficie "pixel"
  (panel/modal); 2 px para controles (botón, input); 1 px para separadores
  internos. Nunca bordes anidados de 2+ px.
- **Sombra dura**: una sola, `4px 4px 0 rgb(0 0 0 / .35)`, solo en superficies
  flotantes y botón primario. Nada de 3/6/8 px.
- Esquinas siempre rectas (coherente con 8-bit).

### 4. Componentes base (crear en `src/ui/`)

| Componente                   | Variantes / contrato                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                     | `primary` (accent) · `secondary` (surface + borde) · `ghost` (sin borde) · `danger`; tamaños `sm` (32 px) / `md` (40 px); estados hover, active (hunde 2 px), focus-visible, disabled, loading                                                                                                                                          |
| `IconButton`                 | igual que Button, cuadrado, `aria-label` obligatorio por tipo                                                                                                                                                                                                                                                                           |
| `Modal`                      | Cabecera (título pixel 12 + cerrar `IconButton` siempre arriba a la derecha) · cuerpo con scroll · pie con acciones alineadas a la derecha (primaria a la derecha). `role="dialog"`, `aria-modal`, `aria-labelledby`, trampa de foco, `Esc`, clic fuera, retorno de foco, transición de entrada. Tamaños `sm` 420 / `md` 640 / `lg` 960 |
| `Panel`                      | marco 4 px, cabecera `surface-sunken`, cuerpo sin bordes internos                                                                                                                                                                                                                                                                       |
| `Field` / `Input` / `Select` | etiqueta visible, ayuda y error debajo, borde 2 px, fondo `surface` (no `white`)                                                                                                                                                                                                                                                        |
| `Badge`                      | neutral / success / warning / danger / info                                                                                                                                                                                                                                                                                             |
| `Toast`                      | reemplaza `alert()`; `role="status"` o `alert` según severidad                                                                                                                                                                                                                                                                          |
| `Callout`                    | aviso dentro de modal con icono + color semántico                                                                                                                                                                                                                                                                                       |

Una sola acción primaria por vista. Iconos solo de `lucide-react` (16/20 px),
sin emoji ni glifos Unicode como iconos.

### 5. Capas (z-index)

`map-overlay 10 · dialogue 20 · panel 30 · modal 40 · toast 50 · system 60`
(desconexión). Definidos como tokens; nada de `z-[100]`.

### 6. Layout

- ≥1280 px: sidebar (solo si hay >1 oficina) · oficina · panel derecho 360 px.
- 768–1279 px: panel derecho pasa a cajón deslizable desde la derecha.
- <768 px: oficina a ancho completo arriba; Sprint/Pendientes como pestañas
  debajo; HUD condensado en menú; controles táctiles (D-pad + botón "Hablar")
  sobre el canvas.
- El canvas escala por factor entero (×1, ×2, ×3) y se centra; el sobrante es
  fondo `bg`, no huecos arbitrarios.

### 7. Movimiento

Duraciones `120 / 160 / 200 ms`, easing `steps(n)` para lo "pixel" y
`ease-out` para opacidad. Todo condicionado a `prefers-reduced-motion`.

### 8. Texto e idioma

Todo texto visible sale de `i18n.ts`. Nada de estados internos en pantalla
(`setup`, `CHECK_SOURCE`, slugs): mapear a etiquetas humanas. Tono de "No-TI"
según `docs/CODE_STYLE.md`.

---

## Plan propuesto

**Fase 1 — Romper menos (1–2 días)**

1. ✅ Teclado en inputs. ✅ "F o E".
2. Autoalojar fuentes.
3. Componente `Modal` accesible y migrar los 5 modales (Esc, foco, roles).
4. `:focus-visible` global, `aria-label` en botones de icono, `lang` dinámico.
5. Toasts en lugar de `alert()`.

**Fase 2 — Sistema (3–4 días)** 6. Tokens de color/tipo/espaciado/z-index en Tailwind; eliminar `text-[Npx]`,
colores por defecto y el `<style>` inline de `App.tsx`. 7. `Button`, `IconButton`, `Panel`, `Field`, `Badge`; borrar `DialogueBox.tsx`. 8. Rediseño del HUD (agrupación + menú de ajustes) y del panel Sprint sin cajas
anidadas. 9. Todo el texto a `i18n.ts`.

**Fase 3 — Pulir (2–3 días)** 10. Layout responsive + controles táctiles. 11. Diálogo: historial completo, burbujas, Markdown mínimo, `Esc`. 12. Primer uso guiado (conectar cuenta), "Pedir cambios" con comentario. 13. Transiciones según la especificación de movimiento. 14. Prueba Playwright de regresión visual (capturas a 1440/1024/390) y
`@axe-core/playwright` en CI.
