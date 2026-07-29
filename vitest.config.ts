// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["apps/server/src/**/*.ts", "packages/shared/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/dist/**",
        // The process bootstrap is covered by Playwright; unit coverage targets
        // the importable application and runtime contracts.
        "apps/server/src/index.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
