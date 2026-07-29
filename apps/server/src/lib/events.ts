// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { nanoid } from "nanoid";
import type { AgencyEvent } from "@la-agencia/shared";

type Listener = (e: AgencyEvent) => void;
const listeners = new Set<Listener>();
const recent: AgencyEvent[] = [];

export function publish(
  partial: Omit<AgencyEvent, "id" | "createdAt"> & { createdAt?: string },
): AgencyEvent {
  const e: AgencyEvent = {
    id: nanoid(10),
    createdAt: partial.createdAt || new Date().toISOString(),
    type: partial.type,
    message: partial.message,
    projectId: partial.projectId,
    payload: partial.payload,
  };
  recent.push(e);
  if (recent.length > 200) recent.shift();
  for (const l of listeners) l(e);
  return e;
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRecent(limit = 50) {
  return recent.slice(-limit);
}
