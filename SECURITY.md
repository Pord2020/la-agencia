<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Política de seguridad / Security policy

[English version](SECURITY.en.md)

## Versiones soportadas

Solo la última versión menor recibe correcciones de seguridad. Durante la fase
pre-1.0, los cambios defensivos pueden modificar interfaces.

## Reportar una vulnerabilidad

Cuando exista el repositorio público, usa **GitHub Private Vulnerability
Reporting**. No publiques secretos, exploits ni rutas personales en issues.
Antes de habilitar ese canal, no se aceptarán distribuciones públicas.

Incluye impacto, versión, plataforma, pasos mínimos y una mitigación si la
conoces. El proyecto acusará recibo en 72 horas y coordinará la divulgación.

## Invariantes

- API únicamente en loopback y autenticada.
- Sin ejecución sensible antes de una decisión humana persistida.
- Sin túneles públicos automáticos.
- Sin secretos persistidos en el repositorio o `config.json`.
- Coding limitado al workspace canonicalizado.
