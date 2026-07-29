// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyWorkspaceStage,
  discardWorkspaceStage,
  prepareWorkspaceStage,
} from "./workspaceStage.js";

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "agency-stage-test-"));
  writeFileSync(join(root, "existing.txt"), "before\n");
  mkdirSync(join(root, ".agency"), { recursive: true });
  writeFileSync(join(root, ".env"), "SECRET=must-not-copy\n");
  return root;
}

describe("workspace stage", () => {
  it("applies additions and modifications without copying secrets", () => {
    const root = workspace();
    const stage = prepareWorkspaceStage(root, "task");
    expect(existsSync(join(stage.workspace, ".env"))).toBe(false);

    writeFileSync(join(stage.workspace, "existing.txt"), "after\n");
    writeFileSync(join(stage.workspace, "added.txt"), "new\n");
    const result = applyWorkspaceStage(stage);

    expect(result).toMatchObject({
      ok: true,
      added: ["added.txt"],
      modified: ["existing.txt"],
      deleted: [],
    });
    expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("after\n");
    expect(readFileSync(join(root, "added.txt"), "utf8")).toBe("new\n");
    expect(existsSync(stage.stageDirectory)).toBe(false);
  });

  it("rejects deletions and preserves the staged evidence", () => {
    const root = workspace();
    const stage = prepareWorkspaceStage(root, "delete");
    const file = join(stage.workspace, "existing.txt");
    writeFileSync(file, "");
    const first = applyWorkspaceStage(stage);
    expect(first.ok).toBe(true);

    const secondStage = prepareWorkspaceStage(root, "delete-real");
    rmSync(join(secondStage.workspace, "existing.txt"));
    const result = applyWorkspaceStage(secondStage);
    expect(result).toMatchObject({
      ok: false,
      errorCode: "DELETE_PERMISSION_REQUIRED",
      deleted: ["existing.txt"],
    });
    expect(existsSync(secondStage.stageDirectory)).toBe(true);
    expect(existsSync(join(root, "existing.txt"))).toBe(true);
    discardWorkspaceStage(secondStage);
  });

  it("rejects concurrent source changes and staged symlinks", () => {
    const root = workspace();
    const stage = prepareWorkspaceStage(root, "conflict");
    writeFileSync(join(stage.workspace, "existing.txt"), "agent\n");
    writeFileSync(join(root, "existing.txt"), "human\n");
    expect(applyWorkspaceStage(stage)).toMatchObject({
      ok: false,
      errorCode: "WORKSPACE_CHANGED_DURING_JOB",
    });
    discardWorkspaceStage(stage);

    const symlinkStage = prepareWorkspaceStage(root, "symlink");
    symlinkSync("/etc/passwd", join(symlinkStage.workspace, "escape"));
    expect(applyWorkspaceStage(symlinkStage)).toMatchObject({
      ok: false,
      errorCode: expect.stringContaining("STAGE_SYMLINK_REJECTED"),
    });
    discardWorkspaceStage(symlinkStage);
  });
});
