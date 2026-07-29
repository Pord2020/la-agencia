// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogPromptBlock,
  refreshResourceCatalog,
  resetResourceCatalogForTests,
  searchResourceCatalog,
} from "./resourceCatalog.js";

function repository(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    full_name: "example/useful",
    html_url: "https://github.com/example/useful",
    description: "A useful testing framework",
    stargazers_count: 20_000,
    forks_count: 1_000,
    archived: false,
    fork: false,
    pushed_at: new Date().toISOString(),
    language: "TypeScript",
    topics: ["testing"],
    license: { spdx_id: "MIT" },
    default_branch: "main",
    ...overrides,
  };
}

function okJson(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function catalogFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/search/repositories")) {
      return okJson({
        items: [
          repository(),
          repository({
            full_name: "example/gpl",
            html_url: "https://github.com/example/gpl",
            license: { spdx_id: "GPL-3.0" },
          }),
          repository({
            full_name: "example/archived",
            html_url: "https://github.com/example/archived",
            archived: true,
          }),
        ],
      });
    }
    if (url.includes("/repos/Shubhamsaboo/awesome-llm-apps/git/trees/main")) {
      return okJson({
        truncated: false,
        tree: [
          {
            path: "agent_skills/advisor-orchestrator-worker/SKILL.md",
            type: "blob",
          },
          {
            path: "agent_skills/commit-archaeologist/SKILL.md",
            type: "blob",
          },
          {
            path: "agent_skills/project-graveyard/SKILL.md",
            type: "blob",
          },
          {
            path: "agent_skills/scope-creep-detector/SKILL.md",
            type: "blob",
          },
          {
            path: "agent_skills/self-improving-agent-skills/SKILL.md",
            type: "blob",
          },
          {
            path: "agent_skills/thinking-out-loud/SKILL.md",
            type: "blob",
          },
          { path: "starter_ai_agents/ai_travel_agent", type: "tree" },
          {
            path: "starter_ai_agents/ai_travel_agent/README.md",
            type: "blob",
          },
          {
            path: "advanced_ai_agents/multi_agent_apps/ai_system/README.md",
            type: "blob",
          },
          {
            path: "generative_ui_agents/stock_agent/frontend/README.md",
            type: "blob",
          },
          { path: "agent_skills/evals/SKILL.md", type: "blob" },
        ],
      });
    }
    if (
      url.includes("/repos/openai/skills/git/trees/main") ||
      url.includes("/repos/anthropics/skills/git/trees/main")
    ) {
      return okJson({
        truncated: false,
        tree: [{ path: "skills/code-review/SKILL.md", type: "blob" }],
      });
    }
    if (url.includes("/repos/openai/skills")) {
      return okJson(
        repository({
          full_name: "openai/skills",
          html_url: "https://github.com/openai/skills",
        }),
      );
    }
    if (url.includes("/repos/anthropics/skills")) {
      return okJson(
        repository({
          full_name: "anthropics/skills",
          html_url: "https://github.com/anthropics/skills",
        }),
      );
    }
    if (url.includes("/repos/Shubhamsaboo/awesome-llm-apps")) {
      return okJson(
        repository({
          full_name: "Shubhamsaboo/awesome-llm-apps",
          html_url: "https://github.com/Shubhamsaboo/awesome-llm-apps",
          description: "A curated collection of LLM apps and AI agents",
          stargazers_count: 128_000,
          forks_count: 18_000,
          license: { spdx_id: "Apache-2.0" },
          language: "Python",
          topics: ["ai-agents", "llm"],
        }),
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("resource catalog", () => {
  beforeEach(() => {
    resetResourceCatalogForTests();
  });

  it("indexes repositories, all curated skills and usable agent templates without executable content", async () => {
    const snapshot = await refreshResourceCatalog({
      force: true,
      fetchImpl: catalogFetch(),
    });

    expect(snapshot.errors).toEqual([]);
    expect(
      snapshot.items.some((item) => item.id === "repository:example/useful"),
    ).toBe(true);
    expect(
      snapshot.items.some((item) => item.id === "repository:example/gpl"),
    ).toBe(false);
    expect(
      snapshot.items.some((item) => item.id === "repository:example/archived"),
    ).toBe(false);

    const skills = searchResourceCatalog({ kind: "skill", limit: 500 });
    expect(skills).toHaveLength(8);
    expect(
      skills.filter(
        (item) => item.repository === "Shubhamsaboo/awesome-llm-apps",
      ),
    ).toHaveLength(6);
    expect(
      skills.find((item) => item.name === "scope-creep-detector"),
    ).toMatchObject({
      trust: "verified",
      license: "Apache-2.0",
      riskFlags: ["not-installed", "repository-read"],
    });
    expect(skills.every((item) => !item.url.endsWith("SKILL.md"))).toBe(true);

    const agents = searchResourceCatalog({ kind: "agent", limit: 500 });
    expect(agents.map((item) => item.resourcePath)).toEqual([
      "starter_ai_agents/ai_travel_agent",
      "advanced_ai_agents/multi_agent_apps/ai_system",
    ]);
    expect(
      agents.every(
        (item) =>
          item.trust === "verified" &&
          item.riskFlags.includes("template-only") &&
          item.riskFlags.includes("review-code-before-use"),
      ),
    ).toBe(true);
    expect(
      agents.some((item) => item.resourcePath?.includes("/frontend")),
    ).toBe(false);
    expect(catalogPromptBlock("testing")).toContain("metadata only");
    expect(catalogPromptBlock("definitely-no-such-resource")).toBe("");
    expect(
      searchResourceCatalog({
        query: "testing TypeScript",
        category: "web",
        limit: 1,
      }),
    ).toHaveLength(1);
    expect(searchResourceCatalog({ limit: -10 })).toHaveLength(1);
    expect(searchResourceCatalog({ limit: 10_000 }).length).toBeGreaterThan(1);

    const fresh = await refreshResourceCatalog({
      fetchImpl: catalogFetch(),
    });
    expect(fresh.refreshedAt).toBe(snapshot.refreshedAt);
    const throttled = await refreshResourceCatalog({
      force: true,
      fetchImpl: catalogFetch(),
    });
    expect(throttled.lastAttemptAt).toBe(snapshot.lastAttemptAt);
  });

  it("rejects malformed GitHub payloads and keeps safe fallback metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      okJson({ items: [{ full_name: "../../../../etc/passwd" }] }),
    ) as typeof fetch;

    const snapshot = await refreshResourceCatalog({
      force: true,
      fetchImpl,
    });

    expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.items.every((item) => item.kind === "repository")).toBe(
      true,
    );
    expect(
      snapshot.items.some(
        (item) =>
          item.repository === "Shubhamsaboo/awesome-llm-apps" &&
          item.trust === "verified",
      ),
    ).toBe(true);
  });
});
