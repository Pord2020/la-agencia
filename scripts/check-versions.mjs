// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Verifies that every distributable surface reports the same release version.
 */

import { readFileSync } from "node:fs";

const jsonFiles = [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
  "packages/shared/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
];
const versions = jsonFiles.map((file) => [
  file,
  JSON.parse(readFileSync(file, "utf8")).version,
]);
const cargo = readFileSync("apps/desktop/src-tauri/Cargo.toml", "utf8").match(
  /^version = "([^"]+)"/m,
)?.[1];
versions.push(["apps/desktop/src-tauri/Cargo.toml", cargo]);
const runtime = readFileSync("packages/shared/src/version.ts", "utf8").match(
  /AGENCY_VERSION = "([^"]+)"/,
)?.[1];
versions.push(["packages/shared/src/version.ts", runtime]);
const expected = versions[0][1];
const mismatches = versions.filter(([, version]) => version !== expected);
if (mismatches.length) {
  console.error("Version mismatch:", mismatches);
  process.exit(1);
}
console.log(`OK: all packages use ${expected}`);
