// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AGENCY_VERSION,
  type AgencySettings,
  type Project,
} from "@la-agencia/shared";
import {
  loadSettings,
  saveSettings,
  publicSettings,
  listProjectMetas,
  saveProject,
  getProjectById,
  withProjectLock,
} from "./lib/store.js";
import {
  listAgents,
  loadAgent,
  treeByType,
  loadCatalog,
} from "./lib/agents.js";
import { ensureDir, defaultWorkspacesRoot } from "./lib/paths.js";
import {
  detectAdapters,
  usageReport,
  adapterNames,
  startAdapterLogin,
} from "./adapters/index.js";
import {
  planSprint,
  applySprintFeedback,
} from "./orchestrators/po-techlead.js";
import { chatWithLeader, completeUserTodo } from "./orchestrators/agentChat.js";
import { subscribe, getRecent, publish } from "./lib/events.js";
import {
  listReadySubscriptions,
  pickSubscriptionAdapter,
} from "./llm/client.js";
import { FLOOR_LEADERS } from "./lib/leaders.js";
import { loadQueue } from "./lib/queue.js";
import { enrichPath } from "./lib/pathEnv.js";
import type { OfficeDesk } from "@la-agencia/shared";
import { CONFIG_DIR, WEB_DIST_ROOT } from "./lib/paths.js";
import { getDayCostReport } from "./lib/costLedger.js";
import {
  consumePermission,
  getPermission,
  listPending,
  requestPermission,
  resolvePermission,
} from "./lib/permissions.js";
import {
  getPreview,
  sharePreview,
  startLocalPreview,
  stopPreview,
  stopSharing,
  tunnelAvailable,
} from "./lib/tunnel.js";
import {
  createSprintOperation,
  getOperation,
  listOperations,
  recoverInterruptedOperations,
  transitionOperation,
  updateOperation,
} from "./lib/operations.js";
import {
  cancelSprintOperation,
  resumeQueuedSprintOperations,
  scheduleSprintOperation,
} from "./orchestrators/sprintWorker.js";
import { readJson, writeJsonAtomic } from "./lib/jsonStore.js";
import {
  loadResourceCatalog,
  refreshResourceCatalog,
  searchResourceCatalog,
  startResourceCatalogScheduler,
} from "./lib/resourceCatalog.js";
import {
  activateResourceInstallation,
  acquireCatalogResource,
  listResourceInstallations,
  removeResourceInstallation,
} from "./lib/resourceAcquisition.js";

enrichPath();

export const app = new Hono();
const SESSION_TOKEN =
  process.env.AGENCY_SESSION_TOKEN || randomBytes(32).toString("base64url");
const configuredPort = Number(process.env.PORT || 8787);
const runtimePort =
  Number.isInteger(configuredPort) &&
  configuredPort >= 1024 &&
  configuredPort <= 65535
    ? configuredPort
    : 8787;
const allowedOriginList = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  `http://localhost:${runtimePort}`,
  `http://127.0.0.1:${runtimePort}`,
];
const allowedOrigins = new Set<string>(allowedOriginList);
const adapterIdSchema = z.enum([
  "claude-code",
  "cursor",
  "codex",
  "grok-build",
  "kimi",
  "antigravity",
]);

function canonicalImportPath(input: string): string {
  if (!isAbsolute(input)) throw new Error("IMPORT_PATH_NOT_ABSOLUTE");
  const canonical = realpathSync(resolve(input));
  if (!statSync(canonical).isDirectory())
    throw new Error("IMPORT_PATH_NOT_DIRECTORY");
  if (
    canonical === parse(canonical).root ||
    canonical === realpathSync(homedir())
  ) {
    throw new Error("IMPORT_PATH_TOO_BROAD");
  }
  return canonical;
}

export function bootstrapToken(): string {
  return SESSION_TOKEN;
}

app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
});

app.use(
  "*",
  cors({
    origin: [...allowedOriginList],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use(
  "/api/*",
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) =>
      c.json(
        { code: "BODY_TOO_LARGE", message: "Solicitud demasiado grande." },
        413,
      ),
  }),
);

app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path === "/api/health") return next();
  const origin = c.req.header("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return c.json(
      { code: "ORIGIN_DENIED", message: "Origen no autorizado." },
      403,
    );
  }
  if (path === "/api/session") return next();
  if (getCookie(c, "agency_session") !== SESSION_TOKEN) {
    return c.json(
      { code: "UNAUTHORIZED", message: "Sesión local no válida." },
      401,
    );
  }
  return next();
});

app.post("/api/session", async (c) => {
  const parsed = z
    .object({ token: z.string().min(32).max(256) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_REQUEST", message: "Token de sesión inválido." },
      400,
    );
  }
  const actual = Buffer.from(SESSION_TOKEN);
  const supplied = Buffer.from(parsed.data.token);
  if (actual.length !== supplied.length || !timingSafeEqual(actual, supplied)) {
    return c.json(
      { code: "UNAUTHORIZED", message: "Token de sesión inválido." },
      401,
    );
  }
  setCookie(c, "agency_session", SESSION_TOKEN, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return c.json({ ok: true });
});

app.get("/api/health", async (c) => {
  return c.json({
    ok: true,
    name: "La Agencia",
    version: AGENCY_VERSION,
  });
});

app.get("/api/status", async (c) => {
  const settings = loadSettings();
  const subs = await listReadySubscriptions();
  const active = await pickSubscriptionAdapter(settings);
  return c.json({
    ok: true,
    agents: loadCatalog().count,
    subscription: {
      active,
      installed: subs
        .filter((subscription) => subscription.installed)
        .map((subscription) => subscription.id),
      ready: Boolean(active || settings.llm.apiKey),
    },
  });
});

// ── Settings ───────────────────────────────────────────────
app.get("/api/settings", async (c) => {
  const s = loadSettings();
  const pub = publicSettings(s);
  const subs = await listReadySubscriptions();
  const active = await pickSubscriptionAdapter(s);
  return c.json({
    ...pub,
    subscription: {
      active,
      options: subs,
      /** true si el PO puede hablar con suscripción o (avanzado) key */
      chatReady: Boolean(active || s.llm.apiKey),
    },
  });
});

app.put("/api/settings", async (c) => {
  const parsed = z
    .object({
      introLevel: z.enum(["guided", "standard", "advanced"]).optional(),
      orchestrator: z.literal("po-techlead").optional(),
      harness: z.literal("consultancy").optional(),
      primaryAdapter: adapterIdSchema.nullable().optional(),
      enabledAdapters: z.array(adapterIdSchema).max(6).optional(),
      workspacesRoot: z.string().max(4096).optional(),
      llm: z
        .object({
          provider: z
            .enum(["openai", "anthropic", "xai", "groq", "kimi", "custom"])
            .optional(),
          model: z.string().min(1).max(200).optional(),
          baseUrl: z.string().url().max(2048).optional(),
        })
        .optional(),
      usage: z
        .object({
          warnAt: z.number().min(0).max(1).optional(),
          blockHeavyAt: z.number().min(0).max(1).optional(),
          pollMinutes: z.number().int().min(1).max(1440).optional(),
          cursorHoursLimit: z.number().positive().max(10000).optional(),
          cursorHoursUsed: z.number().min(0).max(10000).optional(),
        })
        .optional(),
      modelsByTier: z
        .object({ cheap: z.string(), medium: z.string(), high: z.string() })
        .partial()
        .optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_SETTINGS",
        message: "Ajustes inválidos.",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const body = parsed.data;
  const cur = loadSettings();
  const next: AgencySettings = {
    ...cur,
    ...body,
    llm: {
      ...cur.llm,
      ...body.llm,
      apiKey: process.env.LA_AGENCIA_API_KEY,
    },
    usage: { ...cur.usage, ...body.usage },
    modelsByTier: { ...cur.modelsByTier, ...body.modelsByTier },
    enabledAdapters: body.enabledAdapters ?? cur.enabledAdapters,
  };
  if (!next.workspacesRoot) next.workspacesRoot = defaultWorkspacesRoot();
  saveSettings(next);
  publish({ type: "log", message: "Ajustes guardados localmente." });
  return c.json(publicSettings(next));
});

// ── Adapters / suscripciones ───────────────────────────────
app.get("/api/adapters", async (c) => c.json(await detectAdapters()));
app.get("/api/adapters/meta", (c) => c.json(adapterNames()));
app.get("/api/adapters/:id/usage", async (c) => {
  const parsed = adapterIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success)
    return c.json(
      { code: "INVALID_ADAPTER", message: "Adapter inválido." },
      400,
    );
  const id = parsed.data;
  return c.json(await usageReport(id));
});

/** Iniciar sesión de la suscripción (abre navegador / CLI login). Sin API keys. */
app.post("/api/adapters/:id/login", async (c) => {
  const parsed = adapterIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success)
    return c.json(
      { code: "INVALID_ADAPTER", message: "Adapter inválido." },
      400,
    );
  const id = parsed.data;
  try {
    const result = await startAdapterLogin(id);
    publish({
      type: "notification",
      message: result.message,
    });
    return c.json(result);
  } catch (e) {
    return c.json(
      {
        code: "ADAPTER_LOGIN_FAILED",
        message: e instanceof Error ? e.message : "No se pudo iniciar sesión",
      },
      400,
    );
  }
});

// ── Agents ─────────────────────────────────────────────────
app.get("/api/agents", (c) => {
  const type = c.req.query("type") || undefined;
  const category = c.req.query("category") || undefined;
  return c.json({
    count: loadCatalog().count,
    tree: treeByType(),
    agents: listAgents({ type, category }),
  });
});

app.get("/api/agents/:id", (c) => {
  const a = loadAgent(c.req.param("id"));
  if (!a)
    return c.json(
      { code: "AGENT_NOT_FOUND", message: "Agente no encontrado." },
      404,
    );
  return c.json(a);
});

// ── Repositories, agent templates and skills library ───────
app.get("/api/catalog", (c) => {
  const parsed = z
    .object({
      q: z.string().max(200).optional(),
      kind: z.enum(["repository", "agent", "skill"]).optional(),
      category: z.string().max(80).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    })
    .safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_CATALOG_QUERY",
        message: "Búsqueda de biblioteca inválida.",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const snapshot = loadResourceCatalog();
  const items = searchResourceCatalog({
    query: parsed.data.q,
    kind: parsed.data.kind,
    category: parsed.data.category,
    limit: parsed.data.limit,
  });
  return c.json({
    items,
    total: items.length,
    refreshedAt: snapshot.refreshedAt,
    nextRefreshAt: snapshot.nextRefreshAt,
    updating: snapshot.updating,
    errors: snapshot.errors,
  });
});

app.get("/api/catalog/status", (c) => {
  const snapshot = loadResourceCatalog();
  return c.json({
    count: snapshot.items.length,
    refreshedAt: snapshot.refreshedAt,
    nextRefreshAt: snapshot.nextRefreshAt,
    lastAttemptAt: snapshot.lastAttemptAt,
    updating: snapshot.updating,
    errors: snapshot.errors,
  });
});

app.post("/api/catalog/refresh", async (c) => {
  const snapshot = await refreshResourceCatalog({ force: true });
  return c.json({
    count: snapshot.items.length,
    refreshedAt: snapshot.refreshedAt,
    nextRefreshAt: snapshot.nextRefreshAt,
    updating: snapshot.updating,
    errors: snapshot.errors,
  });
});

app.get("/api/resource-installations", (c) => {
  const projectId = c.req.query("projectId") || undefined;
  return c.json({
    installations: listResourceInstallations(projectId),
  });
});

app.post("/api/catalog/install", async (c) => {
  const parsed = z
    .object({
      resourceId: z.string().min(1).max(1_000),
      projectId: z.string().min(1).max(200),
      permissionRequestId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_RESOURCE_INSTALL",
        message: "Solicitud de instalación inválida.",
      },
      400,
    );
  }
  const project = getProjectById(parsed.data.projectId);
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const item = loadResourceCatalog().items.find(
    (candidate) => candidate.id === parsed.data.resourceId,
  );
  if (!item) {
    return c.json(
      { code: "RESOURCE_NOT_FOUND", message: "Recurso no encontrado." },
      404,
    );
  }
  if (!parsed.data.permissionRequestId) {
    const permission = requestPermission({
      projectId: project.id,
      kind: "acquire_resource",
      title: "Adquirir recurso open source",
      summary:
        "Se descargará una copia inmutable, se escaneará y quedará desactivada hasta que decidas usarla.",
      technicalDetail: item.id,
      agentId: "alex",
    });
    return c.json({ permission: permission.request }, 202);
  }
  const permission = getPermission(parsed.data.permissionRequestId);
  if (
    !permission ||
    permission.projectId !== project.id ||
    permission.kind !== "acquire_resource" ||
    permission.status !== "allowed" ||
    permission.technicalDetail !== item.id
  ) {
    return c.json(
      {
        code: "RESOURCE_INSTALL_NOT_ALLOWED",
        message: "Falta un permiso válido para este recurso.",
      },
      403,
    );
  }
  if (
    !consumePermission({
      id: permission.id,
      projectId: project.id,
      kind: "acquire_resource",
    })
  ) {
    return c.json(
      {
        code: "RESOURCE_INSTALL_PERMISSION_USED",
        message: "El permiso ya fue utilizado.",
      },
      409,
    );
  }
  try {
    const installation = await acquireCatalogResource({
      item,
      projectId: project.id,
    });
    return c.json({ installation }, 201);
  } catch (error) {
    return c.json(
      {
        code: "RESOURCE_INSTALL_FAILED",
        message: "El recurso no superó la adquisición segura.",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});

app.post("/api/resource-installations/remove", async (c) => {
  const parsed = z
    .object({
      installationId: z.string().min(1).max(200),
      projectId: z.string().min(1).max(200),
      permissionRequestId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_RESOURCE_REMOVAL",
        message: "Solicitud de eliminación inválida.",
      },
      400,
    );
  }
  const installation = listResourceInstallations(parsed.data.projectId).find(
    (candidate) => candidate.id === parsed.data.installationId,
  );
  if (!installation) {
    return c.json(
      {
        code: "RESOURCE_INSTALLATION_NOT_FOUND",
        message: "Instalación no encontrada.",
      },
      404,
    );
  }
  if (!parsed.data.permissionRequestId) {
    const permission = requestPermission({
      projectId: parsed.data.projectId,
      kind: "delete_files",
      title: "Retirar recurso adquirido",
      summary:
        "La copia se moverá a una papelera local recuperable y dejará de estar activa.",
      technicalDetail: installation.id,
      agentId: "alex",
    });
    return c.json({ permission: permission.request }, 202);
  }
  const permission = getPermission(parsed.data.permissionRequestId);
  if (
    !permission ||
    permission.projectId !== parsed.data.projectId ||
    permission.kind !== "delete_files" ||
    permission.status !== "allowed" ||
    permission.technicalDetail !== installation.id
  ) {
    return c.json(
      {
        code: "RESOURCE_REMOVAL_NOT_ALLOWED",
        message: "Falta un permiso válido para retirar este recurso.",
      },
      403,
    );
  }
  if (
    !consumePermission({
      id: permission.id,
      projectId: parsed.data.projectId,
      kind: "delete_files",
    })
  ) {
    return c.json(
      {
        code: "RESOURCE_REMOVAL_PERMISSION_USED",
        message: "El permiso ya fue utilizado.",
      },
      409,
    );
  }
  const removed = removeResourceInstallation(
    installation.id,
    parsed.data.projectId,
  );
  return c.json({ installation: removed });
});

app.post("/api/resource-installations/activate", async (c) => {
  const parsed = z
    .object({
      installationId: z.string().min(1).max(200),
      projectId: z.string().min(1).max(200),
      permissionRequestId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_RESOURCE_ACTIVATION",
        message: "Solicitud de restauración inválida.",
      },
      400,
    );
  }
  const installation = listResourceInstallations(parsed.data.projectId).find(
    (candidate) =>
      candidate.id === parsed.data.installationId &&
      candidate.status === "superseded",
  );
  if (!installation) {
    return c.json(
      {
        code: "RESOURCE_VERSION_NOT_FOUND",
        message: "La versión anterior no está disponible.",
      },
      404,
    );
  }
  if (!parsed.data.permissionRequestId) {
    const permission = requestPermission({
      projectId: parsed.data.projectId,
      kind: "activate_resource",
      technicalDetail: installation.id,
      agentId: "alex",
    });
    return c.json({ permission: permission.request }, 202);
  }
  const permission = getPermission(parsed.data.permissionRequestId);
  if (
    !permission ||
    permission.projectId !== parsed.data.projectId ||
    permission.kind !== "activate_resource" ||
    permission.status !== "allowed" ||
    permission.technicalDetail !== installation.id
  ) {
    return c.json(
      {
        code: "RESOURCE_ACTIVATION_NOT_ALLOWED",
        message: "Falta un permiso válido para restaurar esta versión.",
      },
      403,
    );
  }
  if (
    !consumePermission({
      id: permission.id,
      projectId: parsed.data.projectId,
      kind: "activate_resource",
    })
  ) {
    return c.json(
      {
        code: "RESOURCE_ACTIVATION_PERMISSION_USED",
        message: "El permiso ya fue utilizado.",
      },
      409,
    );
  }
  try {
    const activated = activateResourceInstallation(
      installation.id,
      parsed.data.projectId,
    );
    return c.json({ installation: activated });
  } catch (error) {
    return c.json(
      {
        code: "RESOURCE_ACTIVATION_FAILED",
        message: "La versión no superó la comprobación de integridad.",
        details: error instanceof Error ? error.message : String(error),
      },
      409,
    );
  }
});

// ── Projects ───────────────────────────────────────────────
app.get("/api/projects", (c) => c.json({ projects: listProjectMetas() }));

app.get("/api/projects/:id", (c) => {
  const p = getProjectById(c.req.param("id"));
  if (!p)
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  return c.json(p);
});

app.post("/api/projects", async (c) => {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      mode: z.enum(["new", "import"]).optional(),
      importPath: z.string().max(4096).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_PROJECT", message: "Datos del proyecto inválidos." },
      400,
    );
  }
  const body = parsed.data;
  const settings = loadSettings();
  const name = (body.name || "Mi proyecto").trim();
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "proyecto";

  let workspacePath: string;
  if (body.mode === "import" && body.importPath) {
    try {
      workspacePath = canonicalImportPath(body.importPath);
    } catch {
      return c.json(
        {
          code: "INVALID_IMPORT_PATH",
          message: "La carpeta a importar no es segura o no existe.",
        },
        400,
      );
    }
  } else {
    ensureDir(settings.workspacesRoot || defaultWorkspacesRoot());
    workspacePath = join(
      settings.workspacesRoot || defaultWorkspacesRoot(),
      `${slug}-${nanoid(4)}`,
    );
    mkdirSync(workspacePath, { recursive: true });
    // seed minimal readme
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(workspacePath, "README.md"),
      `# ${name}\n\nProyecto gestionado por La Agencia.\n`,
      "utf8",
    );
  }

  ensureDir(join(workspacePath, ".agency"));

  const settingsNow = loadSettings();
  const project: Project = {
    schemaVersion: 1,
    id: nanoid(12),
    name,
    slug,
    status: "setup",
    workspacePath,
    source: body.mode === "import" ? "import" : "new",
    brief: {
      goals: [],
      users: [],
      mustHaves: [],
      outOfScope: [],
      constraints: [],
      rawNotes: "",
    },
    hiredAgentIds: ["product-owner", "tech-lead", "onboarding-guide"],
    floorLeaders: ["pau", "alex", "ana", "maya", "leo", "nora", "sam"],
    sprints: [],
    epics: [
      {
        id: nanoid(8),
        title: "Primera entrega usable",
        order: 1,
        status: "doing",
        sprintIds: [],
      },
    ],
    userTodos: [],
    busyAgentIds: [],
    locale: "es",
    messages: [
      {
        id: nanoid(8),
        role: "assistant",
        agentId: "pau",
        content:
          "¡Bienvenido! Soy **Pau** (Product Owner).\n\nCamina por la oficina y acércate a alguien. Pulsa **F** o **E** para hablar:\n· **Pau** — negocio y entregas\n· **Alex** — técnico (orquesta al equipo)\n· **Ana** — cuentas y pasos manuales (GitHub, AWS…)\n\nLos demás líderes (Maya, Leo, Nora, Sam) llevan marketing, diseño, legal y QA. Los subagentes trabajan en suboficinas: tú solo hablas con líderes.",
        createdAt: new Date().toISOString(),
      },
    ],
    primaryAdapter: settingsNow.primaryAdapter,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveProject(project);
  publish({
    type: "notification",
    projectId: project.id,
    message: `Proyecto «${name}» creado.`,
  });
  return c.json(project, 201);
});

// ── Chat (por líder) ───────────────────────────────────────
app.post("/api/projects/:id/chat", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({
      message: z.string().trim().min(1).max(20_000),
      leaderId: z
        .enum(["pau", "alex", "ana", "maya", "leo", "nora", "sam"])
        .optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ code: "INVALID_CHAT", message: "Mensaje inválido." }, 400);
  const body = parsed.data;
  const leaderId = body.leaderId || "pau";
  const result = await withProjectLock(project.id, async () => {
    const current = getProjectById(project.id);
    if (!current) throw new Error("PROJECT_NOT_FOUND");
    return chatWithLeader(current, leaderId, body.message.trim());
  });
  return c.json(result);
});

app.get("/api/leaders", (c) => c.json({ leaders: FLOOR_LEADERS }));

app.get("/api/projects/:id/queue", (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  return c.json({ queue: loadQueue(project.workspacePath) });
});

app.post("/api/projects/:id/todos/:todoId/complete", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  try {
    const updated = await withProjectLock(project.id, async () => {
      const current = getProjectById(project.id);
      if (!current) throw new Error("PROJECT_NOT_FOUND");
      return completeUserTodo(current, c.req.param("todoId"));
    });
    return c.json(updated);
  } catch (e) {
    return c.json(
      {
        code: "TODO_UPDATE_FAILED",
        message: "No se pudo actualizar la tarea.",
        details: e instanceof Error ? e.message : String(e),
      },
      400,
    );
  }
});

// ── Multi-oficina (sidebar) ────────────────────────────────
function officesFile() {
  return join(CONFIG_DIR, "offices.json");
}
function loadOffices(): OfficeDesk[] {
  if (!existsSync(officesFile())) {
    const seed: OfficeDesk[] = [
      { id: "main", name: "La Agencia", projectId: null, adapterId: null },
    ];
    writeJsonAtomic(officesFile(), seed);
    return seed;
  }
  return readJson(
    officesFile(),
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        projectId: z.string().nullable(),
        adapterId: adapterIdSchema.nullable(),
        path: z.string().optional(),
      }),
    ),
    [],
  );
}
function saveOffices(list: OfficeDesk[]) {
  writeJsonAtomic(officesFile(), list);
}

app.get("/api/offices", (c) => c.json({ offices: loadOffices() }));

app.post("/api/offices", async (c) => {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      adapterId: adapterIdSchema.nullable().optional(),
      projectId: z.string().max(120).nullable().optional(),
      path: z.string().max(4096).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_OFFICE", message: "Oficina inválida." },
      400,
    );
  }
  const body = parsed.data;
  const list = loadOffices();
  const desk: OfficeDesk = {
    id: nanoid(8),
    name: body.name || "Nueva oficina",
    projectId: body.projectId ?? null,
    adapterId: body.adapterId ?? null,
    path: body.path,
  };
  list.push(desk);
  saveOffices(list);
  return c.json(desk, 201);
});

app.patch("/api/offices/:id", async (c) => {
  const list = loadOffices();
  const i = list.findIndex((o) => o.id === c.req.param("id"));
  if (i < 0)
    return c.json(
      { code: "OFFICE_NOT_FOUND", message: "Oficina no encontrada." },
      404,
    );
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      adapterId: adapterIdSchema.nullable().optional(),
      projectId: z.string().max(120).nullable().optional(),
      path: z.string().max(4096).optional(),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_OFFICE", message: "Oficina inválida." },
      400,
    );
  }
  const body = parsed.data;
  list[i] = { ...list[i], ...body, id: list[i].id };
  saveOffices(list);
  return c.json(list[i]);
});

// ── Cost (jornada / equivalente API) ───────────────────────
app.get("/api/cost/today", (c) => {
  return c.json(getDayCostReport());
});

// ── Permissions ────────────────────────────────────────────
app.get("/api/permissions", (c) => {
  const projectId = c.req.query("projectId") || undefined;
  return c.json({ pending: listPending(projectId) });
});

app.post("/api/permissions/:id/resolve", async (c) => {
  const parsed = z
    .object({
      decision: z.enum(["allow_once", "allow_project_session", "deny"]),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_DECISION", message: "Decisión inválida." },
      400,
    );
  }
  const result = resolvePermission(c.req.param("id"), parsed.data.decision);
  if (!result.ok || !result.request) {
    return c.json(
      { code: "PERMISSION_NOT_PENDING", message: "Solicitud no disponible." },
      409,
    );
  }
  const operationId = result.request.operationId;
  let operation = operationId ? getOperation(operationId) : null;
  if (operationId && parsed.data.decision === "deny") {
    operation = updateOperation(operationId, {
      status: "cancelled",
      error: "PERMISSION_DENIED",
    });
  } else if (operationId) {
    operation = transitionOperation(
      operationId,
      ["waiting_permission"],
      "queued",
    );
    if (operation) scheduleSprintOperation(operation.id);
  }
  return c.json({ ...result, operation });
});

app.get("/api/operations", (c) => {
  return c.json({
    operations: listOperations(c.req.query("projectId") || undefined),
  });
});

app.get("/api/operations/:id", (c) => {
  const operation = getOperation(c.req.param("id"));
  if (!operation) {
    return c.json(
      { code: "OPERATION_NOT_FOUND", message: "Operación no encontrada." },
      404,
    );
  }
  return c.json({ operation });
});

app.post("/api/operations/:id/cancel", (c) => {
  if (!cancelSprintOperation(c.req.param("id"))) {
    return c.json(
      {
        code: "OPERATION_NOT_CANCELLABLE",
        message: "La operación ya no puede cancelarse.",
      },
      409,
    );
  }
  return c.json({ operation: getOperation(c.req.param("id")) });
});

// ── Preview / tunnel (no port jargon for the client) ───────
app.get("/api/projects/:id/preview", (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  return c.json({
    preview: getPreview(project.id),
    tunnelToolReady: false, // filled async below for clients that poll settings
  });
});

app.post("/api/projects/:id/preview", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({})
    .strict()
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      {
        code: "INVALID_PREVIEW_REQUEST",
        message: "La preview no acepta puertos elegidos por el cliente.",
      },
      400,
    );
  }
  try {
    const handle = await startLocalPreview({
      projectId: project.id,
      workspace: project.workspacePath,
    });
    return c.json(
      { preview: handle, clientMessage: "La preview local está lista." },
      201,
    );
  } catch (error) {
    return c.json(
      {
        code: "PREVIEW_FAILED",
        message: "No se pudo iniciar una preview segura.",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});

app.delete("/api/projects/:id/preview", (c) => {
  return c.json({ stopped: stopPreview(c.req.param("id")) });
});

app.post("/api/projects/:id/preview/share", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({
      permissionRequestId: z.string().optional(),
      ttlMinutes: z.number().int().min(5).max(120).default(30),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_SHARE_REQUEST", message: "Solicitud inválida." },
      400,
    );
  }
  if (!parsed.data.permissionRequestId) {
    const permission = requestPermission({
      projectId: project.id,
      kind: "deploy_production",
      agentId: "alex",
      title: "Compartir preview públicamente",
      summary: `La preview será pública durante ${parsed.data.ttlMinutes} minutos.`,
      technicalDetail: getPreview(project.id)?.localUrl,
    });
    return c.json({ permission: permission.request }, 202);
  }
  const permission = getPermission(parsed.data.permissionRequestId);
  if (
    !permission ||
    permission.projectId !== project.id ||
    permission.kind !== "deploy_production" ||
    permission.status !== "allowed"
  ) {
    return c.json(
      { code: "SHARE_NOT_ALLOWED", message: "Falta un permiso válido." },
      403,
    );
  }
  if (
    !consumePermission({
      id: permission.id,
      projectId: project.id,
      kind: "deploy_production",
    })
  ) {
    return c.json(
      {
        code: "SHARE_PERMISSION_USED",
        message: "El permiso ya fue utilizado.",
      },
      409,
    );
  }
  try {
    return c.json(
      { preview: await sharePreview(project.id, parsed.data.ttlMinutes) },
      201,
    );
  } catch (error) {
    return c.json(
      {
        code: "SHARE_FAILED",
        message: "No se pudo compartir la preview.",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});

app.delete("/api/projects/:id/preview/share", (c) => {
  return c.json({ stopped: stopSharing(c.req.param("id")) });
});

app.get("/api/tunnel/status", async (c) => {
  return c.json({ available: await tunnelAvailable() });
});

// ── Triggers ───────────────────────────────────────────────
app.get("/api/projects/:id/triggers", (c) => {
  return c.json(
    {
      code: "FEATURE_NOT_AVAILABLE",
      message: "Triggers estarán disponibles en v0.5.",
    },
    410,
  );
});

app.post("/api/projects/:id/triggers", async (c) => {
  return c.json(
    {
      code: "FEATURE_NOT_AVAILABLE",
      message: "Triggers estarán disponibles en v0.5.",
    },
    410,
  );
});

app.post("/api/projects/:id/triggers/:tid/fire", async (c) => {
  return c.json(
    {
      code: "FEATURE_NOT_AVAILABLE",
      message: "Triggers estarán disponibles en v0.5.",
    },
    410,
  );
});

// ── MCP ────────────────────────────────────────────────────
app.get("/api/mcp", (c) =>
  c.json(
    {
      code: "FEATURE_NOT_AVAILABLE",
      message: "MCP estará disponible en v0.6.",
    },
    410,
  ),
);

app.post("/api/mcp/:id/toggle", async (c) => {
  return c.json(
    {
      code: "FEATURE_NOT_AVAILABLE",
      message: "MCP estará disponible en v0.6.",
    },
    410,
  );
});

// ── Hire agents ────────────────────────────────────────────
app.post("/api/projects/:id/hire", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({ agentIds: z.array(z.string().min(1).max(120)).max(50) })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { code: "INVALID_AGENTS", message: "Agentes inválidos." },
      400,
    );
  const updated = await withProjectLock(project.id, () => {
    const current = getProjectById(project.id);
    if (!current) throw new Error("PROJECT_NOT_FOUND");
    for (const id of parsed.data.agentIds || []) {
      if (!current.hiredAgentIds.includes(id) && loadAgent(id)) {
        current.hiredAgentIds.push(id);
      }
    }
    current.status = current.status === "setup" ? "staffing" : current.status;
    current.updatedAt = new Date().toISOString();
    saveProject(current);
    return current;
  });
  return c.json(updated);
});

// ── Sprints ────────────────────────────────────────────────
app.post("/api/projects/:id/sprints/plan", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({ goal: z.string().trim().min(1).max(2000).optional() })
    .strict()
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ code: "INVALID_GOAL", message: "Objetivo inválido." }, 400);
  const result = await withProjectLock(project.id, async () => {
    const current = getProjectById(project.id);
    if (!current) throw new Error("PROJECT_NOT_FOUND");
    const sprint = await planSprint(current, parsed.data.goal);
    return { sprint, project: getProjectById(project.id) };
  });
  return c.json(result);
});

app.post("/api/projects/:id/sprints/:sprintId/run", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const sprintId = c.req.param("sprintId");
  if (!project.sprints.some((sprint) => sprint.id === sprintId)) {
    return c.json(
      { code: "SPRINT_NOT_FOUND", message: "Sprint no encontrado." },
      404,
    );
  }
  const idempotencyKey =
    c.req.header("idempotency-key") ||
    `${project.id}:${sprintId}:${project.sprints.length}`;
  const { operation, created } = createSprintOperation({
    projectId: project.id,
    sprintId,
    idempotencyKey: idempotencyKey.slice(0, 200),
  });
  if (!created) return c.json({ operation }, 202);

  const permission = requestPermission({
    projectId: project.id,
    operationId: operation.id,
    kind: "spend_heavy",
    agentId: "alex",
    technicalDetail: `Sprint ${sprintId}`,
  });
  updateOperation(operation.id, { permissionRequestId: permission.request.id });
  if (permission.autoApproved) {
    const queued = transitionOperation(
      operation.id,
      ["waiting_permission"],
      "queued",
    );
    if (queued) scheduleSprintOperation(queued.id);
  }
  return c.json({ operation: getOperation(operation.id) }, 202);
});

app.post("/api/projects/:id/sprints/:sprintId/feedback", async (c) => {
  const project = getProjectById(c.req.param("id"));
  if (!project) {
    return c.json(
      { code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado." },
      404,
    );
  }
  const parsed = z
    .object({
      decision: z.enum(["approve", "request_changes"]),
      comment: z.string().max(10_000).default(""),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "INVALID_FEEDBACK", message: "Feedback inválido." },
      400,
    );
  }
  try {
    const result = await withProjectLock(project.id, () => {
      const current = getProjectById(project.id);
      if (!current) throw new Error("PROJECT_NOT_FOUND");
      const sprint = applySprintFeedback(
        current,
        c.req.param("sprintId"),
        parsed.data.decision,
        parsed.data.comment,
      );
      return { sprint, project: getProjectById(project.id) };
    });
    return c.json(result);
  } catch (e) {
    return c.json(
      {
        code: "FEEDBACK_FAILED",
        message: "No se pudo registrar el feedback.",
        details: e instanceof Error ? e.message : String(e),
      },
      400,
    );
  }
});

// ── Events SSE ─────────────────────────────────────────────
app.get("/api/events", (c) => {
  return streamSSE(c, async (stream) => {
    for (const e of getRecent(20)) {
      await stream.writeSSE({
        data: JSON.stringify(e),
        event: e.type,
        id: e.id,
      });
    }
    const unsub = subscribe(async (e) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(e),
          event: e.type,
          id: e.id,
        });
      } catch {
        /* closed */
      }
    });
    // keep alive
    const iv = setInterval(() => {
      void stream.writeSSE({
        data: "{}",
        event: "ping",
        id: String(Date.now()),
      });
    }, 15000);
    await new Promise<void>((resolve) => {
      const signal = c.req.raw.signal;
      if (!signal) return;
      signal.addEventListener("abort", () => {
        clearInterval(iv);
        unsub();
        resolve();
      });
    });
  });
});

// ── Harnesses / orchestrators list ─────────────────────────
app.get("/api/harnesses", (c) =>
  c.json({
    items: [{ id: "consultancy", name: "Consultora", default: true }],
  }),
);

app.get("/api/orchestrators", (c) =>
  c.json({
    items: [{ id: "po-techlead", name: "PO → Líder Técnico", default: true }],
  }),
);

export function startBackgroundTasks(): void {
  recoverInterruptedOperations();
  resumeQueuedSprintOperations();
  startResourceCatalogScheduler();
}

app.all("/api/*", (c) =>
  c.json({ code: "NOT_FOUND", message: "Ruta de API no encontrada." }, 404),
);

if (existsSync(WEB_DIST_ROOT)) {
  app.use(
    "/*",
    serveStatic({
      root: WEB_DIST_ROOT,
      precompressed: true,
      onFound: (path, c) => {
        c.header(
          "Cache-Control",
          path.includes("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
  app.get(
    "/*",
    serveStatic({
      root: WEB_DIST_ROOT,
      path: "index.html",
      onFound: (_path, c) => c.header("Cache-Control", "no-cache"),
    }),
  );
}

app.onError((error, c) => {
  console.error(error);
  return c.json(
    { code: "INTERNAL_ERROR", message: "Error interno del runtime." },
    500,
  );
});
