<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Biblioteca de recursos / Resource Library

## Español

La biblioteca es un índice local de proyectos open source bien valorados,
plantillas de agentes y skills públicos. Se actualiza al iniciar y luego
comprueba su vigencia cada hora; una copia con menos de 24 horas no vuelve a
consultar la red.

Fuentes actuales:

- búsquedas temáticas de repositorios en GitHub;
- catálogos oficiales `openai/skills` y `anthropics/skills`;
- la colección comunitaria verificada
  [`Shubhamsaboo/awesome-llm-apps`](https://github.com/Shubhamsaboo/awesome-llm-apps),
  bajo Apache-2.0.

La colección verificada se indexa por recurso, no como un único enlace:

- cada `agent_skills/*/SKILL.md` directo se registra como skill;
- cada ejemplo documentado dentro de las nueve familias públicas de la
  colección se registra como plantilla de agente;
- carpetas internas como `frontend`, `backend`, `assets`, `scripts`, `tests` y
  `evals` se excluyen para evitar presentar componentes auxiliares como agentes;
- cada actualización descubre automáticamente recursos nuevos o removidos.

La selección de repositorios excluye forks, proyectos archivados, licencias
desconocidas y licencias bloqueadas. La puntuación combina estrellas, actividad
reciente, licencia y confianza de la fuente.

La actualización solo guarda metadatos y nunca ejecuta archivos. Una acción
separada de adquisición, disponible solo para agentes y skills con licencia
permitida, exige permiso individual. Esa acción clona con configuración Git
aislada, fija y verifica un commit de 40 caracteres, rechaza symlinks, secretos,
licencias bloqueadas, runtimes anidados y escapes de ruta, y guarda una copia
read-only por versión. Las versiones anteriores se conservan y solo pueden
reactivarse si su hash sigue coincidiendo; retirar una versión la mueve a una
papelera local recuperable.

Los skills oficiales se etiquetan
`license-review-required` porque un repositorio puede contener archivos con
condiciones distintas. Las plantillas verificadas se etiquetan como no
instaladas y exigen revisar el código; además se infieren alertas conservadoras
para red, servicios externos, navegador, micrófono, ingesta de datos y dominios
de alto impacto.

Los agentes reciben hasta cinco referencias relevantes dentro de su contexto.
Esas referencias son sugerencias, no capacidades concedidas.

Configuración opcional:

- `GITHUB_TOKEN`: aumenta límites de API; solo se lee desde el entorno.
- `POST /api/catalog/refresh`: actualización manual con cooldown de cinco
  minutos.

## English

The library is a local index of reputable open-source projects, agent templates
and public agent skills. It refreshes at startup and checks freshness hourly;
snapshots younger than 24 hours do not hit the network again.

Current sources are topic-based GitHub repository searches, the official
`openai/skills` and `anthropics/skills` catalogs, and the verified Apache-2.0
`Shubhamsaboo/awesome-llm-apps` collection. Every direct
`agent_skills/*/SKILL.md` entry and every documented example under its nine
public template families is indexed separately. Auxiliary folders such as
frontends, backends, assets, scripts, tests and evals are excluded. New
resources are discovered on every refresh.

Repository selection excludes forks, archived projects, unknown licenses and
blocked licenses. Scores combine stars, recent activity, license and source
trust.

Refresh stores metadata only and never executes files. A separate acquisition
action is available only for agents and skills with an allowed license and
requires one-time permission. It uses isolated Git configuration, pins and
verifies a 40-character commit, rejects symlinks, secrets, blocked licenses,
nested runtimes and path escapes, and stores a read-only version. Prior versions
remain available for hash-verified rollback; removal uses recoverable local
trash. Official skills carry `license-review-required`; verified templates
carry conservative review and capability-risk flags. Agents receive at most
five relevant references as suggestions, never as granted capabilities.
