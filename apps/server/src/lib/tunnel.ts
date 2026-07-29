// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module preview
 * Starts project-bound loopback previews. Public sharing is a separate,
 * permission-gated action and is never enabled automatically.
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { publish } from "./events.js";
import { npmCommand } from "./npmCommand.js";
import { assertSafeWorkspace } from "./paths.js";

const execFileAsync = promisify(execFile);

export interface PreviewHandle {
  projectId: string;
  publicUrl?: string;
  localUrl: string;
  port: number;
  mode: "local" | "shared";
  startedAt: string;
  shareExpiresAt?: string;
}

interface ActivePreview {
  handle: PreviewHandle;
  localChild: ChildProcess;
  tunnelChild?: ChildProcess;
  expiryTimer?: NodeJS.Timeout;
}

const active = new Map<string, ActivePreview>();

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() =>
        port ? resolve(port) : reject(new Error("NO_FREE_PORT")),
      );
    });
  });
}

function previewScript(workspace: string): "preview" | "dev" | null {
  const packageFile = join(workspace, "package.json");
  if (!existsSync(packageFile)) return null;
  try {
    const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (pkg.scripts?.preview) return "preview";
    if (pkg.scripts?.dev) return "dev";
  } catch {
    return null;
  }
  return null;
}

async function waitForHttp(
  url: string,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (isCancelled()) throw new Error("PREVIEW_START_CANCELLED");
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("PREVIEW_START_TIMEOUT");
}

async function waitForPreview(child: ChildProcess, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const settle = (result: "ready" | Error) => {
      if (finished) return;
      finished = true;
      child.off("error", onError);
      child.off("exit", onExit);
      if (result === "ready") resolve();
      else reject(result);
    };
    const onError = (error: Error) => settle(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      settle(
        new Error(
          `PREVIEW_STOPPED:${code ?? "unknown"}:${signal ?? "no-signal"}`,
        ),
      );
    child.once("error", onError);
    child.once("exit", onExit);
    void waitForHttp(url, () => finished).then(
      () => settle("ready"),
      (error) =>
        settle(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

/** Starts a project-owned preview on an OS-assigned loopback port. */
export async function startLocalPreview(input: {
  projectId: string;
  workspace: string;
}): Promise<PreviewHandle> {
  stopPreview(input.projectId);
  const workspace = assertSafeWorkspace(input.workspace);
  const script = previewScript(workspace);
  if (!script) throw new Error("PREVIEW_SCRIPT_NOT_FOUND");
  const port = await freePort();
  const invocation = npmCommand([
    "run",
    script,
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  const child = spawn(invocation.bin, invocation.args, {
    cwd: workspace,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const localUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPreview(child, localUrl);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  const handle: PreviewHandle = {
    projectId: input.projectId,
    localUrl,
    port,
    mode: "local",
    startedAt: new Date().toISOString(),
  };
  active.set(input.projectId, { handle, localChild: child });
  publish({
    type: "preview.ready",
    projectId: input.projectId,
    message: `Preview local lista: ${localUrl}`,
    payload: { ...handle },
  });
  return handle;
}

function findCloudflared(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "cloudflared"),
    "/usr/local/bin/cloudflared",
    "/opt/homebrew/bin/cloudflared",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "cloudflared";
}

/** Shares an already-running local preview for a bounded period. */
export async function sharePreview(
  projectId: string,
  ttlMinutes = 30,
  spawnTunnel: (
    command: string,
    args: string[],
    options: { stdio: ["ignore", "pipe", "pipe"] },
  ) => ChildProcess = spawn,
): Promise<PreviewHandle> {
  const current = active.get(projectId);
  if (!current) throw new Error("LOCAL_PREVIEW_NOT_RUNNING");
  if (current.tunnelChild) throw new Error("PREVIEW_ALREADY_SHARED");
  const child = spawnTunnel(
    findCloudflared(),
    ["tunnel", "--url", current.handle.localUrl],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TUNNEL_TIMEOUT")), 25_000);
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", reject);
    child.once("exit", () => reject(new Error("TUNNEL_STOPPED")));
  });
  const shareExpiresAt = new Date(
    Date.now() + ttlMinutes * 60_000,
  ).toISOString();
  current.handle = {
    ...current.handle,
    publicUrl,
    mode: "shared",
    shareExpiresAt,
  };
  current.tunnelChild = child;
  current.expiryTimer = setTimeout(
    () => stopSharing(projectId),
    ttlMinutes * 60_000,
  );
  publish({
    type: "preview.ready",
    projectId,
    message: `Preview compartida hasta ${shareExpiresAt}.`,
    payload: { ...current.handle },
  });
  return current.handle;
}

/** Revokes public access while leaving the local preview running. */
export function stopSharing(projectId: string): boolean {
  const current = active.get(projectId);
  if (!current?.tunnelChild) return false;
  current.tunnelChild.kill("SIGTERM");
  current.tunnelChild = undefined;
  if (current.expiryTimer) clearTimeout(current.expiryTimer);
  current.expiryTimer = undefined;
  current.handle = {
    projectId,
    localUrl: current.handle.localUrl,
    port: current.handle.port,
    mode: "local",
    startedAt: current.handle.startedAt,
  };
  return true;
}

/** Stops both local and public preview processes for a project. */
export function stopPreview(projectId: string): boolean {
  const current = active.get(projectId);
  if (!current) return false;
  stopSharing(projectId);
  current.localChild.kill("SIGTERM");
  active.delete(projectId);
  return true;
}

/** Stops every child process owned by the preview manager. */
export function stopAllPreviews(): void {
  for (const projectId of [...active.keys()]) stopPreview(projectId);
}

/** Returns the in-memory handle for a running preview. */
export function getPreview(projectId: string): PreviewHandle | null {
  return active.get(projectId)?.handle ?? null;
}

/** Detects whether the optional public-sharing helper is installed. */
export async function tunnelAvailable(): Promise<boolean> {
  try {
    await execFileAsync(findCloudflared(), ["--version"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}
