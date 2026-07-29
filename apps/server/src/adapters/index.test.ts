// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterId, CodingJob } from "@la-agencia/shared";
import {
  adapterNames,
  buildCodingEnvironment,
  detectAdapters,
  runCodingJob,
  startAdapterLogin,
  type AdapterLoginRuntime,
  type AdapterRuntime,
  usageReport,
} from "./index.js";
import { loadSettings, saveSettings } from "../lib/store.js";

const originalFake = process.env.LA_AGENCIA_FAKE_ADAPTER;

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "agency-adapter-"));
  mkdirSync(join(root, ".agency"), { recursive: true });
  writeFileSync(join(root, "source.txt"), "source\n");
  return root;
}

function job(
  cwd: string,
  adapterId: AdapterId = "codex",
  signal?: AbortSignal,
): CodingJob {
  return {
    projectId: "adapter-project",
    taskId: `task-${Date.now()}-${Math.random()}`,
    cwd,
    adapterId,
    prompt: "Implement one deterministic file.",
    signal,
  };
}

function runtime(overrides: Partial<AdapterRuntime> = {}): AdapterRuntime {
  return {
    resolveBinary: async () => "/test/bin",
    version: async () => "v1.2.3",
    appPresent: () => null,
    execute: async () => ({ stdout: "done", stderr: "" }),
    environment: () => ({ PATH: process.env.PATH }),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.LA_AGENCIA_FAKE_ADAPTER = "0";
});

afterEach(() => {
  if (originalFake === undefined) delete process.env.LA_AGENCIA_FAKE_ADAPTER;
  else process.env.LA_AGENCIA_FAKE_ADAPTER = originalFake;
});

describe("adapter contracts", () => {
  it("reports executable, GUI-only and missing tools with honest policies", async () => {
    const detected = await detectAdapters({
      resolveBinary: async (bins) =>
        bins.includes("codex") ? "/safe/codex" : null,
      version: async () => "codex 1.0",
      appPresent: (id) => (id === "cursor" ? "/Applications/Cursor.app" : null),
    });
    expect(detected).toHaveLength(6);
    expect(detected.find((entry) => entry.id === "codex")).toMatchObject({
      installed: true,
      version: "codex 1.0",
      detail: "/safe/codex",
      capabilities: { coding: true },
      policy: { isolation: "staged-workspace", autonomousCoding: true },
    });
    expect(detected.find((entry) => entry.id === "cursor")).toMatchObject({
      installed: true,
      capabilities: { coding: false },
      policy: { isolation: "manual-only", autonomousCoding: false },
    });
    expect(
      detected.find((entry) => entry.id === "antigravity")?.detail,
    ).toContain("No se encontró");
    expect(Object.keys(adapterNames())).toHaveLength(6);
  });

  it("reports cursor usage at ok, warning and critical levels", async () => {
    const base = loadSettings();
    for (const [used, expected] of [
      [1, "ok"],
      [8.5, "warn"],
      [9.6, "critical"],
    ] as const) {
      saveSettings({
        ...base,
        usage: {
          ...base.usage,
          cursorHoursLimit: 10,
          cursorHoursUsed: used,
          warnAt: 0.8,
          blockHeavyAt: 0.95,
        },
      });
      expect((await usageReport("cursor")).level).toBe(expected);
    }
    expect((await usageReport("codex")).level).toBe("unknown");
    saveSettings(base);
  });

  it("blocks missing and policy-unsafe autonomous CLIs", async () => {
    const root = workspace();
    const missing = await runCodingJob(
      job(root, "antigravity"),
      runtime({ resolveBinary: async () => null }),
    );
    expect(missing).toMatchObject({ ok: false, mode: "brief-only" });
    expect(missing.output).toContain("No instalado");

    const manualOnly = await runCodingJob(job(root, "claude-code"), runtime());
    expect(manualOnly).toMatchObject({ ok: false, mode: "brief-only" });
    expect(manualOnly.output).toContain("política autónoma");
  });

  it("applies successful Codex output only through the staged workspace", async () => {
    const root = workspace();
    const execute = vi.fn(
      async (_path: string, args: string[], options: { cwd: string }) => {
        expect(args).toContain("workspace-write");
        writeFileSync(join(options.cwd, "delivered.txt"), "verified\n");
        return { stdout: "implemented", stderr: "" };
      },
    );
    const result = await runCodingJob(
      job(root),
      runtime({ execute: execute as AdapterRuntime["execute"] }),
    );
    expect(result).toEqual({
      ok: true,
      mode: "cli",
      output: "implemented",
    });
    expect(existsSync(join(root, "delivered.txt"))).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("records adapter failure and cancellation without applying the stage", async () => {
    const root = workspace();
    const controller = new AbortController();
    controller.abort();
    const result = await runCodingJob(
      job(root, "codex", controller.signal),
      runtime({
        execute: async () => {
          throw new Error("fixture failed");
        },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      mode: "cli",
      output: "fixture failed",
    });
    expect(existsSync(join(root, "delivered.txt"))).toBe(false);
  });

  it("rejects staged deletion and preserves the authorized workspace", async () => {
    const root = workspace();
    const result = await runCodingJob(
      job(root),
      runtime({
        execute: async (_path, _args, options) => {
          rmSync(join(options.cwd, "source.txt"));
          return { stdout: "", stderr: "attempted deletion" };
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, mode: "cli" });
    expect(result.output).toContain("DELETE_PERMISSION_REQUIRED");
    expect(existsSync(join(root, "source.txt"))).toBe(true);
  });

  it("constructs an adapter-specific environment without unrelated secrets", () => {
    process.env.CLAUDE_FIXTURE_ALLOWED = "yes";
    process.env.CURSOR_FIXTURE_ALLOWED = "yes";
    process.env.UNRELATED_TEST_SECRET = "must-not-leak";
    const claude = buildCodingEnvironment("claude-code", workspace());
    expect(claude.CLAUDE_FIXTURE_ALLOWED).toBe("yes");
    expect(claude.CURSOR_FIXTURE_ALLOWED).toBeUndefined();
    expect(claude.UNRELATED_TEST_SECRET).toBeUndefined();
    expect(claude.HOME).toBe(claude.TMPDIR);
    for (const id of [
      "cursor",
      "grok-build",
      "kimi",
      "antigravity",
    ] as AdapterId[]) {
      const environment = buildCodingEnvironment(id, workspace());
      expect(environment.UNRELATED_TEST_SECRET).toBeUndefined();
      expect(environment.HOME).toBeTruthy();
    }
    const codexRoot = workspace();
    const auth = join(codexRoot, "auth-fixture.json");
    writeFileSync(auth, JSON.stringify({ token: "test-only" }));
    const codex = buildCodingEnvironment("codex", codexRoot, auth);
    expect(codex.CODEX_HOME).toContain("codex-home");
    expect(existsSync(join(codex.CODEX_HOME!, "auth.json"))).toBe(true);
    expect(() =>
      buildCodingEnvironment(
        "codex",
        workspace(),
        join(codexRoot, "missing-auth.json"),
      ),
    ).toThrow("ADAPTER_NOT_LOGGED_IN");
    delete process.env.CLAUDE_FIXTURE_ALLOWED;
    delete process.env.CURSOR_FIXTURE_ALLOWED;
    delete process.env.UNRELATED_TEST_SECRET;
  });

  it("launches explicit login flows without treating a GUI as completed work", async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const loginRuntime = (
      overrides: Partial<AdapterLoginRuntime> = {},
    ): AdapterLoginRuntime => ({
      resolveBinary: async () => null,
      appPresent: () => null,
      platform: "linux",
      launch: (command, args) => launched.push({ command, args }),
      ...overrides,
    });
    await expect(
      startAdapterLogin("not-real" as AdapterId, loginRuntime()),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      startAdapterLogin("kimi", loginRuntime()),
    ).resolves.toMatchObject({ ok: false });

    const cli = await startAdapterLogin(
      "codex",
      loginRuntime({ resolveBinary: async () => "/safe/codex" }),
    );
    expect(cli.ok).toBe(true);
    expect(launched.at(-1)).toEqual({
      command: "/safe/codex",
      args: ["login"],
    });

    const gui = await startAdapterLogin(
      "cursor",
      loginRuntime({
        appPresent: () => "/Applications/Cursor.app",
        platform: "darwin",
      }),
    );
    expect(gui.ok).toBe(true);
    expect(launched.at(-1)).toEqual({
      command: "open",
      args: ["-a", "Cursor"],
    });
  });
});
