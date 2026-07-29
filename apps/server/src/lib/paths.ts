// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { join, parse, resolve } from "node:path";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";

const currentDirectory = resolve(process.cwd());
const developmentRoot = existsSync(
  join(currentDirectory, "agents", "catalog.json"),
)
  ? currentDirectory
  : resolve(currentDirectory, "../..");

/** Resource root supplied by the package, or inferred for repository development. */
export const REPO_ROOT = resolve(
  process.env.LA_AGENCIA_RESOURCE_ROOT || developmentRoot,
);
export const AGENTS_ROOT =
  process.env.LA_AGENCIA_AGENTS_ROOT || join(REPO_ROOT, "agents");
export const WEB_DIST_ROOT =
  process.env.LA_AGENCIA_WEB_ROOT || join(REPO_ROOT, "apps", "web", "dist");
export const CONFIG_DIR =
  process.env.LA_AGENCIA_CONFIG_DIR || join(homedir(), ".la-agencia");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const PROJECTS_INDEX = join(CONFIG_DIR, "projects.json");
export const RESOURCE_CATALOG_FILE = join(CONFIG_DIR, "resource-catalog.json");
// offices.json lives in CONFIG_DIR

export function defaultWorkspacesRoot(): string {
  return join(homedir(), "AgencyProjects");
}

export function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function agencyDir(workspacePath: string) {
  return join(workspacePath, ".agency");
}

export function assertSafeWorkspace(workspacePath: string): string {
  const canonical = realpathSync(workspacePath);
  if (
    !statSync(canonical).isDirectory() ||
    canonical === parse(canonical).root ||
    canonical === realpathSync(homedir())
  ) {
    throw new Error("UNSAFE_WORKSPACE");
  }
  return canonical;
}
