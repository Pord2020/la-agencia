// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  accessSync,
  constants,
  chmodSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  AdapterDetectResult,
  AdapterId,
  AdapterExecutionPolicy,
  CodingJob,
  UsageReport,
} from "@la-agencia/shared";
import { publish } from "../lib/events.js";
import { loadSettings } from "../lib/store.js";
import { candidatePaths, enrichPath, MAC_APPS } from "../lib/pathEnv.js";
import { estimateTokensFromText, recordUsage } from "../lib/costLedger.js";
import { fakeAdapterEnabled, fakeCodingResult } from "./fake.js";
import { assertSafeWorkspace } from "../lib/paths.js";
import {
  applyWorkspaceStage,
  discardWorkspaceStage,
  prepareWorkspaceStage,
} from "../lib/workspaceStage.js";

const execFileAsync = promisify(execFile);
enrichPath();

const ADAPTER_META: Record<
  AdapterId,
  {
    name: string;
    bins: string[];
    friendly: string;
    capabilities: AdapterDetectResult["capabilities"];
    policy: AdapterExecutionPolicy;
  }
> = {
  "claude-code": {
    name: "Claude",
    friendly: "Claude (suscripción)",
    bins: ["claude"],
    capabilities: {
      chat: true,
      coding: false,
      verify: true,
      usage: false,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: true,
      autonomousCoding: false,
      isolation: "manual-only",
      safeArguments: [],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG", "CLAUDE_*"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
  cursor: {
    name: "Cursor",
    friendly: "Cursor (suscripción)",
    bins: ["cursor", "cursor-agent"],
    capabilities: {
      chat: true,
      coding: false,
      verify: true,
      usage: true,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: true,
      autonomousCoding: false,
      isolation: "manual-only",
      safeArguments: [],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG", "CURSOR_*"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
  codex: {
    name: "ChatGPT / Codex",
    friendly: "ChatGPT / Codex",
    bins: ["codex"],
    capabilities: {
      chat: true,
      coding: true,
      verify: true,
      usage: false,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: true,
      autonomousCoding: true,
      isolation: "staged-workspace",
      safeArguments: ["exec", "--sandbox workspace-write"],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG", "CODEX_*"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
  "grok-build": {
    name: "Grok",
    friendly: "Grok Build",
    bins: ["grok"],
    capabilities: {
      chat: true,
      coding: false,
      verify: true,
      usage: false,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: false,
      autonomousCoding: false,
      isolation: "manual-only",
      safeArguments: [],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG", "XAI_*", "GROK_*"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
  kimi: {
    name: "Kimi",
    friendly: "Kimi",
    bins: ["kimi", "Kimi"],
    capabilities: {
      chat: true,
      coding: false,
      verify: true,
      usage: false,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: false,
      autonomousCoding: false,
      isolation: "manual-only",
      safeArguments: [],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG", "KIMI_*"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
  antigravity: {
    name: "Antigravity",
    friendly: "Antigravity (Google)",
    bins: ["agy", "antigravity", "agy-ide", "antigravity-ide"],
    capabilities: {
      chat: true,
      coding: false,
      verify: true,
      usage: false,
      login: true,
    },
    policy: {
      timeoutMs: 15 * 60_000,
      supportsCancellation: false,
      autonomousCoding: false,
      isolation: "manual-only",
      safeArguments: [],
      allowedEnvironment: ["PATH", "HOME", "TMPDIR", "LANG"],
      blockedActions: [
        "delete_files",
        "deploy_production",
        "network",
        "shell_dangerous",
      ],
    },
  },
};

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return existsSync(p);
  }
}

async function resolveBinary(bins: string[]): Promise<string | null> {
  enrichPath();
  for (const candidate of candidatePaths(bins)) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (isExecutable(candidate)) return candidate;
      continue;
    }
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(cmd, [candidate], {
        env: process.env,
        timeout: 3000,
      });
      const line = stdout.trim().split("\n")[0];
      if (line && isExecutable(line)) return line;
    } catch {
      /* next */
    }
  }
  return null;
}

async function version(path: string): Promise<string | undefined> {
  for (const args of [["--version"], ["-v"], ["version"]]) {
    try {
      const { stdout, stderr } = await execFileAsync(path, args, {
        timeout: 5000,
        env: process.env,
      });
      const t = (stdout || stderr).trim().split("\n")[0];
      if (t) return t.slice(0, 100);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function appPresent(id: AdapterId): string | null {
  for (const p of MAC_APPS[id] || []) {
    if (existsSync(p)) return p;
  }
  return null;
}

export interface AdapterRuntime {
  resolveBinary: (bins: string[]) => Promise<string | null>;
  version: (path: string) => Promise<string | undefined>;
  appPresent: (id: AdapterId) => string | null;
  execute: (
    path: string,
    args: string[],
    options: {
      cwd: string;
      timeout: number;
      maxBuffer: number;
      env: NodeJS.ProcessEnv;
      signal?: AbortSignal;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  environment: (
    adapterId: AdapterId,
    runtimeDirectory: string,
  ) => NodeJS.ProcessEnv;
}

const DEFAULT_RUNTIME: AdapterRuntime = {
  resolveBinary,
  version,
  appPresent,
  execute: async (path, args, options) => {
    const result = await execFileAsync(path, args, options);
    return {
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  },
  environment: buildCodingEnvironment,
};

export async function detectAdapters(
  runtime: Pick<
    AdapterRuntime,
    "resolveBinary" | "version" | "appPresent"
  > = DEFAULT_RUNTIME,
): Promise<AdapterDetectResult[]> {
  enrichPath();
  const out: AdapterDetectResult[] = [];
  for (const id of Object.keys(ADAPTER_META) as AdapterId[]) {
    const meta = ADAPTER_META[id];
    const bin = await runtime.resolveBinary(meta.bins);
    const app = runtime.appPresent(id);
    const installed = Boolean(bin || app);
    let ver: string | undefined;
    let detail: string;
    if (bin) {
      ver = await runtime.version(bin);
      detail = bin;
    } else if (app) {
      detail = `App instalada: ${app} (CLI opcional)`;
    } else {
      detail = `No se encontró: ${meta.bins.join(" / ")}`;
    }
    out.push({
      id,
      name: meta.friendly,
      installed,
      version: ver,
      detail,
      capabilities: meta.capabilities,
      policy: meta.policy,
    });
  }
  return out;
}

export async function usageReport(adapterId: AdapterId): Promise<UsageReport> {
  const settings = loadSettings();
  if (adapterId === "cursor" && settings.usage.cursorHoursLimit) {
    const used = settings.usage.cursorHoursUsed ?? 0;
    const limit = settings.usage.cursorHoursLimit;
    const percent = used / limit;
    let level: UsageReport["level"] = "ok";
    if (percent >= settings.usage.blockHeavyAt) level = "critical";
    else if (percent >= settings.usage.warnAt) level = "warn";
    return {
      adapterId,
      percentUsed: percent * 100,
      hoursUsed: used,
      hoursLimit: limit,
      estimated: true,
      level,
      message:
        level === "ok"
          ? `Cursor: ~${used.toFixed(1)} h de ${limit} h usadas.`
          : level === "warn"
            ? `Cursor al ${Math.round(percent * 100)} % de la jornada.`
            : `Cursor cerca del límite (${Math.round(percent * 100)} %).`,
    };
  }
  return {
    adapterId,
    estimated: true,
    level: "unknown",
    message: `Uso de ${ADAPTER_META[adapterId].name}: estimación de sesión.`,
  };
}

export async function runCodingJob(job: CodingJob): Promise<{
  ok: boolean;
  output: string;
  mode: "cli" | "brief-only" | "app";
}>;
export async function runCodingJob(
  job: CodingJob,
  runtime: AdapterRuntime,
): Promise<{
  ok: boolean;
  output: string;
  mode: "cli" | "brief-only" | "app";
}>;
export async function runCodingJob(
  job: CodingJob,
  runtime: AdapterRuntime = DEFAULT_RUNTIME,
): Promise<{
  ok: boolean;
  output: string;
  mode: "cli" | "brief-only" | "app";
}> {
  enrichPath();
  const cwd = assertSafeWorkspace(job.cwd);
  const jobsDir = join(cwd, ".agency", "jobs");
  if (!existsSync(jobsDir)) mkdirSync(jobsDir, { recursive: true });
  const briefPath = join(jobsDir, `${job.taskId}.md`);
  writeFileSync(
    briefPath,
    `# Coding job ${job.taskId}\n\nAdapter: ${job.adapterId}\n\n${job.prompt}\n`,
    "utf8",
  );

  const meta = ADAPTER_META[job.adapterId];
  if (fakeAdapterEnabled()) {
    const startedAt = Date.now();
    const stage = prepareWorkspaceStage(cwd, job.taskId);
    const output = fakeCodingResult(job.prompt);
    writeFileSync(
      join(stage.workspace, "la-agencia-fake-delivery.txt"),
      `${output}\n`,
      "utf8",
    );
    const applied = applyWorkspaceStage(stage);
    writeFileSync(join(jobsDir, `${job.taskId}.log`), output, "utf8");
    recordUsage({
      agentId: `coding:${job.adapterId}`,
      label: `Coding · ${meta.name}`,
      inputTokens: estimateTokensFromText(job.prompt),
      outputTokens: estimateTokensFromText(output),
      durationMs: Date.now() - startedAt,
      adapterId: job.adapterId,
      source: "coding",
      estimated: true,
      outcome: applied.ok ? "success" : "failed",
      errorCode: applied.errorCode,
    });
    return {
      ok: applied.ok,
      mode: "cli",
      output: applied.ok ? output : applied.errorCode || "STAGE_APPLY_FAILED",
    };
  }
  publish({
    type: "agent.activity",
    projectId: job.projectId,
    message: `${meta.name}: preparando tarea…`,
  });

  const binPath = await runtime.resolveBinary(meta.bins);
  if (!binPath) {
    const app = runtime.appPresent(job.adapterId);
    if (app) {
      // Open GUI app — user works with subscription there
      try {
        if (process.platform === "darwin") {
          spawn(
            "open",
            [
              "-a",
              app
                .replace(/\.app$/, "")
                .split("/")
                .pop() || app,
            ],
            {
              detached: true,
              stdio: "ignore",
            },
          ).unref();
        }
      } catch {
        /* ignore */
      }
      publish({
        type: "notification",
        projectId: job.projectId,
        message: `${meta.name} abierto. Brief en .agency/jobs/. Completa la tarea en la app.`,
      });
      return {
        ok: false,
        mode: "app",
        output: `App abierta para trabajo manual. La tarea sigue bloqueada hasta contar con evidencia verificable. Brief: ${briefPath}`,
      };
    }
    return {
      ok: false,
      mode: "brief-only",
      output: `No instalado. Brief: ${briefPath}`,
    };
  }

  if (!meta.policy.autonomousCoding) {
    return {
      ok: false,
      mode: "brief-only",
      output: `${meta.name} no ofrece una política autónoma verificable en v0.4. Brief: ${briefPath}`,
    };
  }

  const prompt = job.prompt.slice(0, 12000);
  const argsById: Record<AdapterId, string[]> = {
    "grok-build": ["-p", prompt],
    "claude-code": [
      "-p",
      prompt,
      "--print",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "--disallowedTools",
      "Bash",
      "WebFetch",
      "WebSearch",
      "--strict-mcp-config",
      "--max-turns",
      "20",
    ],
    codex: [
      "exec",
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      prompt,
    ],
    antigravity: ["-p", prompt],
    kimi: ["-p", prompt],
    cursor: ["agent", "-p", prompt],
  };
  const args = argsById[job.adapterId] || ["-p", prompt];

  publish({
    type: "agent.activity",
    projectId: job.projectId,
    message: `Ejecutando ${meta.name} (código real)…`,
  });

  const startedAt = Date.now();
  const stage = prepareWorkspaceStage(cwd, job.taskId);
  try {
    const { stdout, stderr } = await runtime.execute(binPath, args, {
      cwd: stage.workspace,
      timeout: meta.policy.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: runtime.environment(job.adapterId, stage.stageDirectory),
      signal: job.signal,
    });
    const output = (stdout || stderr || "").slice(0, 50000);
    const applied = applyWorkspaceStage(stage);
    recordUsage({
      agentId: `coding:${job.adapterId}`,
      label: `Coding · ${meta.name}`,
      inputTokens: estimateTokensFromText(prompt),
      outputTokens: estimateTokensFromText(output),
      durationMs: Date.now() - startedAt,
      adapterId: job.adapterId,
      source: "coding",
      estimated: true,
      outcome: applied.ok ? "success" : "failed",
      errorCode: applied.errorCode,
    });
    writeFileSync(
      join(jobsDir, `${job.taskId}.log`),
      [
        output,
        "",
        `Applied: ${applied.ok}`,
        `Added: ${applied.added.join(", ") || "none"}`,
        `Modified: ${applied.modified.join(", ") || "none"}`,
        `Rejected: ${applied.rejected.join(", ") || "none"}`,
        applied.stageDirectory ? `Review stage: ${applied.stageDirectory}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      "utf8",
    );
    if (!applied.ok) {
      return {
        ok: false,
        mode: "cli",
        output: `${applied.errorCode || "STAGE_APPLY_FAILED"}. Review: ${applied.stageDirectory || "unavailable"}`,
      };
    }
    publish({
      type: "task.completed",
      projectId: job.projectId,
      message: `Tarea lista con ${meta.name}.`,
      payload: { taskId: job.taskId },
    });
    return { ok: true, mode: "cli", output };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discardWorkspaceStage(stage);
    recordUsage({
      agentId: `coding:${job.adapterId}`,
      label: `Coding · ${meta.name}`,
      inputTokens: estimateTokensFromText(prompt),
      outputTokens: estimateTokensFromText(msg),
      durationMs: Date.now() - startedAt,
      adapterId: job.adapterId,
      source: "coding",
      estimated: true,
      outcome: job.signal?.aborted ? "cancelled" : "failed",
      errorCode: job.signal?.aborted ? "CANCELLED" : "ADAPTER_FAILED",
    });
    writeFileSync(join(jobsDir, `${job.taskId}.error.log`), msg, "utf8");
    return { ok: false, mode: "cli", output: msg };
  }
}

export function buildCodingEnvironment(
  adapterId: AdapterId,
  runtimeDirectory: string,
  codexAuthSource = join(homedir(), ".codex", "auth.json"),
): NodeJS.ProcessEnv {
  const allowedPrefixes: Record<AdapterId, string[]> = {
    "claude-code": ["CLAUDE_"],
    cursor: ["CURSOR_"],
    codex: ["CODEX_"],
    "grok-build": ["XAI_", "GROK_"],
    kimi: ["KIMI_"],
    antigravity: [],
  };
  const safe = new Set(["PATH", "LANG", "LC_ALL", "TERM", "COLORTERM"]);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        Boolean(value) &&
        (safe.has(key) ||
          allowedPrefixes[adapterId].some((prefix) => key.startsWith(prefix))),
    ),
  );
  environment.HOME = runtimeDirectory;
  environment.USERPROFILE = runtimeDirectory;
  environment.TMPDIR = runtimeDirectory;
  environment.TEMP = runtimeDirectory;
  environment.TMP = runtimeDirectory;

  if (adapterId === "codex") {
    if (!existsSync(codexAuthSource)) throw new Error("ADAPTER_NOT_LOGGED_IN");
    const codexHome = join(runtimeDirectory, "codex-home");
    mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const authDestination = join(codexHome, "auth.json");
    copyFileSync(codexAuthSource, authDestination);
    chmodSync(authDestination, 0o600);
    environment.CODEX_HOME = codexHome;
  }
  return environment;
}

export function adapterNames() {
  return Object.fromEntries(
    Object.entries(ADAPTER_META).map(([k, v]) => [
      k,
      { name: v.name, bins: v.bins },
    ]),
  );
}

export interface AdapterLoginRuntime {
  resolveBinary: (bins: string[]) => Promise<string | null>;
  appPresent: (id: AdapterId) => string | null;
  platform: NodeJS.Platform;
  launch: (
    command: string,
    args: string[],
    options: {
      detached: boolean;
      stdio: "ignore";
      env?: NodeJS.ProcessEnv;
    },
  ) => void;
}

const DEFAULT_LOGIN_RUNTIME: AdapterLoginRuntime = {
  resolveBinary,
  appPresent,
  platform: process.platform,
  launch: (command, args, options) => {
    spawn(command, args, options).unref();
  },
};

export async function startAdapterLogin(
  id: AdapterId,
  runtime: AdapterLoginRuntime = DEFAULT_LOGIN_RUNTIME,
): Promise<{ ok: boolean; message: string }> {
  enrichPath();
  const meta = ADAPTER_META[id];
  if (!meta) return { ok: false, message: "Herramienta desconocida." };

  const binPath = await runtime.resolveBinary(meta.bins);
  const app = runtime.appPresent(id);

  if (!binPath && !app) {
    return {
      ok: false,
      message: `${meta.name} no está en este ordenador. Instálalo y vuelve a pulsar Iniciar sesión.`,
    };
  }

  // Prefer opening the GUI app for 0% TI (browser login inside app)
  if (app && runtime.platform === "darwin") {
    const appName =
      app
        .split("/")
        .pop()
        ?.replace(/\.app$/, "") || meta.name;
    runtime.launch("open", ["-a", appName], {
      detached: true,
      stdio: "ignore",
    });
    return {
      ok: true,
      message: `Abrí **${meta.name}**. Entra con tu cuenta (como Netflix). Cuando termines, vuelve a La Agencia y habla con Pau o Ana.`,
    };
  }

  const loginArgs: Partial<Record<AdapterId, string[]>> = {
    "claude-code": ["/login"],
    "grok-build": ["auth", "login"],
    codex: ["login"],
    cursor: ["agent", "login"],
    antigravity: ["auth", "login"],
    kimi: ["login"],
  };
  const args = loginArgs[id] || ["login"];

  if (binPath) {
    runtime.launch(binPath, args, {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
  }

  return {
    ok: true,
    message: `Inicio de sesión de **${meta.name}** lanzado. Completa el login y vuelve aquí.`,
  };
}

/** Resolve binary for LLM subscription chat (shared with llm client). */
export async function resolveAdapterBin(id: AdapterId): Promise<string | null> {
  return resolveBinary(ADAPTER_META[id].bins);
}
