// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "@la-agencia/shared";
import { CONFIG_FILE } from "./paths.js";
import {
  loadProject,
  loadSettings,
  saveProject,
  saveSettings,
  withProjectLock,
} from "./store.js";

function project(workspacePath: string): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `project-${Date.now()}`,
    name: "Test",
    slug: "test",
    status: "setup",
    workspacePath,
    source: "new",
    brief: {
      goals: [],
      users: [],
      mustHaves: [],
      outOfScope: [],
      constraints: [],
      rawNotes: "",
    },
    hiredAgentIds: [],
    floorLeaders: ["pau"],
    sprints: [],
    epics: [],
    userTodos: [],
    messages: [],
    primaryAdapter: null,
    locale: "es",
    busyAgentIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("project store", () => {
  it("validates complete projects and rejects unsupported future schemas", () => {
    const workspace = mkdtempSync(join(tmpdir(), "agency-store-"));
    const valid = project(workspace);
    saveProject(valid);
    expect(loadProject(workspace)).toEqual(valid);

    const projectFile = join(workspace, ".agency", "project.json");
    writeFileSync(
      projectFile,
      JSON.stringify({ ...valid, schemaVersion: 999 }),
    );
    expect(loadProject(workspace)).toBeNull();
  });

  it("migrates settings and removes legacy API keys from persisted JSON", () => {
    const current = loadSettings();
    writeFileSync(
      CONFIG_FILE,
      JSON.stringify({
        ...current,
        schemaVersion: 0,
        llm: { ...current.llm, apiKey: "test-only-key" },
      }),
    );
    delete process.env.LA_AGENCIA_API_KEY;

    const migrated = loadSettings();
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.llm.apiKey).toBe("test-only-key");
    expect(readFileSync(CONFIG_FILE, "utf8")).not.toContain("test-only-key");
    delete process.env.LA_AGENCIA_API_KEY;
    saveSettings({ ...migrated, llm: { ...migrated.llm, apiKey: undefined } });
  });

  it("serializes concurrent mutations for the same project", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withProjectLock("serialized", async () => {
      events.push("first:start");
      await firstMayFinish;
      events.push("first:end");
    });
    const second = withProjectLock("serialized", () => {
      events.push("second");
    });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });
});
