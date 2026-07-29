// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Runs the official REUSE linter through an available isolated Python runner.
 */

import { spawnSync } from "node:child_process";

const candidates =
  process.platform === "win32"
    ? [
        ["reuse", ["lint"]],
        [
          "pipx",
          [
            "run",
            "--spec",
            "reuse[charset-normalizer]==6.2.0",
            "reuse",
            "lint",
          ],
        ],
      ]
    : [
        ["reuse", ["lint"]],
        [
          "uvx",
          ["--from", "reuse[charset-normalizer]==6.2.0", "reuse", "lint"],
        ],
        [
          "pipx",
          [
            "run",
            "--spec",
            "reuse[charset-normalizer]==6.2.0",
            "reuse",
            "lint",
          ],
        ],
      ];

for (const [command, args] of candidates) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (!result.error) process.exit(result.status ?? 1);
  if ("code" in result.error && result.error.code !== "ENOENT") {
    throw result.error;
  }
}

console.error(
  "REUSE is unavailable. Install reuse, uvx, or pipx and run npm run reuse:check again.",
);
process.exit(1);
