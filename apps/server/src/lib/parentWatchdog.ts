// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Stops an embedded runtime when its desktop supervisor disappears.
 *
 * The explicit PID prevents a packaged sidecar from surviving an abrupt Tauri
 * exit and continuing to expose a stale loopback server. Permission errors
 * mean the process may still exist; only a missing process triggers shutdown.
 */
export function watchParentProcess(
  parentPid: number,
  onMissing: () => void,
  intervalMs = 1_000,
  processExists: (pid: number) => boolean = defaultProcessExists,
): () => void {
  if (!Number.isSafeInteger(parentPid) || parentPid <= 1) {
    throw new Error("Parent PID must be a positive process identifier");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 50) {
    throw new Error("Parent watchdog interval must be at least 50ms");
  }

  const timer = setInterval(() => {
    if (!processExists(parentPid)) onMissing();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

function defaultProcessExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code !== "ESRCH"
    );
  }
}
