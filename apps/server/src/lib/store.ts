// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_SETTINGS,
  type AgencySettings,
  type AgencySettingsPublic,
  type Project,
} from "@la-agencia/shared";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PROJECTS_INDEX,
  defaultWorkspacesRoot,
  ensureDir,
  agencyDir,
} from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

ensureDir(CONFIG_DIR);

const PROJECT_SCHEMA_VERSION = 1;
const SETTINGS_SCHEMA_VERSION = 1;
const adapterIdSchema = z.enum([
  "claude-code",
  "cursor",
  "codex",
  "grok-build",
  "kimi",
  "antigravity",
]);
const briefSchema = z.object({
  goals: z.array(z.string()).max(200),
  users: z.array(z.string()).max(200),
  mustHaves: z.array(z.string()).max(500),
  outOfScope: z.array(z.string()).max(500),
  constraints: z.array(z.string()).max(500),
  rawNotes: z.string().max(2_000_000),
});
const evidenceSchema = z.object({
  kind: z.enum(["artifact", "command", "log", "screenshot"]),
  path: z.string().optional(),
  command: z.string().optional(),
  ok: z.boolean(),
  summary: z.string(),
});
const sprintTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  ownerAgentId: z.string(),
  status: z.enum(["todo", "doing", "review", "done", "blocked"]),
  acceptance: z.array(z.string()),
  adapterHint: adapterIdSchema.optional(),
  technicalBrief: z.string().optional(),
  summaryForPo: z.string().optional(),
  evidence: z.array(evidenceSchema).optional(),
});
const sprintSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  goal: z.string(),
  status: z.enum(["planned", "running", "review", "done"]),
  tasks: z.array(sprintTaskSchema),
  wireframes: z.array(z.string()),
  diagrams: z.array(z.string()),
  screenshots: z.array(z.string()),
  report: z.string().optional(),
  reportPath: z.string().optional(),
  feedback: z.string().optional(),
  epicId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const projectSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  slug: z.string().min(1).max(200),
  status: z.enum([
    "setup",
    "briefing",
    "staffing",
    "planning",
    "sprinting",
    "review",
    "idle",
  ]),
  workspacePath: z.string().min(1).max(4096),
  source: z.enum(["new", "import"]),
  brief: briefSchema,
  hiredAgentIds: z.array(z.string()).max(500),
  floorLeaders: z.array(z.string()).max(100),
  sprints: z.array(sprintSchema).max(500),
  epics: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        order: z.number(),
        status: z.enum(["todo", "doing", "done"]),
        sprintIds: z.array(z.string()),
      }),
    )
    .max(500),
  userTodos: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        link: z.string().optional(),
        steps: z.array(z.string()),
        status: z.enum(["pending", "doing", "done"]),
        blocksAgentId: z.string().optional(),
        createdAt: z.string(),
        completedAt: z.string().optional(),
      }),
    )
    .max(2_000),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        agentId: z.string().optional(),
        content: z.string().max(2_000_000),
        createdAt: z.string(),
      }),
    )
    .max(20_000),
  primaryAdapter: adapterIdSchema.nullable(),
  locale: z.enum(["es", "en"]),
  busyAgentIds: z.array(z.string()).max(500),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const settingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  introLevel: z.enum(["guided", "standard", "advanced"]),
  orchestrator: z.literal("po-techlead"),
  harness: z.literal("consultancy"),
  primaryAdapter: adapterIdSchema.nullable(),
  enabledAdapters: z.array(adapterIdSchema).max(6),
  llm: z.object({
    provider: z.enum(["openai", "anthropic", "xai", "groq", "kimi", "custom"]),
    model: z.string(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }),
  modelsByTier: z.object({
    cheap: z.string(),
    medium: z.string(),
    high: z.string(),
  }),
  usage: z.object({
    warnAt: z.number().min(0).max(1),
    blockHeavyAt: z.number().min(0).max(1),
    pollMinutes: z.number().int().positive(),
    cursorHoursLimit: z.number().positive().optional(),
    cursorHoursUsed: z.number().nonnegative().optional(),
  }),
  workspacesRoot: z.string(),
});
const projectLocks = new Map<string, Promise<void>>();

function migrateSettings(input: unknown): AgencySettings {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<AgencySettings>)
      : {};
  if (
    typeof raw.schemaVersion === "number" &&
    raw.schemaVersion > SETTINGS_SCHEMA_VERSION
  ) {
    throw new Error("SETTINGS_SCHEMA_TOO_NEW");
  }
  return settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    ...raw,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    orchestrator: "po-techlead",
    harness: "consultancy",
    llm: { ...DEFAULT_SETTINGS.llm, ...raw.llm },
    usage: { ...DEFAULT_SETTINGS.usage, ...raw.usage },
    modelsByTier: { ...DEFAULT_SETTINGS.modelsByTier, ...raw.modelsByTier },
    workspacesRoot: raw.workspacesRoot || defaultWorkspacesRoot(),
  });
}

function migrateProject(input: unknown): Project {
  if (!input || typeof input !== "object") throw new Error("INVALID_PROJECT");
  const raw = input as Partial<Project>;
  if (!raw.id || !raw.workspacePath) throw new Error("INVALID_PROJECT");
  if (
    typeof raw.schemaVersion === "number" &&
    raw.schemaVersion > PROJECT_SCHEMA_VERSION
  ) {
    throw new Error("PROJECT_SCHEMA_TOO_NEW");
  }
  return projectSchema.parse({
    ...raw,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    epics: raw.epics || [],
    userTodos: raw.userTodos || [],
    busyAgentIds: raw.busyAgentIds || [],
    floorLeaders: raw.floorLeaders || [
      "pau",
      "alex",
      "ana",
      "maya",
      "leo",
      "nora",
      "sam",
    ],
    locale: raw.locale || "es",
    hiredAgentIds: raw.hiredAgentIds || [],
    sprints: raw.sprints || [],
    messages: raw.messages || [],
    primaryAdapter: raw.primaryAdapter ?? null,
    brief: {
      goals: raw.brief?.goals || [],
      users: raw.brief?.users || [],
      mustHaves: raw.brief?.mustHaves || [],
      outOfScope: raw.brief?.outOfScope || [],
      constraints: raw.brief?.constraints || [],
      rawNotes: raw.brief?.rawNotes || "",
    },
  });
}

const settingsMigrationSchema = z
  .unknown()
  .transform<AgencySettings>((value, context) => {
    try {
      return migrateSettings(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid or unsupported settings schema",
      });
      return z.NEVER;
    }
  });
const projectMigrationSchema = z
  .unknown()
  .transform<Project>((value, context) => {
    try {
      return migrateProject(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid or unsupported project schema",
      });
      return z.NEVER;
    }
  });

export function loadSettings(): AgencySettings {
  if (!existsSync(CONFIG_FILE)) {
    const s = {
      ...DEFAULT_SETTINGS,
      workspacesRoot: defaultWorkspacesRoot(),
    };
    saveSettings(s);
    return s;
  }
  const raw = readJson<AgencySettings>(
    CONFIG_FILE,
    settingsMigrationSchema,
    migrateSettings(DEFAULT_SETTINGS),
  );
  // API keys from pre-v0.4 configs are migrated to process memory and removed
  // from disk on the next write. New persistent secrets are not accepted.
  const migratedKey = raw.llm?.apiKey;
  if (migratedKey && !process.env.LA_AGENCIA_API_KEY) {
    process.env.LA_AGENCIA_API_KEY = migratedKey;
    delete raw.llm.apiKey;
    saveSettings(raw);
  }
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    llm: {
      ...DEFAULT_SETTINGS.llm,
      ...raw.llm,
      apiKey: process.env.LA_AGENCIA_API_KEY,
    },
    usage: { ...DEFAULT_SETTINGS.usage, ...raw.usage },
    modelsByTier: { ...DEFAULT_SETTINGS.modelsByTier, ...raw.modelsByTier },
    workspacesRoot: raw.workspacesRoot || defaultWorkspacesRoot(),
  };
}

export function saveSettings(s: AgencySettings) {
  ensureDir(CONFIG_DIR);
  const persistable = {
    ...s,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    llm: { ...s.llm, apiKey: undefined },
  };
  writeJsonAtomic(CONFIG_FILE, settingsSchema.parse(persistable));
}

export function publicSettings(s: AgencySettings): AgencySettingsPublic {
  const { apiKey, ...llmRest } = s.llm;
  return {
    ...s,
    llm: {
      ...llmRest,
      hasKey: Boolean(apiKey && apiKey.length > 4),
    },
  };
}

interface ProjectsIndex {
  projects: Array<{ id: string; name: string; path: string }>;
}

function loadIndex(): ProjectsIndex {
  return readJson(
    PROJECTS_INDEX,
    z.object({
      projects: z.array(
        z.object({ id: z.string(), name: z.string(), path: z.string() }),
      ),
    }),
    { projects: [] },
  );
}

function saveIndex(idx: ProjectsIndex) {
  writeJsonAtomic(PROJECTS_INDEX, idx);
}

export function listProjectMetas() {
  return loadIndex().projects;
}

export function projectFile(workspacePath: string) {
  return join(agencyDir(workspacePath), "project.json");
}

export function loadProject(workspacePath: string): Project | null {
  const f = projectFile(workspacePath);
  if (!existsSync(f)) return null;
  try {
    return readJson<Project>(
      f,
      projectMigrationSchema,
      null as unknown as Project,
    );
  } catch {
    return null;
  }
}

export function saveProject(project: Project) {
  ensureDir(agencyDir(project.workspacePath));
  project.schemaVersion = PROJECT_SCHEMA_VERSION;
  const validated = projectSchema.parse(project);
  writeJsonAtomic(projectFile(project.workspacePath), validated);
  const idx = loadIndex();
  const i = idx.projects.findIndex((p) => p.id === project.id);
  const meta = {
    id: project.id,
    name: project.name,
    path: project.workspacePath,
  };
  if (i >= 0) idx.projects[i] = meta;
  else idx.projects.push(meta);
  saveIndex(idx);
}

/** Serializes every asynchronous mutation for one project in this process. */
export async function withProjectLock<T>(
  projectId: string,
  task: () => Promise<T> | T,
): Promise<T> {
  const previous = projectLocks.get(projectId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  projectLocks.set(projectId, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (projectLocks.get(projectId) === tail) projectLocks.delete(projectId);
  }
}

export function getProjectById(id: string): Project | null {
  const meta = loadIndex().projects.find((p) => p.id === id);
  if (!meta) return null;
  return loadProject(meta.path);
}
