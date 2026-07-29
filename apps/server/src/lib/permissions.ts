// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module permissionsGate
 * Persistent human approval gate. Sensitive work cannot run until this module
 * records an explicit, scoped decision.
 */

import { join } from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  PermissionDecision,
  PermissionKind,
  PermissionRecord,
  PermissionRequest,
  PermissionRiskLevel,
} from "@la-agencia/shared";
import { CONFIG_DIR } from "./paths.js";
import { publish } from "./events.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";
import { updateOperation } from "./operations.js";

const permissionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  operationId: z.string().optional(),
  kind: z.enum([
    "install_dependency",
    "acquire_resource",
    "activate_resource",
    "delete_files",
    "deploy_production",
    "spend_heavy",
    "open_external",
    "mcp_tool",
    "shell_dangerous",
  ]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["pending", "allowed", "denied", "expired", "consumed"]),
  expiresAt: z.string(),
  title: z.string(),
  summary: z.string(),
  technicalDetail: z.string().optional(),
  agentId: z.string().optional(),
  createdAt: z.string(),
  recommended: z.enum(["allow_once", "allow_project_session", "deny"]),
});

const stateSchema = z.object({
  requests: z.array(permissionSchema),
  records: z.array(
    z.object({
      requestId: z.string(),
      operationId: z.string().optional(),
      decision: z.enum(["allow_once", "allow_project_session", "deny"]),
      decidedAt: z.string(),
    }),
  ),
});

type PermissionState = {
  requests: PermissionRequest[];
  records: PermissionRecord[];
};

const stateFile = join(CONFIG_DIR, "permissions.json");
const projectSessionTrust = new Set<string>();

const KIND_COPY: Record<
  PermissionKind,
  {
    title: string;
    summary: string;
    recommended: PermissionDecision;
    riskLevel: PermissionRiskLevel;
  }
> = {
  install_dependency: {
    title: "Instalar una herramienta",
    summary: "El equipo necesita instalar un paquete dentro de este proyecto.",
    recommended: "allow_once",
    riskLevel: "medium",
  },
  acquire_resource: {
    title: "Adquirir recurso open source",
    summary: "Se descargará y revisará una copia inmutable para este proyecto.",
    recommended: "allow_once",
    riskLevel: "high",
  },
  activate_resource: {
    title: "Restaurar una versión adquirida",
    summary:
      "Una copia anterior ya escaneada volverá a ser la versión activa del recurso.",
    recommended: "allow_once",
    riskLevel: "high",
  },
  delete_files: {
    title: "Borrar archivos",
    summary:
      "Se eliminarán archivos del proyecto. Revisa el detalle antes de continuar.",
    recommended: "deny",
    riskLevel: "high",
  },
  deploy_production: {
    title: "Publicar en internet",
    summary:
      "El resultado quedará accesible desde internet durante un tiempo limitado.",
    recommended: "deny",
    riskLevel: "critical",
  },
  spend_heavy: {
    title: "Iniciar el sprint",
    summary:
      "El equipo usará tu herramienta de IA para implementar y verificar el sprint.",
    recommended: "allow_project_session",
    riskLevel: "medium",
  },
  open_external: {
    title: "Abrir un servicio externo",
    summary: "Se abrirá un enlace o aplicación externa.",
    recommended: "allow_once",
    riskLevel: "medium",
  },
  mcp_tool: {
    title: "Usar una conexión extra",
    summary: "Un especialista solicita usar una herramienta conectada.",
    recommended: "allow_once",
    riskLevel: "high",
  },
  shell_dangerous: {
    title: "Ejecutar un comando sensible",
    summary: "El comando podría realizar cambios importantes en el proyecto.",
    recommended: "deny",
    riskLevel: "critical",
  },
};

function loadState(): PermissionState {
  return readJson(stateFile, stateSchema, { requests: [], records: [] });
}

function saveState(state: PermissionState): void {
  writeJsonAtomic(stateFile, {
    requests: state.requests.slice(-500),
    records: state.records.slice(-500),
  });
}

function trustKey(projectId: string, kind: PermissionKind): string {
  return `${projectId}:${kind}`;
}

function canPersistTrust(kind: PermissionKind): boolean {
  return (
    kind === "spend_heavy" ||
    kind === "install_dependency" ||
    kind === "open_external"
  );
}

/** Creates or reuses a persisted permission request without executing work. */
export function requestPermission(input: {
  projectId: string;
  operationId?: string;
  kind: PermissionKind;
  technicalDetail?: string;
  agentId?: string;
  title?: string;
  summary?: string;
  expiresInMs?: number;
}): { request: PermissionRequest; autoApproved: boolean } {
  const state = loadState();
  const existing = state.requests.find(
    (request) =>
      Boolean(input.operationId) &&
      request.projectId === input.projectId &&
      request.operationId === input.operationId &&
      request.kind === input.kind &&
      request.status === "pending",
  );
  if (existing) return { request: existing, autoApproved: false };

  const base = KIND_COPY[input.kind];
  const now = Date.now();
  const autoApproved =
    canPersistTrust(input.kind) &&
    projectSessionTrust.has(trustKey(input.projectId, input.kind));
  const request: PermissionRequest = {
    id: nanoid(10),
    projectId: input.projectId,
    operationId: input.operationId,
    kind: input.kind,
    riskLevel: base.riskLevel,
    status: autoApproved ? "allowed" : "pending",
    expiresAt: new Date(now + (input.expiresInMs ?? 10 * 60_000)).toISOString(),
    title: input.title ?? base.title,
    summary: input.summary ?? base.summary,
    technicalDetail: input.technicalDetail,
    agentId: input.agentId,
    createdAt: new Date(now).toISOString(),
    recommended: base.recommended,
  };
  state.requests.push(request);
  if (autoApproved) {
    state.records.push({
      requestId: request.id,
      operationId: request.operationId,
      decision: "allow_project_session",
      decidedAt: new Date().toISOString(),
    });
  }
  saveState(state);

  publish({
    type: autoApproved ? "permission.resolved" : "permission.request",
    projectId: input.projectId,
    message: autoApproved
      ? "Permiso aplicado para esta sesión del proyecto."
      : request.title,
    payload: { ...request },
  });
  return { request, autoApproved };
}

/** Lists unexpired permission requests visible to the local UI. */
export function listPending(projectId?: string): PermissionRequest[] {
  expirePermissions();
  return loadState().requests.filter(
    (request) =>
      request.status === "pending" &&
      (!projectId || request.projectId === projectId),
  );
}

/** Returns one permission after applying expiry rules. */
export function getPermission(id: string): PermissionRequest | null {
  expirePermissions();
  return loadState().requests.find((request) => request.id === id) ?? null;
}

/** Consumes a high-risk allow-once permission so it cannot be replayed. */
export function consumePermission(input: {
  id: string;
  projectId: string;
  kind: PermissionKind;
}): boolean {
  const state = loadState();
  const request = state.requests.find((candidate) => candidate.id === input.id);
  if (
    !request ||
    request.projectId !== input.projectId ||
    request.kind !== input.kind ||
    request.status !== "allowed" ||
    Date.parse(request.expiresAt) <= Date.now()
  ) {
    return false;
  }
  request.status = "consumed";
  saveState(state);
  return true;
}

/** Records an explicit human decision and optional project-session trust. */
export function resolvePermission(
  id: string,
  decision: PermissionDecision,
): { ok: boolean; request?: PermissionRequest } {
  const state = loadState();
  const index = state.requests.findIndex((request) => request.id === id);
  if (index < 0 || state.requests[index].status !== "pending")
    return { ok: false };
  const request = state.requests[index];
  if (Date.parse(request.expiresAt) <= Date.now()) {
    request.status = "expired";
    saveState(state);
    return { ok: false, request };
  }

  if (
    decision === "allow_project_session" &&
    (!canPersistTrust(request.kind) || request.riskLevel === "critical")
  ) {
    return { ok: false, request };
  }

  request.status = decision === "deny" ? "denied" : "allowed";
  if (decision === "allow_project_session") {
    projectSessionTrust.add(trustKey(request.projectId, request.kind));
  }
  state.records.push({
    requestId: id,
    operationId: request.operationId,
    decision,
    decidedAt: new Date().toISOString(),
  });
  saveState(state);
  publish({
    type: "permission.resolved",
    projectId: request.projectId,
    message: decision === "deny" ? "Acción denegada." : "Acción permitida.",
    payload: {
      id,
      decision,
      kind: request.kind,
      operationId: request.operationId,
    },
  });
  return { ok: true, request };
}

/** Expires stale requests and cancels their linked operations. */
export function expirePermissions(): PermissionRequest[] {
  const state = loadState();
  const expired: PermissionRequest[] = [];
  for (const request of state.requests) {
    if (
      request.status === "pending" &&
      Date.parse(request.expiresAt) <= Date.now()
    ) {
      request.status = "expired";
      expired.push(request);
      if (request.operationId) {
        updateOperation(request.operationId, {
          status: "cancelled",
          error: "PERMISSION_EXPIRED",
        });
      }
    }
  }
  if (expired.length) saveState(state);
  return expired;
}
