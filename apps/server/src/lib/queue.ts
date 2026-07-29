// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { QueueItem } from "@la-agencia/shared";
import { agencyDir, ensureDir } from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

function queuePath(workspace: string) {
  return join(agencyDir(workspace), "queue.json");
}

export function loadQueue(workspace: string): QueueItem[] {
  ensureDir(agencyDir(workspace));
  return readJson(
    queuePath(workspace),
    z.array(
      z.custom<QueueItem>((value) =>
        Boolean(value && typeof value === "object"),
      ),
    ),
    [],
  );
}

export function saveQueue(workspace: string, items: QueueItem[]) {
  ensureDir(agencyDir(workspace));
  writeJsonAtomic(queuePath(workspace), items);
}

export function enqueue(
  workspace: string,
  partial: Omit<QueueItem, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: QueueItem["status"];
  },
): QueueItem {
  const items = loadQueue(workspace);
  const item: QueueItem = {
    id: nanoid(10),
    kind: partial.kind,
    title: partial.title,
    status: partial.status || "queued",
    projectId: partial.projectId,
    payload: partial.payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.push(item);
  saveQueue(workspace, items);
  return item;
}

export function updateQueueItem(
  workspace: string,
  id: string,
  patch: Partial<QueueItem>,
): QueueItem | null {
  const items = loadQueue(workspace);
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch, updatedAt: new Date().toISOString() };
  saveQueue(workspace, items);
  return items[i];
}
