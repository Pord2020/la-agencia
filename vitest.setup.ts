// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.LA_AGENCIA_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), "la-agencia-test-"),
);
process.env.AGENCY_SESSION_TOKEN =
  "test-session-token-that-is-at-least-32-characters";
process.env.LA_AGENCIA_FAKE_ADAPTER = "1";
