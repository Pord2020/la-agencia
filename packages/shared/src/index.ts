// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/** Shared contracts for La Agencia */

export type IntroLevel = "guided" | "standard" | "advanced";
export type ModelTier = "cheap" | "medium" | "high";
export type ProjectStatus =
  | "setup"
  | "briefing"
  | "staffing"
  | "planning"
  | "sprinting"
  | "review"
  | "idle";

export type OperationStatus =
  | "waiting_permission"
  | "queued"
  | "running"
  | "verifying"
  | "review"
  | "blocked"
  | "failed"
  | "cancelled";

export interface AgencyOperation {
  id: string;
  kind: "sprint";
  projectId: string;
  sprintId: string;
  status: OperationStatus;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  timeoutAt?: string;
  permissionRequestId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type AdapterId =
  "claude-code" | "cursor" | "codex" | "grok-build" | "kimi" | "antigravity";

export type OrchestratorId = "po-techlead" | "cost-aware" | "multi-office";
export type HarnessId =
  | "consultancy"
  | "ralph-loop"
  | "generator-evaluator"
  | "long-running"
  | "multi-office";

export type LlmProvider =
  "openai" | "anthropic" | "xai" | "groq" | "kimi" | "custom";

export interface AgencySettings {
  schemaVersion: number;
  introLevel: IntroLevel;
  orchestrator: OrchestratorId;
  harness: HarnessId;
  primaryAdapter: AdapterId | null;
  enabledAdapters: AdapterId[];
  llm: {
    provider: LlmProvider;
    model: string;
    /** Never returned to clients after save; only hasKey flags */
    apiKey?: string;
    baseUrl?: string;
  };
  modelsByTier: Record<ModelTier, string>;
  usage: {
    warnAt: number;
    blockHeavyAt: number;
    pollMinutes: number;
    /** Manual cursor hours limit if known */
    cursorHoursLimit?: number;
    cursorHoursUsed?: number;
  };
  workspacesRoot: string;
}

export interface AgencySettingsPublic extends Omit<AgencySettings, "llm"> {
  llm: {
    provider: LlmProvider;
    model: string;
    baseUrl?: string;
    hasKey: boolean;
  };
}

export interface AgentManifest {
  id: string;
  name: string;
  type: string;
  category: string;
  role: string;
  talks_to_user: boolean;
  default_model_tier: ModelTier;
  version?: string;
  path: string;
  systemPrompt: string;
}

export interface CatalogAgent {
  id: string;
  name: string;
  type: string;
  category: string;
  default_model_tier: ModelTier;
  talks_to_user: boolean;
  path: string;
}

export type ResourceKind = "repository" | "agent" | "skill";
export type ResourceTrust = "official" | "verified" | "community";

/**
 * Searchable metadata only. Catalog entries are never executable and do not
 * imply that a dependency or skill has been approved for installation.
 */
export interface ResourceCatalogItem {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string;
  url: string;
  repository: string;
  repositoryUrl: string;
  source: string;
  category: string;
  trust: ResourceTrust;
  score: number;
  stars: number;
  forks: number;
  license: string;
  language?: string;
  topics: string[];
  resourcePath?: string;
  skillPath?: string;
  pushedAt?: string;
  indexedAt: string;
  riskFlags: string[];
}

export interface ResourceCatalogSnapshot {
  schemaVersion: number;
  refreshedAt?: string;
  nextRefreshAt?: string;
  lastAttemptAt?: string;
  updating: boolean;
  errors: string[];
  items: ResourceCatalogItem[];
}

export interface ProjectBrief {
  goals: string[];
  users: string[];
  mustHaves: string[];
  outOfScope: string[];
  constraints: string[];
  rawNotes: string;
}

export interface SprintTask {
  id: string;
  title: string;
  description: string;
  ownerAgentId: string;
  status: "todo" | "doing" | "review" | "done" | "blocked";
  acceptance: string[];
  adapterHint?: AdapterId;
  technicalBrief?: string;
  summaryForPo?: string;
  evidence?: Array<{
    kind: "artifact" | "command" | "log" | "screenshot";
    path?: string;
    command?: string;
    ok: boolean;
    summary: string;
  }>;
}

export interface Sprint {
  id: string;
  number: number;
  goal: string;
  status: "planned" | "running" | "review" | "done";
  tasks: SprintTask[];
  wireframes: string[];
  diagrams: string[];
  screenshots: string[];
  report?: string;
  reportPath?: string;
  feedback?: string;
  epicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  title: string;
  order: number;
  status: "todo" | "doing" | "done";
  sprintIds: string[];
}

export interface UserTodo {
  id: string;
  title: string;
  detail: string;
  link?: string;
  steps: string[];
  status: "pending" | "doing" | "done";
  blocksAgentId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface QueueItem {
  id: string;
  kind: "sprint_task" | "chat" | "report" | "coding";
  title: string;
  status: "queued" | "running" | "done" | "failed" | "skipped";
  projectId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  agentId?: string;
  content: string;
  createdAt: string;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  workspacePath: string;
  source: "new" | "import";
  brief: ProjectBrief;
  hiredAgentIds: string[];
  /** Leaders visible on main floor */
  floorLeaders: string[];
  sprints: Sprint[];
  epics: Epic[];
  userTodos: UserTodo[];
  messages: ChatMessage[];
  primaryAdapter: AdapterId | null;
  locale: "es" | "en";
  busyAgentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OfficeDesk {
  id: string;
  name: string;
  projectId: string | null;
  adapterId: AdapterId | null;
  path?: string;
}

export interface AdapterDetectResult {
  id: AdapterId;
  name: string;
  installed: boolean;
  version?: string;
  detail?: string;
  capabilities: AdapterCapabilities;
  policy: AdapterExecutionPolicy;
}

export interface AdapterCapabilities {
  chat: boolean;
  coding: boolean;
  verify: boolean;
  usage: boolean;
  login: boolean;
}

/** Enforceable execution policy, not a descriptive capability claim. */
export interface AdapterExecutionPolicy {
  timeoutMs: number;
  supportsCancellation: boolean;
  autonomousCoding: boolean;
  isolation: "temporary-chat" | "staged-workspace" | "manual-only";
  safeArguments: string[];
  allowedEnvironment: string[];
  blockedActions: Array<
    "delete_files" | "deploy_production" | "network" | "shell_dangerous"
  >;
}

export interface UsageReport {
  adapterId: AdapterId;
  percentUsed?: number;
  hoursUsed?: number;
  hoursLimit?: number;
  estimated: boolean;
  message: string;
  level: "ok" | "warn" | "critical" | "unknown";
}

export interface CodingJob {
  projectId: string;
  taskId: string;
  cwd: string;
  prompt: string;
  adapterId: AdapterId;
  signal?: AbortSignal;
}

export interface AgencyEvent {
  id: string;
  type:
    | "agent.activity"
    | "sprint.update"
    | "usage.alert"
    | "task.completed"
    | "notification"
    | "log"
    | "permission.request"
    | "permission.resolved"
    | "cost.updated"
    | "trigger.fired"
    | "preview.ready"
    | "agent.animation"
    | "catalog.updated"
    | "operation.update";
  projectId?: string;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface Handoff {
  agent_id: string;
  summary_for_po: string;
  technical_brief: string;
  artifacts: string[];
  risks: string[];
  needs_user_action: boolean;
  user_action_steps?: string[];
}

export const DEFAULT_SETTINGS: AgencySettings = {
  schemaVersion: 1,
  introLevel: "guided",
  orchestrator: "po-techlead",
  harness: "consultancy",
  primaryAdapter: null,
  enabledAdapters: [],
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
  },
  modelsByTier: {
    cheap: "gpt-4o-mini",
    medium: "gpt-4o",
    high: "gpt-4o",
  },
  usage: {
    warnAt: 0.8,
    blockHeavyAt: 0.9,
    pollMinutes: 15,
  },
  workspacesRoot: "",
};

export * from "./cost.js";
export * from "./permissions.js";
export * from "./version.js";
