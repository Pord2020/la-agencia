// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentManifest,
  CatalogAgent,
  ModelTier,
} from "@la-agencia/shared";
import { AGENTS_ROOT } from "./paths.js";

interface CatalogFile {
  version: string;
  count: number;
  agents: CatalogAgent[];
}

let cache: CatalogFile | null = null;

export function loadCatalog(): CatalogFile {
  if (cache) return cache;
  const p = join(AGENTS_ROOT, "catalog.json");
  cache = JSON.parse(readFileSync(p, "utf8")) as CatalogFile;
  return cache;
}

export function listAgents(filter?: {
  type?: string;
  category?: string;
}): CatalogAgent[] {
  let agents = loadCatalog().agents;
  if (filter?.type) agents = agents.filter((a) => a.type === filter.type);
  if (filter?.category)
    agents = agents.filter((a) => a.category === filter.category);
  return agents;
}

function parseFrontmatter(md: string): {
  meta: Record<string, string>;
  body: string;
} {
  if (!md.startsWith("---")) return { meta: {}, body: md };
  const end = md.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: md };
  const fm = md.slice(3, end).trim();
  const body = md.slice(end + 4).trim();
  const meta: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body };
}

function extractSystemPrompt(body: string): string {
  const m = body.match(/## System prompt\s*\n+([\s\S]*?)(?=\n## |\n# |$)/i);
  if (m) return m[1].trim();
  return body.slice(0, 4000);
}

export function loadAgent(id: string): AgentManifest | null {
  const entry = loadCatalog().agents.find((a) => a.id === id);
  if (!entry) return null;
  const candidates = [
    join(AGENTS_ROOT, entry.type, entry.category, entry.id, "AGENT.md"),
    join(AGENTS_ROOT, "..", entry.path),
    join(process.cwd(), entry.path),
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) return null;
  return parseAgentFile(file, entry);
}

function parseAgentFile(file: string, entry: CatalogAgent): AgentManifest {
  const md = readFileSync(file, "utf8");
  const { meta, body } = parseFrontmatter(md);
  return {
    id: entry.id,
    name: meta.name || entry.name,
    type: entry.type,
    category: entry.category,
    role: meta.role || "specialist",
    talks_to_user: meta.talks_to_user === "true" || entry.talks_to_user,
    default_model_tier:
      (meta.default_model_tier as ModelTier) || entry.default_model_tier,
    version: meta.version,
    path: entry.path,
    systemPrompt: extractSystemPrompt(body),
  };
}

export function loadPoAgent(): AgentManifest {
  return (
    loadAgent("product-owner") || {
      id: "product-owner",
      name: "Pau · Product Owner",
      type: "core",
      category: "leadership",
      role: "product_owner",
      talks_to_user: true,
      default_model_tier: "cheap",
      path: "",
      systemPrompt:
        "Eres Pau, Product Owner de La Agencia. Hablas en español claro. Guías al usuario sin jerga.",
    }
  );
}

export function treeByType() {
  const agents = listAgents();
  const tree: Record<string, Record<string, CatalogAgent[]>> = {};
  for (const a of agents) {
    tree[a.type] ||= {};
    tree[a.type][a.category] ||= [];
    tree[a.type][a.category].push(a);
  }
  return tree;
}
