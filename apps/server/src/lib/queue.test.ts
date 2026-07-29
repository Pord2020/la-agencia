// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enqueue, loadQueue, updateQueueItem } from "./queue.js";

describe("project queue", () => {
  it("persists, updates and bounds queue items", () => {
    const workspace = mkdtempSync(join(tmpdir(), "agency-queue-"));
    const created = enqueue(workspace, {
      kind: "chat",
      title: "Fixture",
      projectId: "project",
      payload: { value: 1 },
    });
    expect(created.status).toBe("queued");
    expect(loadQueue(workspace)).toEqual([created]);

    const updated = updateQueueItem(workspace, created.id, {
      status: "done",
    });
    expect(updated?.status).toBe("done");
    expect(updateQueueItem(workspace, "missing", { status: "failed" })).toBe(
      null,
    );
  });
});
