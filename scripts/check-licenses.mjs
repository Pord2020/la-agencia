// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Rejects dependencies with unknown or strong-copyleft licenses.
 */

import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const denied = /\b(?:AGPL|GPL|SSPL|BUSL|Commons-Clause)\b/i;
const failures = [];
for (const [path, pkg] of Object.entries(lock.packages || {})) {
  if (!path || path.startsWith("apps/") || path.startsWith("packages/"))
    continue;
  if (pkg.link || pkg.name?.startsWith("@la-agencia/")) continue;
  const license = pkg.license;
  if (!license || denied.test(license))
    failures.push(`${pkg.name || path}: ${license || "UNKNOWN"}`);
}
if (failures.length) {
  console.error("Dependency licenses require review:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "OK: dependency licenses are declared and no denied license was found",
);
