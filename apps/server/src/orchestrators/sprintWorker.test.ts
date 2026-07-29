// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  createSprintOperation,
  getOperation,
  transitionOperation,
  updateOperation,
} from "../lib/operations.js";
import {
  cancelSprintOperation,
  resumeQueuedSprintOperations,
  scheduleSprintOperation,
} from "./sprintWorker.js";

function queued(key: string) {
  const operation = createSprintOperation({
    projectId: `missing-project-${key}`,
    sprintId: `sprint-${key}`,
    idempotencyKey: `worker-${key}-${Date.now()}-${Math.random()}`,
  }).operation;
  transitionOperation(operation.id, ["waiting_permission"], "queued");
  return operation;
}

describe("sprint worker lifecycle", () => {
  it("ignores missing and non-queued scheduling requests", () => {
    expect(scheduleSprintOperation("missing")).toBeUndefined();
    const waiting = createSprintOperation({
      projectId: "worker-waiting",
      sprintId: "waiting",
      idempotencyKey: `waiting-${Date.now()}`,
    }).operation;
    expect(scheduleSprintOperation(waiting.id)).toBeUndefined();
    expect(cancelSprintOperation(waiting.id)).toBe(true);
    expect(getOperation(waiting.id)?.status).toBe("cancelled");
    expect(cancelSprintOperation(waiting.id)).toBe(false);
  });

  it("aborts queued work before execution and never revives it", async () => {
    const operation = queued("cancel");
    scheduleSprintOperation(operation.id);
    scheduleSprintOperation(operation.id);
    expect(cancelSprintOperation(operation.id)).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(getOperation(operation.id)?.status).toBe("cancelled");
  });

  it("retries a transient missing-project failure once and then fails persistently", async () => {
    const operation = queued("retry");
    scheduleSprintOperation(operation.id);
    const deadline = Date.now() + 4_000;
    while (
      getOperation(operation.id)?.status !== "failed" &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(getOperation(operation.id)).toMatchObject({
      status: "failed",
      attempts: 2,
      maxAttempts: 2,
      error: "PROJECT_NOT_FOUND",
    });
  });

  it("resumes persisted queued operations and skips terminal records", async () => {
    const operation = queued("resume");
    const terminal = queued("terminal");
    updateOperation(terminal.id, { status: "failed" });
    resumeQueuedSprintOperations();
    const deadline = Date.now() + 4_000;
    while (
      getOperation(operation.id)?.status !== "failed" &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(getOperation(operation.id)?.status).toBe("failed");
    expect(getOperation(terminal.id)?.status).toBe("failed");
  });
});
