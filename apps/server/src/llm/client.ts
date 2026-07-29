// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterId, AgencySettings, ModelTier } from "@la-agencia/shared";
import { resolveAdapterBin } from "../adapters/index.js";
import { enrichPath } from "../lib/pathEnv.js";
import { join } from "node:path";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
enrichPath();

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** CLIs that can power PO/planning via the user's subscription (login en navegador, no API key). */
const SUBSCRIPTION_CHAT: Record<
  AdapterId,
  {
    bins: string[];
    buildArgs: (prompt: string, cwd: string) => string[];
    label: string;
    isolated: boolean;
  }
> = {
  "claude-code": {
    bins: ["claude"],
    label: "Claude (suscripción)",
    isolated: false,
    buildArgs: (p) => ["-p", p, "--print", "--output-format", "text"],
  },
  "grok-build": {
    bins: ["grok"],
    label: "Grok (suscripción)",
    isolated: false,
    buildArgs: (p) => ["-p", p],
  },
  codex: {
    bins: ["codex"],
    label: "Codex / ChatGPT (suscripción)",
    isolated: true,
    buildArgs: (p, cwd) => [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "-C",
      cwd,
      p,
    ],
  },
  cursor: {
    bins: ["cursor-agent", "cursor"],
    label: "Cursor (suscripción)",
    isolated: false,
    buildArgs: (p) => ["agent", "-p", p, "--print"],
  },
  kimi: {
    bins: ["kimi"],
    label: "Kimi (suscripción)",
    isolated: false,
    buildArgs: (p) => ["-p", p],
  },
  antigravity: {
    bins: ["agy", "antigravity"],
    label: "Antigravity (cuenta Google)",
    isolated: false,
    buildArgs: (p) => ["-p", p],
  },
};

function safeCliEnvironment(
  adapterId: AdapterId,
  runtimeDirectory: string,
): NodeJS.ProcessEnv {
  const allowed = ["PATH", "LANG", "LC_ALL", "TERM", "COLORTERM"];
  const environment = Object.fromEntries(
    allowed
      .map((key) => [key, process.env[key]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  environment.HOME = runtimeDirectory;
  environment.USERPROFILE = runtimeDirectory;
  environment.TMPDIR = runtimeDirectory;
  environment.TEMP = runtimeDirectory;
  environment.TMP = runtimeDirectory;

  if (adapterId === "codex") {
    const source = join(homedir(), ".codex", "auth.json");
    if (!existsSync(source)) throw new Error("ADAPTER_NOT_LOGGED_IN");
    const codexHome = join(runtimeDirectory, "codex-home");
    mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const destination = join(codexHome, "auth.json");
    copyFileSync(source, destination);
    chmodSync(destination, 0o600);
    environment.CODEX_HOME = codexHome;
  }

  return environment;
}

async function resolveBin(
  adapterId: AdapterId,
): Promise<{ bin: string; path: string } | null> {
  const path = await resolveAdapterBin(adapterId);
  if (!path) return null;
  return { bin: path.split("/").pop() || path, path };
}

export interface SubscriptionRuntime {
  resolveBin: (
    adapterId: AdapterId,
  ) => Promise<{ bin: string; path: string } | null>;
  execute: (
    path: string,
    args: string[],
    options: {
      timeout: number;
      maxBuffer: number;
      env: NodeJS.ProcessEnv;
      cwd: string;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  environment: (
    adapterId: AdapterId,
    runtimeDirectory: string,
  ) => NodeJS.ProcessEnv;
}

const DEFAULT_SUBSCRIPTION_RUNTIME: SubscriptionRuntime = {
  resolveBin,
  execute: async (path, args, options) => {
    const result = await execFileAsync(path, args, options);
    return {
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  },
  environment: safeCliEnvironment,
};

function composePrompt(messages: ChatTurn[]): string {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "CLIENTE" : "TÚ"}:\n${m.content}`)
    .join("\n\n");

  return [
    "Eres un agente de La Agencia. Responde SOLO con el mensaje final al cliente (sin meta-comentarios sobre tools).",
    system ? `INSTRUCCIONES DEL ROL:\n${system}` : "",
    "CONVERSACIÓN:",
    transcript || "CLIENTE:\nHola",
    "",
    "Responde ahora como el rol indicado, en el idioma del cliente.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 100_000);
}

/**
 * Chat vía suscripción del usuario (CLI ya logueada).
 * No pide API keys. Usa Claude Pro / Grok / Codex / Cursor / etc.
 */
export async function subscriptionChat(
  adapterId: AdapterId,
  messages: ChatTurn[],
  runtime: SubscriptionRuntime = DEFAULT_SUBSCRIPTION_RUNTIME,
): Promise<string> {
  const meta = SUBSCRIPTION_CHAT[adapterId];
  if (!meta) throw new Error("ADAPTER_UNSUPPORTED");
  if (!meta.isolated) throw new Error("ADAPTER_CHAT_NOT_ISOLATED");

  const resolved = await runtime.resolveBin(adapterId);
  if (!resolved) throw new Error("ADAPTER_NOT_INSTALLED");

  const prompt = composePrompt(messages);
  const runtimeDirectory = mkdtempSync(join(tmpdir(), "la-agencia-chat-"));
  const cwd = join(runtimeDirectory, "workspace");
  mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const args = meta.buildArgs(prompt, cwd);

  try {
    const { stdout, stderr } = await runtime.execute(resolved.path, args, {
      timeout: 1000 * 60 * 3,
      maxBuffer: 4 * 1024 * 1024,
      env: runtime.environment(adapterId, runtimeDirectory),
      cwd,
    });
    const out = (stdout || stderr || "").trim();
    if (!out) throw new Error("EMPTY_RESPONSE");
    // Strip common CLI chrome
    return cleanCliOutput(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Auth failures → user needs to login once in the app
    if (/auth|login|not logged|unauthorized|sign in/i.test(msg)) {
      throw new Error("ADAPTER_NOT_LOGGED_IN", { cause: e });
    }
    throw new Error(msg.slice(0, 300), { cause: e });
  } finally {
    rmSync(runtimeDirectory, { recursive: true, force: true });
  }
}

function cleanCliOutput(text: string): string {
  let t = text;
  // Remove leading spinner-ish lines
  t = t.replace(
    /^[\s\S]*?(?=^(?:Soy |¡|Hola|Claro|Perfecto|Entendido|Bueno|# |\*\*))/m,
    "",
  );
  if (t.length < 20) t = text;
  return t.trim();
}

/** Prefer adapter order for PO chat when none selected. */
export async function pickSubscriptionAdapter(
  settings: AgencySettings,
  resolver: SubscriptionRuntime["resolveBin"] = resolveBin,
): Promise<AdapterId | null> {
  if (process.env.NODE_ENV === "test" && resolver === resolveBin) return null;
  const preferred = [
    settings.primaryAdapter,
    ...settings.enabledAdapters,
    "claude-code" as AdapterId,
    "grok-build" as AdapterId,
    "codex" as AdapterId,
    "cursor" as AdapterId,
    "antigravity" as AdapterId,
    "kimi" as AdapterId,
  ].filter(Boolean) as AdapterId[];

  const seen = new Set<AdapterId>();
  for (const id of preferred) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = SUBSCRIPTION_CHAT[id];
    if (!meta?.isolated) continue;
    if (await resolver(id)) return id;
  }
  return null;
}

export async function listReadySubscriptions(): Promise<
  Array<{ id: AdapterId; label: string; installed: boolean; isolated: boolean }>
>;
export async function listReadySubscriptions(
  resolver: SubscriptionRuntime["resolveBin"],
): Promise<
  Array<{ id: AdapterId; label: string; installed: boolean; isolated: boolean }>
>;
export async function listReadySubscriptions(
  resolver: SubscriptionRuntime["resolveBin"] = resolveBin,
): Promise<
  Array<{ id: AdapterId; label: string; installed: boolean; isolated: boolean }>
> {
  if (process.env.NODE_ENV === "test" && resolver === resolveBin) {
    return (Object.keys(SUBSCRIPTION_CHAT) as AdapterId[]).map((id) => ({
      id,
      label: SUBSCRIPTION_CHAT[id].label,
      installed: false,
      isolated: SUBSCRIPTION_CHAT[id].isolated,
    }));
  }
  const out: Array<{
    id: AdapterId;
    label: string;
    installed: boolean;
    isolated: boolean;
  }> = [];
  for (const id of Object.keys(SUBSCRIPTION_CHAT) as AdapterId[]) {
    const meta = SUBSCRIPTION_CHAT[id];
    out.push({
      id,
      label: meta.label,
      installed: Boolean(await resolver(id)),
      isolated: meta.isolated,
    });
  }
  return out;
}

function resolveModel(settings: AgencySettings, tier?: ModelTier): string {
  if (tier && settings.modelsByTier[tier]) return settings.modelsByTier[tier];
  return settings.llm.model;
}

function baseUrl(settings: AgencySettings): string {
  if (settings.llm.baseUrl) return settings.llm.baseUrl.replace(/\/$/, "");
  switch (settings.llm.provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "xai":
      return "https://api.x.ai/v1";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "kimi":
      return "https://api.moonshot.ai/v1";
    default:
      return "https://api.openai.com/v1";
  }
}

/**
 * Chat principal de La Agencia.
 * 1) Suscripción del usuario vía CLI (default, 0% TI)
 * 2) API key solo si el usuario avanzado la configuró
 */
export async function chatCompletion(
  settings: AgencySettings,
  messages: ChatTurn[],
  opts?: { tier?: ModelTier; temperature?: number; forceAdapter?: AdapterId },
): Promise<string> {
  const adapter =
    opts?.forceAdapter || (await pickSubscriptionAdapter(settings));
  if (adapter) {
    try {
      return await subscriptionChat(adapter, messages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If subscription path fails and we have advanced API key, fall through
      if (settings.llm.apiKey && msg !== "ADAPTER_NOT_LOGGED_IN") {
        /* try API key path */
      } else {
        throw e;
      }
    }
  }

  // Advanced-only: API key path (hidden from guided users)
  const key = settings.llm.apiKey;
  if (!key) {
    throw new Error(adapter ? "ADAPTER_CHAT_FAILED" : "NO_SUBSCRIPTION");
  }

  const model = resolveModel(settings, opts?.tier);
  if (settings.llm.provider === "anthropic") {
    return anthropicChat(key, model, messages, opts?.temperature ?? 0.4);
  }

  const res = await fetch(`${baseUrl(settings)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.4,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM error ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function anthropicChat(
  key: string,
  model: string,
  messages: ChatTurn[],
  temperature: number,
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature,
      system: system || undefined,
      messages: rest.length ? rest : [{ role: "user", content: "Hola" }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n") || ""
  );
}

export function offlinePoReply(
  userMessage: string,
  introLevel: string,
  ready: Array<{ id: string; label: string; installed: boolean }>,
): string {
  const installed = ready.filter((r) => r.installed);
  const missing = ready.filter((r) => !r.installed);

  if (installed.length === 0) {
    return [
      "¡Hola! Soy **Pau**, tu Product Owner.",
      "",
      "Para que pueda trabajar contigo de verdad (como una consultora), necesitamos conectar **la cuenta que ya pagas** — ChatGPT, Claude, Grok, Cursor… No hace falta saber de programación.",
      "",
      "### Qué hacer (te guío paso a paso)",
      "1. Abre **Ajustes** (arriba a la derecha).",
      "2. Elige la herramienta que ya uses (por ejemplo Claude o Grok).",
      "3. Si te pide instalarla o iniciar sesión, haz clic y sigue la ventana que se abre en el navegador — es igual que entrar a Netflix.",
      "4. Vuelve aquí y escríbeme de nuevo.",
      "",
      introLevel === "guided"
        ? "Cuando estemos conectados, cuéntame en tus palabras qué quieres construir. Yo me encargo del resto."
        : "Cuando la suscripción esté lista, procesaré tu mensaje con el equipo.",
      "",
      `He leído: «${userMessage.slice(0, 180)}${userMessage.length > 180 ? "…" : ""}».`,
    ].join("\n");
  }

  // Installed but not logged in / failed
  return [
    "Soy **Pau**. Veo que ya tienes instalado:",
    ...installed.map((i) => `· ${i.label}`),
    "",
    "Falta **iniciar sesión una vez** con tu suscripción (en el navegador), igual que entras a tu correo.",
    "",
    "Ve a **Ajustes → Conectar cuenta** y pulsa **Iniciar sesión**. Cuando termine, vuelve y dime qué quieres construir.",
    "",
    missing.length
      ? `(Opcional más adelante: también puedes usar ${missing.map((m) => m.label).join(", ")}.)`
      : "",
    "",
    `Sobre lo que me contaste: «${userMessage.slice(0, 180)}${userMessage.length > 180 ? "…" : ""}» — lo retomo en cuanto la sesión esté activa.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export { SUBSCRIPTION_CHAT };
