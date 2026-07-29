// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPreview,
  sharePreview,
  startLocalPreview,
  stopAllPreviews,
  stopPreview,
  stopSharing,
  tunnelAvailable,
} from "./tunnel.js";

afterEach(() => {
  stopAllPreviews();
});

describe("local previews", () => {
  it("rejects workspaces with no supported preview profile", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "agency-preview-empty-"));
    await expect(
      startLocalPreview({ projectId: "missing", workspace }),
    ).rejects.toThrow("PREVIEW_SCRIPT_NOT_FOUND");
    expect(getPreview("missing")).toBeNull();
    expect(stopPreview("missing")).toBe(false);
    expect(stopSharing("missing")).toBe(false);
  });

  it("starts on an OS-assigned loopback port and owns the child process", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "agency-preview-"));
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(workspace, "package.json"),
      JSON.stringify({ scripts: { preview: "node preview.mjs" } }),
    );
    writeFileSync(
      join(workspace, "preview.mjs"),
      [
        "import { createServer } from 'node:http';",
        "const args = process.argv.slice(2);",
        "const port = Number(args[args.indexOf('--port') + 1]);",
        "createServer((_req, res) => { res.end('ok'); }).listen(port, '127.0.0.1');",
      ].join("\n"),
    );
    const handle = await startLocalPreview({
      projectId: "preview-owned",
      workspace,
    });
    expect(handle.localUrl).toBe(`http://127.0.0.1:${handle.port}`);
    expect(handle.port).toBeGreaterThan(0);
    expect(getPreview("preview-owned")).toEqual(handle);
    expect(await (await fetch(handle.localUrl)).text()).toBe("ok");
    expect(stopPreview("preview-owned")).toBe(true);
    expect(getPreview("preview-owned")).toBeNull();
  });

  it("reports the optional tunnel helper without starting it", async () => {
    expect(typeof (await tunnelAvailable())).toBe("boolean");
  });

  it("shares only an owned local preview and revokes the tunnel independently", async () => {
    await expect(
      sharePreview("not-running", 5, () => {
        throw new Error("must not spawn");
      }),
    ).rejects.toThrow("LOCAL_PREVIEW_NOT_RUNNING");

    const workspace = mkdtempSync(join(tmpdir(), "agency-preview-share-"));
    writeFileSync(
      join(workspace, "package.json"),
      JSON.stringify({ scripts: { dev: "node preview.mjs" } }),
    );
    writeFileSync(
      join(workspace, "preview.mjs"),
      [
        "import { createServer } from 'node:http';",
        "const args = process.argv.slice(2);",
        "const port = Number(args[args.indexOf('--port') + 1]);",
        "createServer((_req, res) => res.end('ok')).listen(port, '127.0.0.1');",
      ].join("\n"),
    );
    await startLocalPreview({ projectId: "share-owned", workspace });

    const tunnel = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(tunnel, {
      stdout,
      stderr,
      kill: () => true,
    });
    const sharedPromise = sharePreview("share-owned", 5, () => tunnel);
    stderr.write(
      "ready at https://fixture-preview.trycloudflare.com for testing\n",
    );
    const shared = await sharedPromise;
    expect(shared).toMatchObject({
      mode: "shared",
      publicUrl: "https://fixture-preview.trycloudflare.com",
    });
    await expect(sharePreview("share-owned", 5, () => tunnel)).rejects.toThrow(
      "PREVIEW_ALREADY_SHARED",
    );
    expect(stopSharing("share-owned")).toBe(true);
    expect(getPreview("share-owned")?.mode).toBe("local");
    expect(stopSharing("share-owned")).toBe(false);
  });
});
