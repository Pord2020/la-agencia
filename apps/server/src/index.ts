// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module server
 * Starts the loopback-only Agency API after routes and migrations are ready.
 */

import { serve } from "@hono/node-server";
import { app, bootstrapToken, startBackgroundTasks } from "./app.js";
import { loadCatalog } from "./lib/agents.js";
import { watchParentProcess } from "./lib/parentWatchdog.js";
import { stopAllPreviews } from "./lib/tunnel.js";

const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PORT must be an integer between 1024 and 65535");
}

startBackgroundTasks();
console.log(`La Agencia server → http://127.0.0.1:${port}`);
console.log(`Agentes cargados: ${loadCatalog().count}`);
if (!process.env.AGENCY_SESSION_TOKEN) {
  console.log(`Token de arranque local: ${bootstrapToken()}`);
}
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

let shuttingDown = false;
let stopParentWatchdog: (() => void) | undefined;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  stopParentWatchdog?.();
  stopAllPreviews();
  server.close(() => process.exit(0));
  const forcedExit = setTimeout(() => {
    process.exit(0);
  }, 1_000);
  forcedExit.unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

const parentPidValue = process.env.LA_AGENCIA_PARENT_PID;
if (parentPidValue) {
  const parentPid = Number(parentPidValue);
  stopParentWatchdog = watchParentProcess(parentPid, shutdown);
}
