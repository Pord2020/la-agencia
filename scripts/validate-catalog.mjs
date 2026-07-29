// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(join(root, "agents/catalog.json"), "utf8"),
);
let missing = 0;
for (const a of catalog.agents) {
  const p = join(root, a.path);
  if (!existsSync(p)) {
    console.error("Missing:", a.path);
    missing++;
  }
}
if (missing) {
  console.error(`FAIL: ${missing} missing files`);
  process.exit(1);
}
console.log(`OK: ${catalog.count} agents, all paths exist`);
