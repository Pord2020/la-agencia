<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# La Agencia — Desktop experimental (Tauri)

Esta es la opción para personas que no deberían tener que abrir una terminal ni
recordar una URL local. Al abrir el icono:

1. se inicia un sidecar autocontenido en loopback;
2. se crea una sesión local aleatoria;
3. la ventana espera el health check y abre la oficina;
4. si el runtime cae, se reintenta como máximo cinco veces;
5. al cerrar la app, se detiene el proceso hijo.

Una segunda apertura enfoca la ventana existente. No abre otra oficina.

## Requisitos para compilar

- [Rust](https://rustup.rs/) + Cargo
- Node 20.19+ y npm
- Dependencias nativas de Tauri para el sistema operativo

## Desarrollo

```bash
# desde la raíz
npm install
npm run desktop:dev
```

El comando compila web+API, genera el ejecutable Node para el target actual y
abre Tauri.

## Instalador local

```bash
npm run desktop:build
```

Los artefactos quedan en `src-tauri/target/release/bundle/`. Son experimentales
y no están firmados por una identidad de plataforma en builds locales. El shell
incluye updater con verificación criptográfica; el workflow público se niega a
publicar si faltan la firma/notarización de plataforma o la clave del updater.

## Componentes empaquetados

- `agency-runtime`: Node autocontenido generado con `@yao-pkg/pkg`.
- `resources/web`: UI de producción servida por Hono.
- `resources/agents`: definiciones locales de agentes.
- Shell Tauri: ciclo de vida, ventana, instancia única y recuperación.

El paquete escucha únicamente en `127.0.0.1` y elige un puerto efímero libre. La
URL con el token de arranque se consume una vez y se reemplaza por una cookie
`HttpOnly`.
