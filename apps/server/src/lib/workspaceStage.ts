// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module workspaceStage
 * Runs opaque coding tools against a secret-free staged copy and applies only
 * non-destructive, conflict-free file changes to the authorized workspace.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { assertSafeWorkspace, ensureDir } from "./paths.js";

const MAX_FILES = 20_000;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const EXCLUDED_DIRECTORIES = new Set([
  ".agency",
  ".git",
  ".hg",
  ".svn",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "target",
  "test-results",
]);
const SECRET_FILE_PATTERN =
  /(^|\/)(?:\.env(?:\.|$)|.*\.(?:key|pem|p12|pfx|keystore)$|credentials(?:\.json)?$)/i;

interface FileEntry {
  hash: string;
  mode: number;
  size: number;
}

export interface WorkspaceStage {
  originalWorkspace: string;
  stageDirectory: string;
  workspace: string;
  baseline: Map<string, FileEntry>;
}

export interface AppliedWorkspaceStage {
  ok: boolean;
  added: string[];
  modified: string[];
  deleted: string[];
  rejected: string[];
  stageDirectory?: string;
  errorCode?: string;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

function shouldExclude(relativePath: string, directory: boolean): boolean {
  const normalized = relativePath.split(sep).join("/");
  const segments = normalized.split("/");
  if (
    directory &&
    segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))
  ) {
    return true;
  }
  return SECRET_FILE_PATTERN.test(normalized);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function manifest(root: string): Map<string, FileEntry> {
  const result = new Map<string, FileEntry>();
  let totalBytes = 0;

  function visit(directory: string): void {
    for (const name of readdirSync(directory)) {
      const absolute = join(directory, name);
      const rel = relative(root, absolute);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`STAGE_SYMLINK_REJECTED:${rel}`);
      }
      if (stat.isDirectory()) {
        if (!shouldExclude(rel, true)) visit(absolute);
        continue;
      }
      if (!stat.isFile() || shouldExclude(rel, false)) continue;
      if (stat.size > MAX_FILE_BYTES) {
        throw new Error(`STAGE_FILE_TOO_LARGE:${rel}`);
      }
      totalBytes += stat.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("STAGE_WORKSPACE_TOO_LARGE");
      }
      if (result.size >= MAX_FILES) {
        throw new Error("STAGE_TOO_MANY_FILES");
      }
      result.set(rel, {
        hash: hashFile(absolute),
        mode: stat.mode & 0o777,
        size: stat.size,
      });
    }
  }

  visit(root);
  return result;
}

/** Creates a bounded staged copy inside the authorized workspace. */
export function prepareWorkspaceStage(
  workspacePath: string,
  taskId: string,
): WorkspaceStage {
  const originalWorkspace = assertSafeWorkspace(workspacePath);
  const baseline = manifest(originalWorkspace);
  const stagingRoot = join(originalWorkspace, ".agency", "staging");
  ensureDir(stagingRoot);
  const safeTaskId =
    basename(taskId)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80) || "job";
  const stageDirectory = mkdtempSync(join(stagingRoot, `${safeTaskId}-`));
  const workspace = join(stageDirectory, "workspace");
  mkdirSync(workspace, { recursive: true, mode: 0o700 });

  for (const [rel, entry] of baseline) {
    const source = resolve(originalWorkspace, rel);
    const destination = resolve(workspace, rel);
    if (
      !isWithin(originalWorkspace, source) ||
      !isWithin(workspace, destination)
    ) {
      throw new Error("STAGE_PATH_ESCAPE");
    }
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
    try {
      const fd = openSync(destination, "r+");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch {
      // The copied file remains valid on platforms without file fsync.
    }
    if (entry.mode & 0o100) {
      // Preserve executability without copying broader ownership metadata.
      statSync(destination);
    }
  }

  return { originalWorkspace, stageDirectory, workspace, baseline };
}

/**
 * Applies additions and modifications atomically. Deletions, symlinks and
 * concurrent source changes are rejected and leave the stage for review.
 */
export function applyWorkspaceStage(
  stage: WorkspaceStage,
): AppliedWorkspaceStage {
  let current: Map<string, FileEntry>;
  try {
    current = manifest(stage.workspace);
  } catch (error) {
    return {
      ok: false,
      added: [],
      modified: [],
      deleted: [],
      rejected: [],
      stageDirectory: stage.stageDirectory,
      errorCode: error instanceof Error ? error.message : "STAGE_INVALID",
    };
  }

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [rel, before] of stage.baseline) {
    const after = current.get(rel);
    if (!after) deleted.push(rel);
    else if (after.hash !== before.hash || after.mode !== before.mode)
      modified.push(rel);
  }
  for (const rel of current.keys()) {
    if (!stage.baseline.has(rel)) added.push(rel);
  }

  if (deleted.length) {
    return {
      ok: false,
      added,
      modified,
      deleted,
      rejected: deleted,
      stageDirectory: stage.stageDirectory,
      errorCode: "DELETE_PERMISSION_REQUIRED",
    };
  }

  const rejected: string[] = [];
  for (const rel of [...added, ...modified]) {
    const target = resolve(stage.originalWorkspace, rel);
    const source = resolve(stage.workspace, rel);
    if (
      !isWithin(stage.originalWorkspace, target) ||
      !isWithin(stage.workspace, source)
    ) {
      rejected.push(rel);
      continue;
    }
    if (existsSync(target)) {
      const targetStat = lstatSync(target);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
        rejected.push(rel);
        continue;
      }
      const baseline = stage.baseline.get(rel);
      if (!baseline || hashFile(target) !== baseline.hash) {
        rejected.push(rel);
      }
    } else if (stage.baseline.has(rel)) {
      rejected.push(rel);
    }
  }
  if (rejected.length) {
    return {
      ok: false,
      added,
      modified,
      deleted,
      rejected,
      stageDirectory: stage.stageDirectory,
      errorCode: "WORKSPACE_CHANGED_DURING_JOB",
    };
  }

  for (const rel of [...added, ...modified]) {
    const target = resolve(stage.originalWorkspace, rel);
    const source = resolve(stage.workspace, rel);
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.agency.tmp`;
    const payload = readFileSync(source);
    const fd = openSync(temporary, "w", current.get(rel)?.mode || 0o600);
    try {
      writeFileSync(fd, payload);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, target);
  }

  discardWorkspaceStage(stage);
  return { ok: true, added, modified, deleted, rejected };
}

export function discardWorkspaceStage(stage: WorkspaceStage): void {
  rmSync(stage.stageDirectory, { recursive: true, force: true });
}
