// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Ensures human-authored source and documentation files declare their license.
 */

import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const roots = [
  "apps",
  "packages",
  "scripts",
  "agents",
  "adapters",
  "harnesses",
  "orchestrators",
  "docs",
];
const extensions = new Set([".ts", ".tsx", ".mjs", ".rs", ".md"]);
const ignored = new Set(["node_modules", "dist", "target"]);
const missing = [];
const licenseMarker = "SPDX-License-" + "Identifier: MIT";

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (
      extensions.has(extname(entry.name)) &&
      !readFileSync(path, "utf8").slice(0, 500).includes(licenseMarker)
    ) {
      missing.push(path);
    }
  }
}

for (const root of roots) visit(root);
if (missing.length) {
  console.error("Missing SPDX headers:\n" + missing.join("\n"));
  process.exit(1);
}
console.log("OK: SPDX headers found in all human-authored files");
