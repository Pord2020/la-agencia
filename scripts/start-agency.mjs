// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * One-process local launcher for non-technical users.
 *
 * The compiled Hono runtime serves both the API and the web application. This
 * supervisor keeps the runtime alive, reuses an existing healthy instance and
 * opens a session-authenticated URL without requiring the user to know ports.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const requestedPort = Number(process.env.PORT || 8787);
if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 1024 ||
  requestedPort > 65535
) {
  throw new Error("PORT must be an integer between 1024 and 65535");
}
const PORT = requestedPort;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONFIG_DIR =
  process.env.LA_AGENCIA_CONFIG_DIR || join(homedir(), ".la-agencia");
const RUNTIME_FILE = join(CONFIG_DIR, "runtime.json");
const SERVER_ENTRY = join(ROOT, "apps", "server", "dist", "index.js");
const SESSION_TOKEN = randomBytes(32).toString("base64url");
const MAX_RESTARTS = 5;

let serverProcess;
let stopping = false;
let restartCount = 0;

async function health() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body?.name === "La Agencia";
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health()) return true;
    await sleep(300);
  }
  return false;
}

function sessionUrl(token = SESSION_TOKEN) {
  return `${BASE_URL}/#session=${encodeURIComponent(token)}`;
}

function openOffice(url) {
  if (process.env.LA_AGENCIA_NO_OPEN === "1") return;
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function readRuntimeState() {
  if (!existsSync(RUNTIME_FILE)) return null;
  try {
    const state = JSON.parse(readFileSync(RUNTIME_FILE, "utf8"));
    if (
      typeof state?.token !== "string" ||
      state.token.length < 32 ||
      state.port !== PORT
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function writeRuntimeState() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(
    RUNTIME_FILE,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        pid: serverProcess?.pid,
        supervisorPid: process.pid,
        port: PORT,
        token: SESSION_TOKEN,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  chmodSync(RUNTIME_FILE, 0o600);
}

function removeRuntimeState() {
  if (existsSync(RUNTIME_FILE)) {
    try {
      unlinkSync(RUNTIME_FILE);
    } catch {
      // A later launcher can safely replace stale runtime metadata.
    }
  }
}

function spawnServer() {
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      PORT: String(PORT),
      AGENCY_SESSION_TOKEN: SESSION_TOKEN,
    },
  });
  const launchedProcess = serverProcess;
  writeRuntimeState();
  void waitForHealth().then((ready) => {
    if (ready && serverProcess === launchedProcess && !stopping) {
      restartCount = 0;
    }
  });
  serverProcess.once("exit", (code, signal) => {
    if (stopping) return;
    if (restartCount >= MAX_RESTARTS) {
      console.error(
        `La Agencia no pudo recuperarse después de ${MAX_RESTARTS} intentos.`,
      );
      removeRuntimeState();
      process.exitCode = code || 1;
      return;
    }
    restartCount += 1;
    const delay = Math.min(500 * 2 ** (restartCount - 1), 8_000);
    console.warn(
      `El servidor se detuvo (${signal || code}). Reintentando ${restartCount}/${MAX_RESTARTS}…`,
    );
    setTimeout(spawnServer, delay);
  });
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  removeRuntimeState();
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1_000).unref();
}

console.log("\n══════════════════════════════════════");
console.log("  LA AGENCIA");
console.log("  Abriendo oficina local…");
console.log("══════════════════════════════════════\n");

if (await health()) {
  const existing = readRuntimeState();
  openOffice(existing?.token ? sessionUrl(existing.token) : BASE_URL);
  console.log(`✓ La Agencia ya estaba funcionando → ${BASE_URL}`);
  process.exit(0);
}

if (!existsSync(SERVER_ENTRY)) {
  console.error("Falta el runtime compilado. Ejecuta npm run build.");
  process.exit(1);
}

spawnServer();
if (!(await waitForHealth())) {
  console.error("No se pudo iniciar La Agencia.");
  shutdown();
  process.exitCode = 1;
} else {
  restartCount = 0;
  openOffice(sessionUrl());
  console.log(`✓ Lista → ${BASE_URL}`);
  console.log(
    "Puedes cerrar la oficina; este launcher la mantiene disponible.\n",
  );
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
