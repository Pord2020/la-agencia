// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module operations
 * Persistent lifecycle for long-running and permission-gated agency work.
 */

import { join } from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AgencyOperation, OperationStatus } from "@la-agencia/shared";
import { CONFIG_DIR } from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";
import { publish } from "./events.js";

const operationSchema = z.object({
  id: z.string(),
  kind: z.literal("sprint"),
  projectId: z.string(),
  sprintId: z.string(),
  status: z.enum([
    "waiting_permission",
    "queued",
    "running",
    "verifying",
    "review",
    "blocked",
    "failed",
    "cancelled",
  ]),
  idempotencyKey: z.string(),
  attempts: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  timeoutAt: z.string().optional(),
  permissionRequestId: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const operationsSchema = z.array(operationSchema);
const operationsFile = join(CONFIG_DIR, "operations.json");

function load(): AgencyOperation[] {
  return readJson(operationsFile, operationsSchema, []).map((operation) => ({
    ...operation,
    attempts: operation.attempts ?? 0,
    maxAttempts: operation.maxAttempts ?? 2,
  }));
}

function save(operations: AgencyOperation[]): void {
  writeJsonAtomic(operationsFile, operations.slice(-500));
}

/** Lists persisted operations, optionally scoped to one project. */
export function listOperations(projectId?: string): AgencyOperation[] {
  return load().filter(
    (operation) => !projectId || operation.projectId === projectId,
  );
}

/** Returns the latest persisted snapshot for an operation. */
export function getOperation(id: string): AgencyOperation | null {
  return load().find((operation) => operation.id === id) ?? null;
}

/** Creates an idempotent permission-gated sprint operation. */
export function createSprintOperation(input: {
  projectId: string;
  sprintId: string;
  idempotencyKey: string;
}): { operation: AgencyOperation; created: boolean } {
  const operations = load();
  const existing = operations.find(
    (operation) =>
      operation.projectId === input.projectId &&
      operation.sprintId === input.sprintId &&
      operation.idempotencyKey === input.idempotencyKey,
  );
  if (existing) return { operation: existing, created: false };

  const now = new Date().toISOString();
  const operation: AgencyOperation = {
    id: nanoid(12),
    kind: "sprint",
    projectId: input.projectId,
    sprintId: input.sprintId,
    status: "waiting_permission",
    idempotencyKey: input.idempotencyKey,
    attempts: 0,
    maxAttempts: 2,
    createdAt: now,
    updatedAt: now,
  };
  operations.push(operation);
  save(operations);
  return { operation, created: true };
}

/** Persists an operation patch and emits a state event. */
export function updateOperation(
  id: string,
  patch: Partial<
    Pick<
      AgencyOperation,
      | "status"
      | "permissionRequestId"
      | "error"
      | "attempts"
      | "maxAttempts"
      | "timeoutAt"
    >
  >,
): AgencyOperation | null {
  const operations = load();
  const index = operations.findIndex((operation) => operation.id === id);
  if (index < 0) return null;
  operations[index] = {
    ...operations[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  save(operations);
  publish({
    type: "operation.update",
    projectId: operations[index].projectId,
    message: `Operación ${operations[index].status}.`,
    payload: { operation: operations[index] },
  });
  return operations[index];
}

/** Performs a compare-and-set status transition. */
export function transitionOperation(
  id: string,
  from: OperationStatus[],
  to: OperationStatus,
  error?: string,
): AgencyOperation | null {
  const operation = getOperation(id);
  if (!operation || !from.includes(operation.status)) return null;
  return updateOperation(id, { status: to, error });
}

/** Marks non-resumable work interrupted by a server restart as failed. */
export function recoverInterruptedOperations(): AgencyOperation[] {
  const recovered: AgencyOperation[] = [];
  for (const operation of load()) {
    if (operation.status === "running" || operation.status === "verifying") {
      const updated = updateOperation(operation.id, {
        status: "failed",
        error: "INTERRUPTED_BY_RESTART",
      });
      if (updated) recovered.push(updated);
    }
  }
  return recovered;
}
