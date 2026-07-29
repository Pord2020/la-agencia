<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Distribución dual experimental

La Agencia se ofrece en **dos formas**. Ambas usan el **mismo código** de producto
(`apps/web` + `apps/server` + `agents/`).

## 1. Liviana — recomendada para contribuir

```bash
cd "La Agencia"
npm install
npm run agency
```

- Compila y arranca web+API en un solo runtime (`127.0.0.1:8787`)
- Abre el navegador
- Ideal para desarrollo y para quien ya tiene Node
- Supervisa el servidor y aplica reintentos acotados

## 2. Desktop — recomendada para pruebas No-TI

El shell nativo v0.4 incluye el sidecar autocontenido, política CSP, instancia
única y supervisor. Una persona abre un icono; no ejecuta `npm`, no recuerda
puertos y no reinicia manualmente el servidor.

- Más cómoda para usuarios No-TI (icono en el Dock)
- Mantiene el mismo cerebro Hono y la misma UI que el modo liviano
- Asigna un puerto efímero desde el proceso nativo; el cliente no puede elegirlo
- Finaliza el sidecar cuando termina la aplicación
- Reintenta caídas con espera exponencial y un límite de cinco

```bash
npm install
npm run desktop:build
```

Los builds locales quedan en
`apps/desktop/src-tauri/target/release/bundle/`. Los paquetes locales siguen
siendo experimentales. La automatización pública exige firma/notarización
configurada, manifiestos de updater firmados y una prueba de
instalación/arranque por plataforma antes de adjuntar artefactos.

## Automatización de releases

El workflow `desktop-release.yml` genera artefactos separados en macOS, Ubuntu y
Windows. No publica ni firma sin una acción explícita de mantenimiento.

## Licencia

MIT en todo el monorepo. **No se incorpora código GPL** (p. ej. de otros
productos de oficina agéntica). Ideas reimplementadas de cero.
