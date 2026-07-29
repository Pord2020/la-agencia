// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module resourceCatalog
 * Maintains a local, metadata-only index of reputable open-source repositories
 * and agent skills. Refreshing the catalog never downloads or executes code.
 */

import { unlinkSync, existsSync } from "node:fs";
import { z } from "zod";
import type {
  ResourceCatalogItem,
  ResourceCatalogSnapshot,
  ResourceKind,
} from "@la-agencia/shared";
import { RESOURCE_CATALOG_FILE } from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";
import { publish } from "./events.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_FORCE_INTERVAL_MS = 5 * 60 * 1000;
const GITHUB_API = "https://api.github.com";
const MAX_GITHUB_PAYLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
]);

const SEARCH_SOURCES = [
  { id: "web", category: "web", query: "topic:web-framework stars:>5000" },
  { id: "testing", category: "testing", query: "topic:testing stars:>3000" },
  {
    id: "developer-tools",
    category: "developer-tools",
    query: "topic:developer-tools stars:>3000",
  },
  {
    id: "ai-agents",
    category: "ai-agents",
    query: "topic:ai-agents stars:>1000",
  },
  {
    id: "automation",
    category: "automation",
    query: "topic:automation stars:>3000",
  },
] as const;

interface CatalogSource {
  repository: string;
  category: string;
  trust: ResourceCatalogItem["trust"];
  license?: string;
  skillPathPrefix?: string;
  templateRoots?: Record<string, string>;
}

const AWESOME_LLM_REPOSITORY = "Shubhamsaboo/awesome-llm-apps";
const CATALOG_SOURCES: CatalogSource[] = [
  {
    repository: "openai/skills",
    category: "agent-skills",
    trust: "official",
  },
  {
    repository: "anthropics/skills",
    category: "agent-skills",
    trust: "official",
  },
  {
    repository: AWESOME_LLM_REPOSITORY,
    category: "agent-examples",
    trust: "verified",
    license: "Apache-2.0",
    skillPathPrefix: "agent_skills/",
    templateRoots: {
      advanced_ai_agents: "advanced-agent",
      advanced_llm_apps: "llm-application",
      ai_agent_framework_crash_course: "agent-framework-course",
      always_on_agents: "always-on-agent",
      generative_ui_agents: "generative-ui-agent",
      mcp_ai_agents: "mcp-agent",
      rag_tutorials: "rag-agent",
      starter_ai_agents: "starter-agent",
      voice_ai_agents: "voice-agent",
    },
  },
];

const CURATED_SKILL_METADATA: Record<
  string,
  { description: string; riskFlags: string[] }
> = {
  "advisor-orchestrator-worker": {
    description:
      "Coordinates advisor, orchestrator and worker models with budget and verification gates.",
    riskFlags: ["network-access", "cost-bearing", "external-models"],
  },
  "commit-archaeologist": {
    description:
      "Reconstructs why code exists using local Git history and co-change evidence.",
    riskFlags: ["git-history-read"],
  },
  "project-graveyard": {
    description:
      "Audits abandoned projects from local Git metadata and proposes a bounded recovery plan.",
    riskFlags: ["filesystem-scan", "git-history-read"],
  },
  "scope-creep-detector": {
    description:
      "Compares a diff with its stated intent and flags unrelated scope using a deterministic local script.",
    riskFlags: ["repository-read"],
  },
  "self-improving-agent-skills": {
    description:
      "Evaluates and rewrites agent skills using Gemini and Google ADK.",
    riskFlags: ["network-access", "self-modifying", "external-models"],
  },
  "thinking-out-loud": {
    description:
      "Turns an unstructured voice or text explanation into a brief while separating assumptions.",
    riskFlags: [],
  },
};

const INTERNAL_TEMPLATE_SEGMENTS = new Set([
  ".agent",
  ".claude",
  "assets",
  "backend",
  "client",
  "docker",
  "docs",
  "evals",
  "fixtures",
  "frontend",
  "images",
  "logs",
  "node_modules",
  "public",
  "scripts",
  "tests",
  "web",
]);

const itemSchema = z.object({
  id: z.string(),
  kind: z.enum(["repository", "agent", "skill"]),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  repository: z.string(),
  repositoryUrl: z.string(),
  source: z.string(),
  category: z.string(),
  trust: z.enum(["official", "verified", "community"]),
  score: z.number(),
  stars: z.number(),
  forks: z.number(),
  license: z.string(),
  language: z.string().optional(),
  topics: z.array(z.string()),
  resourcePath: z.string().optional(),
  skillPath: z.string().optional(),
  pushedAt: z.string().optional(),
  indexedAt: z.string(),
  riskFlags: z.array(z.string()),
});

const snapshotSchema = z.object({
  schemaVersion: z.number(),
  refreshedAt: z.string().optional(),
  nextRefreshAt: z.string().optional(),
  lastAttemptAt: z.string().optional(),
  updating: z.boolean(),
  errors: z.array(z.string()),
  items: z.array(itemSchema),
});

const githubRepositorySchema = z.object({
  full_name: z.string().min(1).max(200),
  html_url: z.string().url().max(2048),
  description: z.string().max(2_000).nullable(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  archived: z.boolean(),
  fork: z.boolean(),
  pushed_at: z.string(),
  language: z.string().max(100).nullable(),
  topics: z.array(z.string().max(100)).max(100).optional(),
  license: z
    .object({ spdx_id: z.string().max(100).nullable().optional() })
    .nullable()
    .optional(),
  default_branch: z.string().min(1).max(255),
});

const githubTreeSchema = z.object({
  tree: z
    .array(
      z.object({
        path: z.string().max(4_096).optional(),
        type: z.enum(["blob", "tree", "commit"]).optional(),
      }),
    )
    .max(50_000)
    .optional(),
  truncated: z.boolean().optional(),
});

const githubSearchSchema = z.object({
  items: z.array(githubRepositorySchema).max(100).optional(),
});

type GitHubRepository = z.infer<typeof githubRepositorySchema>;
type GitHubTree = z.infer<typeof githubTreeSchema>;

type FetchLike = typeof fetch;
let refreshInFlight: Promise<ResourceCatalogSnapshot> | null = null;
let schedulerStarted = false;

const fallbackItems: ResourceCatalogItem[] = CATALOG_SOURCES.map((source) => ({
  id: `repository:${source.repository}`,
  kind: "repository",
  name: source.repository,
  description:
    source.trust === "official"
      ? "Official agent skills catalog. Metadata refresh pending."
      : "Verified community catalog of agent templates and skills. Metadata refresh pending.",
  url: `https://github.com/${source.repository}`,
  repository: source.repository,
  repositoryUrl: `https://github.com/${source.repository}`,
  source: `built-in:${source.repository}`,
  category: source.category,
  trust: source.trust,
  score: 80,
  stars: 0,
  forks: 0,
  license: source.license || "CHECK_SOURCE",
  topics: ["agent-skills"],
  indexedAt: new Date(0).toISOString(),
  riskFlags: source.license ? [] : ["license-review-required"],
}));

function emptySnapshot(): ResourceCatalogSnapshot {
  return {
    schemaVersion: 1,
    updating: false,
    errors: [],
    items: fallbackItems,
  };
}

export function loadResourceCatalog(): ResourceCatalogSnapshot {
  return readJson(RESOURCE_CATALOG_FILE, snapshotSchema, emptySnapshot());
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "la-agencia-resource-catalog",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    headers: githubHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${path.slice(0, 100)}`);
  }
  const text = await response.text();
  if (text.length > MAX_GITHUB_PAYLOAD_BYTES) {
    throw new Error(`GitHub payload too large for ${path.slice(0, 100)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`GitHub returned invalid JSON for ${path.slice(0, 100)}`);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`GitHub schema mismatch for ${path.slice(0, 100)}`);
  }
  return parsed.data;
}

function repositoryScore(repository: GitHubRepository): number {
  const stars = Math.min(
    50,
    Math.round(Math.log10(repository.stargazers_count + 1) * 11),
  );
  const ageDays = Math.max(
    0,
    (Date.now() - Date.parse(repository.pushed_at)) / (24 * 60 * 60 * 1000),
  );
  const freshness =
    ageDays <= 30 ? 30 : ageDays <= 180 ? 24 : ageDays <= 365 ? 16 : 8;
  const license = ALLOWED_LICENSES.has(repository.license?.spdx_id || "")
    ? 15
    : 0;
  return Math.min(100, stars + freshness + license);
}

function repositoryItem(
  repository: GitHubRepository,
  category: string,
  source: string,
  indexedAt: string,
  trust: ResourceCatalogItem["trust"] = "community",
): ResourceCatalogItem | null {
  const license = repository.license?.spdx_id || "UNKNOWN";
  if (
    repository.archived ||
    repository.fork ||
    !ALLOWED_LICENSES.has(license)
  ) {
    return null;
  }
  const trustBonus = trust === "official" ? 5 : trust === "verified" ? 3 : 0;
  const score = repositoryScore(repository) + trustBonus;
  if (score < 55) return null;
  return {
    id: `repository:${repository.full_name}`,
    kind: "repository",
    name: repository.full_name,
    description: repository.description || "Open-source repository",
    url: repository.html_url,
    repository: repository.full_name,
    repositoryUrl: repository.html_url,
    source,
    category,
    trust,
    score: Math.min(100, score),
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    license,
    language: repository.language || undefined,
    topics: repository.topics || [],
    pushedAt: repository.pushed_at,
    indexedAt,
    riskFlags: [],
  };
}

async function fetchRepositorySearch(
  source: (typeof SEARCH_SOURCES)[number],
  fetchImpl: FetchLike,
  signal: AbortSignal,
  indexedAt: string,
): Promise<ResourceCatalogItem[]> {
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const query = `${source.query} archived:false fork:false pushed:>=${twoYearsAgo}`;
  const result = await githubJson(
    `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=12`,
    githubSearchSchema,
    fetchImpl,
    signal,
  );
  return (result.items || [])
    .map((repository) =>
      repositoryItem(
        repository,
        source.category,
        `github-search:${source.id}`,
        indexedAt,
      ),
    )
    .filter((item): item is ResourceCatalogItem => Boolean(item));
}

function humanizeSlug(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function templateRiskFlags(resourcePath: string): string[] {
  const path = resourcePath.toLowerCase();
  const flags = new Set<string>([
    "not-installed",
    "template-only",
    "review-code-before-use",
  ]);
  if (path.startsWith("always_on_agents/"))
    flags.add("scheduled-background-work");
  if (path.startsWith("mcp_ai_agents/")) flags.add("external-tools");
  if (path.startsWith("voice_ai_agents/")) flags.add("microphone-access");
  if (path.startsWith("rag_tutorials/")) flags.add("data-ingestion");
  if (
    /(advanced|starter|voice|rag|mcp|generative_ui|framework_crash_course)/.test(
      path,
    )
  ) {
    flags.add("external-services-likely");
  }
  if (/(browser|scrap|web_use|computer_use)/.test(path))
    flags.add("browser-automation");
  if (
    /(medical|health|mental|finance|financial|investment|insurance|legal)/.test(
      path,
    )
  ) {
    flags.add("high-impact-domain");
  }
  if (/(self_evolving|self-improving|self_modifying)/.test(path))
    flags.add("self-modifying");
  return [...flags];
}

function templatePaths(
  source: CatalogSource,
  tree: GitHubTree,
): Array<{ path: string; category: string }> {
  if (!source.templateRoots) return [];
  const templateRoots = source.templateRoots;
  const paths = new Map<string, string>();
  const flatRoots = new Set([
    "always_on_agents",
    "generative_ui_agents",
    "mcp_ai_agents",
    "rag_tutorials",
    "starter_ai_agents",
    "voice_ai_agents",
  ]);

  for (const entry of tree.tree || []) {
    if (!entry.path) continue;
    const segments = entry.path.split("/");
    const root = segments[0];
    const category = templateRoots[root];
    if (!category) continue;

    let candidate: string | undefined;
    if (entry.type === "blob" && /^readme\.md$/i.test(segments.at(-1) || "")) {
      candidate = segments.slice(0, -1).join("/");
    } else if (
      entry.type === "tree" &&
      flatRoots.has(root) &&
      segments.length === 2
    ) {
      candidate = entry.path;
    }
    if (!candidate || candidate === root) continue;
    const candidateSegments = candidate.split("/").slice(1);
    if (
      candidateSegments.some((segment) =>
        INTERNAL_TEMPLATE_SEGMENTS.has(segment.toLowerCase()),
      )
    ) {
      continue;
    }
    paths.set(candidate, category);
  }

  return [...paths].map(([path, category]) => ({ path, category }));
}

async function fetchCatalogSource(
  source: CatalogSource,
  fetchImpl: FetchLike,
  signal: AbortSignal,
  indexedAt: string,
): Promise<ResourceCatalogItem[]> {
  const repository = await githubJson(
    `/repos/${source.repository}`,
    githubRepositorySchema,
    fetchImpl,
    signal,
  );
  const tree = await githubJson(
    `/repos/${source.repository}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
    githubTreeSchema,
    fetchImpl,
    signal,
  );
  if (tree.truncated) {
    throw new Error(`GitHub tree truncated for ${source.repository}`);
  }
  const repositoryUrl = repository.html_url;
  const sourceKey = `github-curated:${source.repository}`;
  const effectiveRepository = source.license
    ? { ...repository, license: { spdx_id: source.license } }
    : repository;
  const repositoryEntry = repositoryItem(
    effectiveRepository,
    source.category,
    sourceKey,
    indexedAt,
    source.trust,
  );
  const skills = (tree.tree || [])
    .filter((entry) => {
      if (
        entry.type !== "blob" ||
        !entry.path?.endsWith("/SKILL.md") ||
        entry.path.includes("/node_modules/")
      ) {
        return false;
      }
      if (!source.skillPathPrefix) return true;
      if (!entry.path.startsWith(source.skillPathPrefix)) return false;
      const relativeSegments = entry.path
        .slice(source.skillPathPrefix.length)
        .split("/");
      return (
        relativeSegments.length === 2 &&
        relativeSegments[0].toLowerCase() !== "evals"
      );
    })
    .slice(0, 500)
    .map((entry) => {
      const skillPath = entry.path!;
      const segments = skillPath.split("/");
      const name = segments.at(-2) || skillPath;
      const curated = CURATED_SKILL_METADATA[name];
      const license = source.license || "CHECK_SOURCE";
      const riskFlags = new Set<string>([
        "not-installed",
        ...(source.license ? [] : ["license-review-required"]),
        ...(curated?.riskFlags || []),
      ]);
      return {
        id: `skill:${source.repository}:${skillPath}`,
        kind: "skill" as const,
        name,
        description:
          curated?.description ||
          `Agent skill from the ${source.trust === "official" ? "official" : "verified"} ${source.repository} catalog.`,
        url: `${repositoryUrl}/tree/${repository.default_branch}/${skillPath.replace(/\/SKILL\.md$/, "")}`,
        repository: source.repository,
        repositoryUrl,
        source: sourceKey,
        category: source.category,
        trust: source.trust,
        score: Math.min(
          100,
          repositoryScore(effectiveRepository) +
            (source.trust === "official" ? 10 : 7),
        ),
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        license,
        language: repository.language || undefined,
        topics: [...(repository.topics || []), "agent-skill"],
        resourcePath: skillPath.replace(/\/SKILL\.md$/, ""),
        skillPath,
        pushedAt: repository.pushed_at,
        indexedAt,
        riskFlags: [...riskFlags],
      };
    });

  const templates = templatePaths(source, tree).map(
    ({ path: resourcePath, category }) => {
      const segments = resourcePath.split("/");
      const name = humanizeSlug(segments.at(-1) || resourcePath);
      return {
        id: `agent:${source.repository}:${resourcePath}`,
        kind: "agent" as const,
        name,
        description: `${humanizeSlug(category)} template from the verified ${source.repository} collection.`,
        url: `${repositoryUrl}/tree/${repository.default_branch}/${resourcePath}`,
        repository: source.repository,
        repositoryUrl,
        source: sourceKey,
        category,
        trust: source.trust,
        score: Math.min(100, repositoryScore(effectiveRepository) + 5),
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        license: source.license || repository.license?.spdx_id || "UNKNOWN",
        language: repository.language || undefined,
        topics: [
          ...(repository.topics || []),
          "agent-template",
          ...segments.slice(0, -1).map((segment) => segment.replace(/_/g, "-")),
        ],
        resourcePath,
        pushedAt: repository.pushed_at,
        indexedAt,
        riskFlags: templateRiskFlags(resourcePath),
      };
    },
  );

  return [
    ...(repositoryEntry ? [repositoryEntry] : []),
    ...skills,
    ...templates,
  ];
}

function deduplicate(items: ResourceCatalogItem[]): ResourceCatalogItem[] {
  const result = new Map<string, ResourceCatalogItem>();
  for (const item of items) {
    const existing = result.get(item.id);
    if (!existing || item.score > existing.score) result.set(item.id, item);
  }
  return [...result.values()].sort(
    (left, right) => right.score - left.score || right.stars - left.stars,
  );
}

function isFresh(snapshot: ResourceCatalogSnapshot): boolean {
  return Boolean(
    snapshot.refreshedAt &&
    Date.now() - Date.parse(snapshot.refreshedAt) < DAY_MS,
  );
}

export async function refreshResourceCatalog(options?: {
  force?: boolean;
  fetchImpl?: FetchLike;
}): Promise<ResourceCatalogSnapshot> {
  const current = loadResourceCatalog();
  if (!options?.force && isFresh(current)) return current;
  if (
    options?.force &&
    current.lastAttemptAt &&
    Date.now() - Date.parse(current.lastAttemptAt) < MIN_FORCE_INTERVAL_MS
  ) {
    return current;
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const fetchImpl = options?.fetchImpl || fetch;
    const indexedAt = new Date().toISOString();
    const errors: string[] = [];
    const collected: ResourceCatalogItem[] = [];
    const successfulSources = new Set<string>();
    writeJsonAtomic(RESOURCE_CATALOG_FILE, {
      ...current,
      updating: true,
      lastAttemptAt: indexedAt,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      for (const source of SEARCH_SOURCES) {
        try {
          const sourceKey = `github-search:${source.id}`;
          collected.push(
            ...(await fetchRepositorySearch(
              source,
              fetchImpl,
              controller.signal,
              indexedAt,
            )),
          );
          successfulSources.add(sourceKey);
        } catch (error) {
          errors.push(
            `${source.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      for (const source of CATALOG_SOURCES) {
        try {
          collected.push(
            ...(await fetchCatalogSource(
              source,
              fetchImpl,
              controller.signal,
              indexedAt,
            )),
          );
          successfulSources.add(`github-curated:${source.repository}`);
        } catch (error) {
          errors.push(
            `${source.repository}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const retained = current.items.filter(
      (item) =>
        !successfulSources.has(item.source) &&
        !item.source.startsWith("built-in:"),
    );
    const items = deduplicate([...retained, ...collected, ...fallbackItems]);
    const successful = successfulSources.size > 0;
    const snapshot: ResourceCatalogSnapshot = {
      schemaVersion: 1,
      refreshedAt: successful ? indexedAt : current.refreshedAt,
      nextRefreshAt: new Date(
        (successful ? Date.parse(indexedAt) : Date.now()) + DAY_MS,
      ).toISOString(),
      lastAttemptAt: indexedAt,
      updating: false,
      errors: errors.slice(0, 20),
      items,
    };
    writeJsonAtomic(RESOURCE_CATALOG_FILE, snapshot);
    publish({
      type: "catalog.updated",
      message: successful
        ? `Biblioteca actualizada: ${items.length} recursos.`
        : "No se pudo actualizar la biblioteca; se conserva la copia local.",
      payload: {
        count: items.length,
        errors: snapshot.errors.length,
        refreshedAt: snapshot.refreshedAt,
      },
    });
    return snapshot;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function searchResourceCatalog(options?: {
  query?: string;
  kind?: ResourceKind;
  category?: string;
  limit?: number;
}): ResourceCatalogItem[] {
  const snapshot = loadResourceCatalog();
  const query = (options?.query || "").trim().toLowerCase();
  const terms = query.split(/[^a-z0-9áéíóúñ+#.-]+/i).filter(Boolean);
  return snapshot.items
    .filter((item) => !options?.kind || item.kind === options.kind)
    .filter((item) => !options?.category || item.category === options.category)
    .map((item) => {
      const haystack = [
        item.name,
        item.description,
        item.category,
        item.language,
        item.resourcePath,
        ...item.topics,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const relevance = terms.reduce(
        (score, term) => score + (haystack.includes(term) ? 12 : 0),
        0,
      );
      return { item, relevance };
    })
    .filter(({ relevance }) => terms.length === 0 || relevance > 0)
    .sort(
      (left, right) =>
        right.relevance - left.relevance || right.item.score - left.item.score,
    )
    .slice(0, Math.min(Math.max(options?.limit || 30, 1), 500))
    .map(({ item }) => item);
}

export function catalogPromptBlock(query: string, limit = 5): string {
  const items = searchResourceCatalog({ query, limit });
  if (!items.length) return "";
  return [
    "LOCAL RESOURCE CATALOG (metadata only; never install or execute without explicit permission):",
    ...items.map(
      (item) =>
        `- [${item.kind}] ${item.name} · score ${item.score}/100 · ${item.license} · ${item.url}`,
    ),
  ].join("\n");
}

export function startResourceCatalogScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void refreshResourceCatalog().catch(() => {
    // The persisted catalog remains available when the network is offline.
  });
  const timer = setInterval(
    () => {
      void refreshResourceCatalog().catch(() => {
        // Retry on the next bounded interval.
      });
    },
    60 * 60 * 1000,
  );
  timer.unref();
}

/** Test-only helper for isolated catalog fixtures. */
export function resetResourceCatalogForTests(): void {
  refreshInFlight = null;
  if (existsSync(RESOURCE_CATALOG_FILE)) unlinkSync(RESOURCE_CATALOG_FILE);
}
