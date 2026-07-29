// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWireframeArtifact, verifyWorkspace } from "./verification.js";

function workspace(scripts?: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agency-verify-"));
  if (scripts) {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", scripts }),
    );
  }
  return root;
}

describe("workspace verification", () => {
  it("blocks when no verifiable command exists", async () => {
    const result = await verifyWorkspace({
      projectId: "no-checks",
      workspace: workspace(),
      sprintNumber: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.evidence[0]).toMatchObject({ kind: "log", ok: false });
  });

  it("executes detected commands and persists successful logs", async () => {
    const root = workspace({
      typecheck: "node -e \"console.log('types ok')\"",
      build: "node -e \"console.log('build ok')\"",
    });
    const result = await verifyWorkspace({
      projectId: "checks",
      workspace: root,
      sprintNumber: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((entry) => entry.ok)).toBe(true);
    for (const entry of result.evidence) {
      expect(entry.path && existsSync(entry.path)).toBe(true);
    }
  });

  it("blocks on the first failed command and keeps its log", async () => {
    const root = workspace({
      test: "node -e \"console.error('failed check'); process.exit(2)\"",
      build: "node -e \"console.log('must not run')\"",
    });
    const result = await verifyWorkspace({
      projectId: "failed",
      workspace: root,
      sprintNumber: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      kind: "command",
      ok: false,
    });
    expect(readFileSync(result.evidence[0].path!, "utf8")).toBeTruthy();
  });

  it("creates a durable wireframe artifact", () => {
    const root = workspace();
    const path = createWireframeArtifact({
      workspace: root,
      sprintNumber: 4,
      goal: "A clear flow",
    });
    expect(path).toContain(join(".agency", "artifacts"));
    expect(readFileSync(path, "utf8")).toContain("flowchart TD");
  });
});
