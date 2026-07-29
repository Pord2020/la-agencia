// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && node scripts/start-e2e.mjs",
    url: "http://127.0.0.1:8787/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
