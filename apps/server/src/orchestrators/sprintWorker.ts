// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module sprintWorker
 * Executes an approved sprint operation exactly once within this server process.
 */

import {
  getOperation,
  transitionOperation,
  updateOperation,
} from "../lib/operations.js";
import { getProjectById, withProjectLock } from "../lib/store.js";
import { runSprint } from "./po-techlead.js";

const active = new Map<string, AbortController>();
const OPERATION_TIMEOUT_MS = 20 * 60_000;
const RETRY_DELAY_MS = 1_000;

/** Schedules one queued operation and deduplicates concurrent calls in-process. */
export function scheduleSprintOperation(operationId: string): void {
  if (active.has(operationId)) return;
  const operation = getOperation(operationId);
  if (!operation || operation.status !== "queued") return;
  const controller = new AbortController();
  active.set(operationId, controller);
  setImmediate(() => void execute(operationId, controller));
}

async function execute(
  operationId: string,
  controller: AbortController,
): Promise<void> {
  let timedOut = false;
  let retry = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OPERATION_TIMEOUT_MS);
  timeout.unref();
  try {
    const operation = transitionOperation(operationId, ["queued"], "running");
    if (!operation) return;
    updateOperation(operationId, {
      attempts: operation.attempts + 1,
      timeoutAt: new Date(Date.now() + OPERATION_TIMEOUT_MS).toISOString(),
      error: undefined,
    });
    const sprint = await withProjectLock(operation.projectId, async () => {
      const project = getProjectById(operation.projectId);
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      return runSprint(project, operation.sprintId, {
        onVerifying: () => {
          transitionOperation(operationId, ["running"], "verifying");
        },
        signal: controller.signal,
      });
    });
    const blocked = sprint.tasks.some((task) => task.status === "blocked");
    updateOperation(operationId, { status: blocked ? "blocked" : "review" });
  } catch (error) {
    if (getOperation(operationId)?.status === "cancelled") return;
    const current = getOperation(operationId);
    const message = timedOut
      ? "OPERATION_TIMEOUT"
      : error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500);
    if (current && current.attempts < current.maxAttempts && !timedOut) {
      updateOperation(operationId, {
        status: "queued",
        error: `RETRY_AFTER:${message}`,
        timeoutAt: undefined,
      });
      retry = true;
    } else {
      updateOperation(operationId, {
        status: "failed",
        error: message,
        timeoutAt: undefined,
      });
    }
  } finally {
    clearTimeout(timeout);
    active.delete(operationId);
    if (retry) {
      const timer = setTimeout(
        () => scheduleSprintOperation(operationId),
        RETRY_DELAY_MS,
      );
      timer.unref();
    }
  }
}

/** Cancels pending or active work and aborts child processes when possible. */
export function cancelSprintOperation(operationId: string): boolean {
  const operation = getOperation(operationId);
  if (
    !operation ||
    !["waiting_permission", "queued", "running", "verifying"].includes(
      operation.status,
    )
  ) {
    return false;
  }
  active.get(operationId)?.abort();
  updateOperation(operationId, { status: "cancelled" });
  return true;
}

/** Resumes only operations that had not started before the previous shutdown. */
export function resumeQueuedSprintOperations(): void {
  // Import lazily to avoid keeping a stale snapshot while startup migrations run.
  void import("../lib/operations.js").then(({ listOperations }) => {
    for (const operation of listOperations()) {
      if (operation.status === "queued") scheduleSprintOperation(operation.id);
    }
  });
}
