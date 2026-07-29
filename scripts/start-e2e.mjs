// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Starts the compiled unified runtime for Playwright on every operating system.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PORT = "8787";
process.env.AGENCY_SESSION_TOKEN = "e2e-local-session-token-123456789012345";
process.env.LA_AGENCIA_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), "la-agencia-e2e-"),
);

await import("../apps/server/dist/index.js");
