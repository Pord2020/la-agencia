// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module resourceAcquisition
 * Acquires an explicitly approved catalog resource at an immutable Git commit,
 * scans it locally and installs a read-only copy without executing its code.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { ResourceCatalogItem } from "@la-agencia/shared";
import { CONFIG_DIR, ensureDir } from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

const execFileAsync = promisify(execFile);
const MAX_FILES = 2_000;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const INSTALLATIONS_FILE = join(CONFIG_DIR, "resource-installations.json");
const INSTALLATIONS_ROOT = join(CONFIG_DIR, "resources");
const TRASH_ROOT = join(CONFIG_DIR, "resource-trash");
const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
]);
const DENIED_LICENSE_PATTERN = /\b(?:AGPL|GPL|SSPL)(?:[-\s]?\d(?:\.\d)?)?\b/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const installationSchema = z.object({
  id: z.string(),
  catalogItemId: z.string(),
  projectId: z.string(),
  repository: z.string(),
  resourcePath: z.string(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  license: z.string(),
  installedAt: z.string(),
  status: z.enum(["active", "superseded", "removed"]),
  installPath: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  riskFlags: z.array(z.string()),
});
const installationsSchema = z.array(installationSchema);
const githubRepositorySchema = z.object({
  default_branch: z.string().min(1).max(255),
});
const githubCommitSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{40}$/),
});

export type ResourceInstallation = z.infer<typeof installationSchema>;
type GitRunner = (
  args: string[],
  options: {
    timeout: number;
    maxBuffer?: number;
    env: NodeJS.ProcessEnv;
  },
) => Promise<{ stdout: string; stderr: string }>;

function loadInstallations(): ResourceInstallation[] {
  return readJson(INSTALLATIONS_FILE, installationsSchema, []);
}

function saveInstallations(installations: ResourceInstallation[]): void {
  writeJsonAtomic(INSTALLATIONS_FILE, installations.slice(-1_000));
}

function safeIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

function gitEnvironment(tempHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: tempHome,
    USERPROFILE: tempHome,
    TMPDIR: tempHome,
    TEMP: tempHome,
    TMP: tempHome,
    LANG: process.env.LANG || "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  };
}

async function githubJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "la-agencia-resource-acquisition",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GITHUB_${response.status}`);
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024)
    throw new Error("GITHUB_PAYLOAD_TOO_LARGE");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("GITHUB_INVALID_JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error("GITHUB_SCHEMA_MISMATCH");
  return parsed.data;
}

function inspectResource(root: string): {
  contentHash: string;
  fileCount: number;
  totalBytes: number;
} {
  const aggregate = createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;

  function visit(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const rel = relative(root, absolute).split(sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${rel}`);
      if (stat.isDirectory()) {
        if (name === ".git" || name === "node_modules") {
          throw new Error(`NESTED_RUNTIME_REJECTED:${rel}`);
        }
        visit(absolute);
        continue;
      }
      if (!stat.isFile()) throw new Error(`SPECIAL_FILE_REJECTED:${rel}`);
      fileCount += 1;
      totalBytes += stat.size;
      if (fileCount > MAX_FILES) throw new Error("RESOURCE_TOO_MANY_FILES");
      if (totalBytes > MAX_BYTES) throw new Error("RESOURCE_TOO_LARGE");
      if (stat.size > MAX_FILE_BYTES) throw new Error(`FILE_TOO_LARGE:${rel}`);
      const content = readFileSync(absolute);
      aggregate.update(rel);
      aggregate.update("\0");
      aggregate.update(content);
      aggregate.update("\0");
      const extension = rel.includes(".")
        ? `.${rel.split(".").pop()?.toLowerCase()}`
        : "";
      if (TEXT_EXTENSIONS.has(extension)) {
        const text = content.toString("utf8");
        if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
          throw new Error(`POTENTIAL_SECRET:${rel}`);
        }
        if (
          /(?:^|\/)(?:license|copying)(?:\.[^/]*)?$/i.test(rel) &&
          DENIED_LICENSE_PATTERN.test(text)
        ) {
          throw new Error(`DENIED_LICENSE:${rel}`);
        }
      }
    }
  }

  visit(root);
  if (!fileCount) throw new Error("RESOURCE_EMPTY");
  return {
    contentHash: aggregate.digest("hex"),
    fileCount,
    totalBytes,
  };
}

function makeReadOnly(root: string): void {
  for (const name of readdirSync(root)) {
    const absolute = join(root, name);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      makeReadOnly(absolute);
      chmodSync(absolute, 0o500);
    } else if (stat.isFile()) {
      chmodSync(absolute, stat.mode & 0o111 ? 0o500 : 0o400);
    }
  }
  chmodSync(root, 0o500);
}

/** Lists persisted installations without touching the network. */
export function listResourceInstallations(
  projectId?: string,
): ResourceInstallation[] {
  return loadInstallations().filter(
    (installation) => !projectId || installation.projectId === projectId,
  );
}

/**
 * Clones a public repository with isolated Git configuration, verifies the
 * immutable commit and installs only the selected catalog subtree.
 */
export async function acquireCatalogResource(input: {
  item: ResourceCatalogItem;
  projectId: string;
  fetchImpl?: typeof fetch;
  gitRunner?: GitRunner;
}): Promise<ResourceInstallation> {
  const { item } = input;
  if (
    item.kind === "repository" ||
    !item.resourcePath ||
    !["official", "verified"].includes(item.trust)
  ) {
    throw new Error("RESOURCE_NOT_ACQUIRABLE");
  }
  if (!ALLOWED_LICENSES.has(item.license)) {
    throw new Error("RESOURCE_LICENSE_NOT_ALLOWED");
  }
  if (item.riskFlags.includes("self-modifying")) {
    throw new Error("SELF_MODIFYING_RESOURCE_BLOCKED");
  }

  const fetchImpl = input.fetchImpl || fetch;
  const gitRunner: GitRunner =
    input.gitRunner ||
    (async (args, options) => {
      const result = await execFileAsync("git", args, options);
      return {
        stdout: String(result.stdout || ""),
        stderr: String(result.stderr || ""),
      };
    });
  const repository = await githubJson(
    `/repos/${item.repository}`,
    githubRepositorySchema,
    fetchImpl,
  );
  const commit = await githubJson(
    `/repos/${item.repository}/commits/${encodeURIComponent(repository.default_branch)}`,
    githubCommitSchema,
    fetchImpl,
  );
  const tempDirectory = mkdtempSync(join(tmpdir(), "la-agencia-resource-"));
  const cloneDirectory = join(tempDirectory, "repository");
  const tempHome = join(tempDirectory, "home");
  mkdirSync(tempHome, { recursive: true, mode: 0o700 });

  try {
    await gitRunner(
      [
        "-c",
        "protocol.file.allow=never",
        "-c",
        "submodule.recurse=false",
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--no-tags",
        "--branch",
        repository.default_branch,
        `https://github.com/${item.repository}.git`,
        cloneDirectory,
      ],
      {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: gitEnvironment(tempHome),
      },
    );
    const { stdout } = await gitRunner(
      ["-C", cloneDirectory, "rev-parse", "HEAD"],
      {
        timeout: 5_000,
        env: gitEnvironment(tempHome),
      },
    );
    if (stdout.trim() !== commit.sha) throw new Error("COMMIT_RACE_DETECTED");

    const repositoryRoot = realpathSync(cloneDirectory);
    const selected = realpathSync(resolve(repositoryRoot, item.resourcePath));
    if (
      !isWithin(repositoryRoot, selected) ||
      !statSync(selected).isDirectory()
    )
      throw new Error("RESOURCE_PATH_ESCAPE");
    const inspection = inspectResource(selected);

    ensureDir(INSTALLATIONS_ROOT);
    const resourceId = safeIdentifier(item.id);
    const versionRoot = join(INSTALLATIONS_ROOT, resourceId);
    ensureDir(versionRoot);
    const destination = join(versionRoot, commit.sha);
    if (!existsSync(destination)) {
      const incoming = join(
        versionRoot,
        `.incoming-${process.pid}-${Date.now()}`,
      );
      cpSync(selected, incoming, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
      });
      const copied = inspectResource(incoming);
      if (copied.contentHash !== inspection.contentHash) {
        rmSync(incoming, { recursive: true, force: true });
        throw new Error("COPY_INTEGRITY_FAILED");
      }
      makeReadOnly(incoming);
      renameSync(incoming, destination);
    }

    const installations = loadInstallations().map((installation) =>
      installation.catalogItemId === item.id &&
      installation.projectId === input.projectId &&
      installation.status === "active"
        ? { ...installation, status: "superseded" as const }
        : installation,
    );
    const installed: ResourceInstallation = {
      id: safeIdentifier(`${input.projectId}:${item.id}:${commit.sha}`),
      catalogItemId: item.id,
      projectId: input.projectId,
      repository: item.repository,
      resourcePath: item.resourcePath,
      commit: commit.sha,
      contentHash: inspection.contentHash,
      license: item.license,
      installedAt: new Date().toISOString(),
      status: "active",
      installPath: destination,
      fileCount: inspection.fileCount,
      totalBytes: inspection.totalBytes,
      riskFlags: item.riskFlags,
    };
    const existingIndex = installations.findIndex(
      (installation) => installation.id === installed.id,
    );
    if (existingIndex >= 0) installations[existingIndex] = installed;
    else installations.push(installed);
    saveInstallations(installations);
    return installed;
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

/** Moves an installation to recoverable local trash and marks it removed. */
export function removeResourceInstallation(
  installationId: string,
  projectId: string,
): ResourceInstallation | null {
  const installations = loadInstallations();
  const index = installations.findIndex(
    (installation) =>
      installation.id === installationId &&
      installation.projectId === projectId &&
      installation.status !== "removed",
  );
  if (index < 0) return null;
  const installation = installations[index];
  if (existsSync(installation.installPath)) {
    ensureDir(TRASH_ROOT);
    chmodSync(installation.installPath, 0o700);
    const trashPath = join(
      TRASH_ROOT,
      `${basename(dirname(installation.installPath))}-${installation.commit}-${Date.now()}`,
    );
    renameSync(installation.installPath, trashPath);
  }
  installations[index] = { ...installation, status: "removed" };
  saveInstallations(installations);
  return installations[index];
}

/**
 * Reactivates an immutable version that is still present and whose content
 * continues to match the hash recorded at acquisition time.
 */
export function activateResourceInstallation(
  installationId: string,
  projectId: string,
): ResourceInstallation | null {
  const installations = loadInstallations();
  const index = installations.findIndex(
    (installation) =>
      installation.id === installationId &&
      installation.projectId === projectId &&
      installation.status === "superseded",
  );
  if (index < 0) return null;
  const selected = installations[index];
  if (!existsSync(selected.installPath)) {
    throw new Error("RESOURCE_VERSION_MISSING");
  }
  const canonical = realpathSync(selected.installPath);
  if (!statSync(canonical).isDirectory()) {
    throw new Error("RESOURCE_VERSION_INVALID");
  }
  const inspection = inspectResource(canonical);
  if (
    inspection.contentHash !== selected.contentHash ||
    inspection.fileCount !== selected.fileCount ||
    inspection.totalBytes !== selected.totalBytes
  ) {
    throw new Error("RESOURCE_VERSION_INTEGRITY_FAILED");
  }
  for (let cursor = 0; cursor < installations.length; cursor += 1) {
    const installation = installations[cursor];
    if (
      installation.projectId === projectId &&
      installation.catalogItemId === selected.catalogItemId &&
      installation.status === "active"
    ) {
      installations[cursor] = {
        ...installation,
        status: "superseded",
      };
    }
  }
  installations[index] = {
    ...selected,
    status: "active",
    installedAt: new Date().toISOString(),
  };
  saveInstallations(installations);
  return installations[index];
}
