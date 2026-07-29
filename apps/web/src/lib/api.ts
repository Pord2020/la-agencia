// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

const BASE = "";
let sessionReady: Promise<void> | null = null;

async function ensureSession(): Promise<void> {
  if (sessionReady) return sessionReady;
  sessionReady = (async () => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("session");
    if (!token) return;
    const response = await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error("No se pudo iniciar la sesión local.");
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  })();
  return sessionReady;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (path !== "/api/health" && path !== "/api/session") await ensureSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean; version: string }>("/api/health"),
  status: () =>
    req<{
      ok: boolean;
      agents: number;
      subscription?: { active?: string; installed?: string[]; ready?: boolean };
    }>("/api/status"),
  settings: () => req<Record<string, unknown>>("/api/settings"),
  saveSettings: (body: unknown) =>
    req("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  adapters: () =>
    req<
      Array<{
        id: string;
        name: string;
        installed: boolean;
        version?: string;
        detail?: string;
      }>
    >("/api/adapters"),
  adapterLogin: (adapterId: string) =>
    req<{ ok: boolean; message: string }>(`/api/adapters/${adapterId}/login`, {
      method: "POST",
      body: "{}",
    }),
  leaders: () =>
    req<{
      leaders: Array<{
        id: string;
        name: string;
        nameEn: string;
        role: string;
        roleEn: string;
        department: string;
      }>;
    }>("/api/leaders"),
  agents: () =>
    req<{
      count: number;
      tree: Record<
        string,
        Record<
          string,
          Array<{ id: string; name: string; type: string; category: string }>
        >
      >;
      agents: Array<{
        id: string;
        name: string;
        type: string;
        category: string;
      }>;
    }>("/api/agents"),
  catalog: (options?: {
    query?: string;
    kind?: "repository" | "agent" | "skill";
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.query) params.set("q", options.query);
    if (options?.kind) params.set("kind", options.kind);
    if (options?.limit) params.set("limit", String(options.limit));
    const suffix = params.size ? `?${params.toString()}` : "";
    return req<{
      items: ResourceCatalogItemDTO[];
      total: number;
      refreshedAt?: string;
      nextRefreshAt?: string;
      updating: boolean;
      errors: string[];
    }>(`/api/catalog${suffix}`);
  },
  refreshCatalog: () =>
    req<{
      count: number;
      refreshedAt?: string;
      nextRefreshAt?: string;
      updating: boolean;
      errors: string[];
    }>("/api/catalog/refresh", { method: "POST", body: "{}" }),
  resourceInstallations: (projectId: string) =>
    req<{ installations: ResourceInstallationDTO[] }>(
      `/api/resource-installations?projectId=${encodeURIComponent(projectId)}`,
    ),
  requestResourceInstall: (resourceId: string, projectId: string) =>
    req<{ permission: { id: string } }>("/api/catalog/install", {
      method: "POST",
      body: JSON.stringify({ resourceId, projectId }),
    }),
  confirmResourceInstall: (
    resourceId: string,
    projectId: string,
    permissionRequestId: string,
  ) =>
    req<{ installation: ResourceInstallationDTO }>("/api/catalog/install", {
      method: "POST",
      body: JSON.stringify({ resourceId, projectId, permissionRequestId }),
    }),
  requestResourceRemoval: (installationId: string, projectId: string) =>
    req<{ permission: { id: string } }>("/api/resource-installations/remove", {
      method: "POST",
      body: JSON.stringify({ installationId, projectId }),
    }),
  confirmResourceRemoval: (
    installationId: string,
    projectId: string,
    permissionRequestId: string,
  ) =>
    req<{ installation: ResourceInstallationDTO }>(
      "/api/resource-installations/remove",
      {
        method: "POST",
        body: JSON.stringify({
          installationId,
          projectId,
          permissionRequestId,
        }),
      },
    ),
  requestResourceActivation: (installationId: string, projectId: string) =>
    req<{ permission: { id: string } }>(
      "/api/resource-installations/activate",
      {
        method: "POST",
        body: JSON.stringify({ installationId, projectId }),
      },
    ),
  confirmResourceActivation: (
    installationId: string,
    projectId: string,
    permissionRequestId: string,
  ) =>
    req<{ installation: ResourceInstallationDTO }>(
      "/api/resource-installations/activate",
      {
        method: "POST",
        body: JSON.stringify({
          installationId,
          projectId,
          permissionRequestId,
        }),
      },
    ),
  projects: () =>
    req<{ projects: Array<{ id: string; name: string; path: string }> }>(
      "/api/projects",
    ),
  getProject: (id: string) => req<ProjectDTO>(`/api/projects/${id}`),
  createProject: (body: {
    name?: string;
    mode?: "new" | "import";
    importPath?: string;
  }) =>
    req<ProjectDTO>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  chat: (id: string, message: string, leaderId?: string) =>
    req<{ reply: string; project: ProjectDTO }>(`/api/projects/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, leaderId }),
    }),
  hire: (id: string, agentIds: string[]) =>
    req<ProjectDTO>(`/api/projects/${id}/hire`, {
      method: "POST",
      body: JSON.stringify({ agentIds }),
    }),
  planSprint: (id: string, goal?: string) =>
    req<{ sprint: SprintDTO; project: ProjectDTO }>(
      `/api/projects/${id}/sprints/plan`,
      {
        method: "POST",
        body: JSON.stringify({ goal }),
      },
    ),
  runSprint: (id: string, sprintId: string) =>
    req<{ operation: OperationDTO }>(
      `/api/projects/${id}/sprints/${sprintId}/run`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}",
      },
    ),
  operation: (id: string) =>
    req<{ operation: OperationDTO }>(`/api/operations/${id}`),
  cancelOperation: (id: string) =>
    req<{ operation: OperationDTO }>(`/api/operations/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  resolvePermission: (
    id: string,
    decision: "allow_once" | "allow_project_session" | "deny",
  ) =>
    req<{ operation?: OperationDTO }>(`/api/permissions/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  feedback: (
    id: string,
    sprintId: string,
    decision: "approve" | "request_changes",
    comment: string,
  ) =>
    req<{ sprint: SprintDTO; project: ProjectDTO }>(
      `/api/projects/${id}/sprints/${sprintId}/feedback`,
      { method: "POST", body: JSON.stringify({ decision, comment }) },
    ),
  queue: (id: string) =>
    req<{
      queue: Array<{
        id: string;
        title: string;
        status: string;
        kind: string;
      }>;
    }>(`/api/projects/${id}/queue`),
  preview: (id: string) =>
    req<{ preview: PreviewDTO | null }>(`/api/projects/${id}/preview`),
  startPreview: (id: string) =>
    req<{ preview: PreviewDTO }>(`/api/projects/${id}/preview`, {
      method: "POST",
      body: "{}",
    }),
  requestPreviewShare: (id: string, ttlMinutes = 30) =>
    req<{ permission: { id: string } }>(`/api/projects/${id}/preview/share`, {
      method: "POST",
      body: JSON.stringify({ ttlMinutes }),
    }),
  confirmPreviewShare: (
    id: string,
    permissionRequestId: string,
    ttlMinutes = 30,
  ) =>
    req<{ preview: PreviewDTO }>(`/api/projects/${id}/preview/share`, {
      method: "POST",
      body: JSON.stringify({ permissionRequestId, ttlMinutes }),
    }),
  stopPreviewShare: (id: string) =>
    req<{ stopped: boolean }>(`/api/projects/${id}/preview/share`, {
      method: "DELETE",
    }),
  stopPreview: (id: string) =>
    req<{ stopped: boolean }>(`/api/projects/${id}/preview`, {
      method: "DELETE",
    }),
  completeTodo: (id: string, todoId: string) =>
    req<ProjectDTO>(`/api/projects/${id}/todos/${todoId}/complete`, {
      method: "POST",
      body: "{}",
    }),
  offices: () =>
    req<{
      offices: Array<{
        id: string;
        name: string;
        projectId: string | null;
        adapterId: string | null;
        path?: string;
      }>;
    }>("/api/offices"),
  createOffice: (body: {
    name?: string;
    adapterId?: string | null;
    projectId?: string | null;
    path?: string;
  }) =>
    req("/api/offices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export interface ResourceCatalogItemDTO {
  id: string;
  kind: "repository" | "agent" | "skill";
  name: string;
  description: string;
  url: string;
  repository: string;
  repositoryUrl: string;
  source: string;
  category: string;
  trust: "official" | "verified" | "community";
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

export interface ResourceInstallationDTO {
  id: string;
  catalogItemId: string;
  projectId: string;
  repository: string;
  resourcePath: string;
  commit: string;
  contentHash: string;
  license: string;
  installedAt: string;
  status: "active" | "superseded" | "removed";
  installPath: string;
  fileCount: number;
  totalBytes: number;
  riskFlags: string[];
}

export interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  workspacePath: string;
  locale?: "es" | "en";
  brief: {
    goals: string[];
    users: string[];
    mustHaves: string[];
    rawNotes: string;
  };
  hiredAgentIds: string[];
  floorLeaders?: string[];
  busyAgentIds?: string[];
  sprints: SprintDTO[];
  epics?: Array<{
    id: string;
    title: string;
    order: number;
    status: string;
    sprintIds: string[];
  }>;
  userTodos?: Array<{
    id: string;
    title: string;
    detail: string;
    link?: string;
    steps: string[];
    status: string;
  }>;
  messages: Array<{
    id: string;
    role: string;
    agentId?: string;
    content: string;
  }>;
  primaryAdapter: string | null;
}

export interface OperationDTO {
  id: string;
  projectId: string;
  sprintId: string;
  status:
    | "waiting_permission"
    | "queued"
    | "running"
    | "verifying"
    | "review"
    | "blocked"
    | "failed"
    | "cancelled";
  error?: string;
}

export interface PreviewDTO {
  projectId: string;
  localUrl: string;
  publicUrl?: string;
  mode: "local" | "shared";
  startedAt: string;
  shareExpiresAt?: string;
}

export interface SprintDTO {
  id: string;
  number: number;
  goal: string;
  status: string;
  epicId?: string;
  reportPath?: string;
  tasks: Array<{
    id: string;
    title: string;
    ownerAgentId: string;
    status: string;
    acceptance: string[];
    summaryForPo?: string;
  }>;
  wireframes: string[];
  diagrams: string[];
  report?: string;
  feedback?: string;
}
