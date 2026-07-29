// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("operations", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("deduplicates a sprint by idempotency key", async () => {
    const operations = await import("./operations.js");
    const input = {
      projectId: "p1",
      sprintId: "s1",
      idempotencyKey: "same-key",
    };
    const first = operations.createSprintOperation(input);
    const second = operations.createSprintOperation(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.operation.id).toBe(first.operation.id);
  });

  it("only performs valid compare-and-set transitions", async () => {
    const operations = await import("./operations.js");
    const created = operations.createSprintOperation({
      projectId: "p2",
      sprintId: "s2",
      idempotencyKey: "transition-key",
    }).operation;
    expect(
      operations.transitionOperation(created.id, ["queued"], "running"),
    ).toBeNull();
    expect(
      operations.transitionOperation(
        created.id,
        ["waiting_permission"],
        "queued",
      )?.status,
    ).toBe("queued");
  });

  it("filters, updates, and handles missing operations", async () => {
    const operations = await import("./operations.js");
    const created = operations.createSprintOperation({
      projectId: "filter-project",
      sprintId: "filter-sprint",
      idempotencyKey: "filter-key",
    }).operation;
    expect(
      operations
        .listOperations("filter-project")
        .some((item) => item.id === created.id),
    ).toBe(true);
    expect(operations.listOperations("not-this-project")).toHaveLength(0);
    expect(operations.getOperation("missing")).toBeNull();
    expect(
      operations.updateOperation("missing", { status: "failed" }),
    ).toBeNull();
    expect(
      operations.transitionOperation("missing", ["queued"], "running"),
    ).toBeNull();
    expect(
      operations.updateOperation(created.id, {
        permissionRequestId: "permission",
        error: "example",
      }),
    ).toMatchObject({ permissionRequestId: "permission", error: "example" });
  });

  it("marks interrupted running and verifying operations as failed", async () => {
    const operations = await import("./operations.js");
    const running = operations.createSprintOperation({
      projectId: "recovery",
      sprintId: "running",
      idempotencyKey: "recovery-running",
    }).operation;
    const verifying = operations.createSprintOperation({
      projectId: "recovery",
      sprintId: "verifying",
      idempotencyKey: "recovery-verifying",
    }).operation;
    operations.updateOperation(running.id, { status: "running" });
    operations.updateOperation(verifying.id, { status: "verifying" });
    const recovered = operations.recoverInterruptedOperations();
    expect(recovered.map((item) => item.id)).toEqual(
      expect.arrayContaining([running.id, verifying.id]),
    );
    expect(operations.getOperation(running.id)).toMatchObject({
      status: "failed",
      error: "INTERRUPTED_BY_RESTART",
    });
  });
});
