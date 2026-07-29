// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module jsonStore
 * Crash-safe JSON persistence with schema validation and recoverable backups.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { ensureDir } from "./paths.js";

/** Reads and validates JSON, recovering from the last known-good backup. */
export function readJson<T>(
  file: string,
  schema: { parse(value: unknown): T },
  fallback: T,
): T {
  if (!existsSync(file)) return fallback;
  try {
    return schema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    const backup = `${file}.bak`;
    if (existsSync(backup)) {
      try {
        return schema.parse(JSON.parse(readFileSync(backup, "utf8")));
      } catch {
        // The caller-provided fallback is the last safe recovery option.
      }
    }
    return fallback;
  }
}

/** Replaces a JSON file atomically while retaining one recoverable backup. */
export function writeJsonAtomic(file: string, value: unknown): void {
  ensureDir(dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  const backup = `${file}.bak`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(fd, payload, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  if (existsSync(file)) copyFileSync(file, backup);
  renameSync(temporary, file);
  try {
    const directoryFd = openSync(dirname(file), "r");
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } catch {
    // Some platforms do not support fsync on directories.
  }
  if (existsSync(temporary)) unlinkSync(temporary);
}
