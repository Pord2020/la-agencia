<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Privacidad

- **Local-first:** el servidor de La Agencia corre en `localhost`.
- **Cuentas:** el camino normal es login de suscripción (Claude, Grok, Cursor…) en tu máquina. No pedimos “API keys” al usuario no técnico.
- **Keys avanzadas (opcional):** no se guardan en `config.json`. Solo pueden
  inyectarse durante la sesión mediante `LA_AGENCIA_API_KEY`.
- **Sesión local:** el launcher usa un token de arranque de un solo equipo y una
  cookie HttpOnly; otras páginas no pueden llamar libremente a la API local.
- **Previews:** son locales por defecto. Un enlace público requiere permiso
  explícito, muestra caducidad y puede cerrarse.
- **Sin telemetría por defecto.**
- **Workspaces:** en rutas que elijas tú.
- **Adapters de terceros:** al usar Cursor, Grok Build, etc., aplican las políticas de *ese* proveedor. La Agencia no reenvía tu código a un backend propio.
- **Open source:** puedes auditar qué se envía y a quién.
