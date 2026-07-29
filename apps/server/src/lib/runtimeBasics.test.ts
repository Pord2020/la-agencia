// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { basename, delimiter } from "node:path";
import {
  listAgents,
  loadAgent,
  loadCatalog,
  loadPoAgent,
  treeByType,
} from "./agents.js";
import { getRecent, publish, subscribe } from "./events.js";
import { candidatePaths, enrichPath, extraBinDirs } from "./pathEnv.js";

describe("runtime metadata", () => {
  it("indexes and filters only real agent manifests", () => {
    const catalog = loadCatalog();
    expect(catalog.count).toBe(catalog.agents.length);
    expect(loadCatalog()).toBe(catalog);
    expect(
      listAgents({ type: "core" }).every((agent) => agent.type === "core"),
    ).toBe(true);
    expect(
      listAgents({ category: "leadership" }).every(
        (agent) => agent.category === "leadership",
      ),
    ).toBe(true);
    expect(loadAgent("not-real")).toBeNull();
    const productOwner = loadPoAgent();
    expect(productOwner.id).toBe("product-owner");
    expect(productOwner.systemPrompt.length).toBeGreaterThan(10);
    const tree = treeByType();
    expect(Object.keys(tree).length).toBeGreaterThan(1);
  });

  it("builds deterministic cross-platform binary candidates without duplicates", () => {
    const candidates = candidatePaths([
      "cursor",
      "claude",
      "codex",
      "agy",
      "antigravity",
      "kimi",
      "generic",
    ]);
    expect(candidates).toContain("cursor");
    expect(candidates).toContain(
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    );
    expect(
      candidates.some((candidate) => basename(candidate) === "claude"),
    ).toBe(true);
    expect(candidates.some((candidate) => candidate.includes("codex"))).toBe(
      true,
    );
    expect(candidates).toContain("/Applications/Kimi.app/Contents/MacOS/Kimi");
    expect(Array.isArray(extraBinDirs())).toBe(true);
    expect(new Set(candidates).size).toBe(candidates.length);
    const previousPath = process.env.PATH;
    enrichPath();
    expect(process.env.PATH).toContain(previousPath?.split(delimiter)[0] || "");
  });
});

describe("runtime event bus", () => {
  it("delivers, unsubscribes and retains a bounded recent history", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const explicit = publish({
      type: "log",
      message: "first",
      createdAt: "2026-07-29T00:00:00.000Z",
    });
    expect(explicit.createdAt).toBe("2026-07-29T00:00:00.000Z");
    expect(listener).toHaveBeenCalledWith(explicit);
    unsubscribe();
    publish({ type: "notification", message: "after unsubscribe" });
    expect(listener).toHaveBeenCalledOnce();

    for (let index = 0; index < 205; index += 1) {
      publish({ type: "log", message: `event-${index}` });
    }
    expect(getRecent(500)).toHaveLength(200);
    expect(getRecent(2).map((event) => event.message)).toEqual([
      "event-203",
      "event-204",
    ]);
  });
});
