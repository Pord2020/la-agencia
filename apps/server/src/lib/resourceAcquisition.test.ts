// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ResourceCatalogItem } from "@la-agencia/shared";
import {
  activateResourceInstallation,
  acquireCatalogResource,
  listResourceInstallations,
  removeResourceInstallation,
} from "./resourceAcquisition.js";

const COMMIT = "a".repeat(40);

function okJson(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function item(
  overrides: Partial<ResourceCatalogItem> = {},
): ResourceCatalogItem {
  return {
    id: "agent:example/repo:agents/safe",
    kind: "agent",
    name: "Safe agent",
    description: "Fixture",
    url: "https://github.com/example/repo/tree/main/agents/safe",
    repository: "example/repo",
    repositoryUrl: "https://github.com/example/repo",
    source: "github-curated:example/repo",
    category: "agent",
    trust: "verified",
    score: 90,
    stars: 100,
    forks: 10,
    license: "Apache-2.0",
    topics: ["agent-template"],
    resourcePath: "agents/safe",
    indexedAt: new Date().toISOString(),
    riskFlags: ["not-installed", "review-code-before-use"],
    ...overrides,
  };
}

function githubFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/commits/")) {
      return new Response(JSON.stringify({ sha: COMMIT }));
    }
    return new Response(JSON.stringify({ default_branch: "main" }));
  }) as typeof fetch;
}

describe("resource acquisition", () => {
  it("blocks unknown licenses and self-modifying resources before network use", async () => {
    const fetchImpl = githubFetch();
    await expect(
      acquireCatalogResource({
        item: item({ license: "CHECK_SOURCE" }),
        projectId: "blocked-license",
        fetchImpl,
      }),
    ).rejects.toThrow("RESOURCE_LICENSE_NOT_ALLOWED");
    await expect(
      acquireCatalogResource({
        item: item({ riskFlags: ["self-modifying"] }),
        projectId: "blocked-self-modifying",
        fetchImpl,
      }),
    ).rejects.toThrow("SELF_MODIFYING_RESOURCE_BLOCKED");
    await expect(
      acquireCatalogResource({
        item: item({ kind: "repository" }),
        projectId: "blocked-repository",
        fetchImpl,
      }),
    ).rejects.toThrow("RESOURCE_NOT_ACQUIRABLE");
    await expect(
      acquireCatalogResource({
        item: item({ resourcePath: undefined }),
        projectId: "blocked-path",
        fetchImpl,
      }),
    ).rejects.toThrow("RESOURCE_NOT_ACQUIRABLE");
    await expect(
      acquireCatalogResource({
        item: item({ trust: "community" }),
        projectId: "blocked-community",
        fetchImpl,
      }),
    ).rejects.toThrow("RESOURCE_NOT_ACQUIRABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pins, scans, hashes, installs read-only and removes recoverably", async () => {
    const projectId = `acquisition-${Date.now()}`;
    const gitRunner = vi.fn(
      async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (args.includes("clone")) {
          const cloneDirectory = args.at(-1)!;
          const selected = join(cloneDirectory, "agents", "safe");
          mkdirSync(selected, { recursive: true });
          writeFileSync(join(selected, "SKILL.md"), "# Safe skill\n");
          return { stdout: "", stderr: "" };
        }
        return { stdout: `${COMMIT}\n`, stderr: "" };
      },
    );

    const installation = await acquireCatalogResource({
      item: item(),
      projectId,
      fetchImpl: githubFetch(),
      gitRunner,
    });

    expect(installation).toMatchObject({
      projectId,
      commit: COMMIT,
      license: "Apache-2.0",
      status: "active",
      fileCount: 1,
    });
    expect(installation.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(listResourceInstallations(projectId)).toEqual([installation]);

    const removed = removeResourceInstallation(installation.id, projectId);
    expect(removed?.status).toBe("removed");
    expect(removeResourceInstallation(installation.id, projectId)).toBeNull();
  });

  it("rejects secrets discovered in the selected resource", async () => {
    const gitRunner = vi.fn(
      async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (args.includes("clone")) {
          const selected = join(args.at(-1)!, "agents", "safe");
          mkdirSync(selected, { recursive: true });
          writeFileSync(
            join(selected, "leaked.txt"),
            "-----BEGIN PRIVATE KEY-----\n",
          );
          return { stdout: "", stderr: "" };
        }
        return { stdout: `${COMMIT}\n`, stderr: "" };
      },
    );
    await expect(
      acquireCatalogResource({
        item: item(),
        projectId: "secret-project",
        fetchImpl: githubFetch(),
        gitRunner,
      }),
    ).rejects.toThrow("POTENTIAL_SECRET");
  });

  it("rejects malformed GitHub responses and a moving default branch", async () => {
    await expect(
      acquireCatalogResource({
        item: item(),
        projectId: "github-error",
        fetchImpl: vi.fn(
          async () => new Response("unavailable", { status: 503 }),
        ) as typeof fetch,
      }),
    ).rejects.toThrow("GITHUB_503");
    await expect(
      acquireCatalogResource({
        item: item(),
        projectId: "github-json",
        fetchImpl: vi.fn(async () => new Response("{")) as typeof fetch,
      }),
    ).rejects.toThrow("GITHUB_INVALID_JSON");
    await expect(
      acquireCatalogResource({
        item: item(),
        projectId: "github-schema",
        fetchImpl: vi.fn(async () =>
          okJson({ unexpected: true }),
        ) as typeof fetch,
      }),
    ).rejects.toThrow("GITHUB_SCHEMA_MISMATCH");

    const gitRunner = vi.fn(
      async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (args.includes("clone")) {
          const selected = join(args.at(-1)!, "agents", "safe");
          mkdirSync(selected, { recursive: true });
          writeFileSync(join(selected, "SKILL.md"), "# Safe\n");
          return { stdout: "", stderr: "" };
        }
        return { stdout: `${"f".repeat(40)}\n`, stderr: "" };
      },
    );
    await expect(
      acquireCatalogResource({
        item: item(),
        projectId: "commit-race",
        fetchImpl: githubFetch(),
        gitRunner,
      }),
    ).rejects.toThrow("COMMIT_RACE_DETECTED");
  });

  it("rejects symlinks, nested runtimes and denied license files", async () => {
    const cases: Array<{
      projectId: string;
      expected: string;
      write: (selected: string) => void;
    }> = [
      {
        projectId: "symlink-scan",
        expected: "SYMLINK_REJECTED",
        write: (selected) => {
          writeFileSync(join(selected, "target.txt"), "safe");
          symlinkSync(join(selected, "target.txt"), join(selected, "link.txt"));
        },
      },
      {
        projectId: "nested-runtime",
        expected: "NESTED_RUNTIME_REJECTED",
        write: (selected) => {
          mkdirSync(join(selected, "node_modules"), { recursive: true });
          writeFileSync(join(selected, "node_modules", "runtime.js"), "x");
        },
      },
      {
        projectId: "denied-license",
        expected: "DENIED_LICENSE",
        write: (selected) => {
          writeFileSync(join(selected, "LICENSE"), "GNU GPL-3.0");
        },
      },
    ];
    for (const fixture of cases) {
      const gitRunner = vi.fn(
        async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
          if (args.includes("clone")) {
            const selected = join(args.at(-1)!, "agents", "safe");
            mkdirSync(selected, { recursive: true });
            fixture.write(selected);
            return { stdout: "", stderr: "" };
          }
          return { stdout: `${COMMIT}\n`, stderr: "" };
        },
      );
      await expect(
        acquireCatalogResource({
          item: item(),
          projectId: fixture.projectId,
          fetchImpl: githubFetch(),
          gitRunner,
        }),
      ).rejects.toThrow(fixture.expected);
    }
  });

  it("keeps immutable versions and can reactivate a verified prior version", async () => {
    const projectId = `rollback-${Date.now()}`;
    let commit = "b".repeat(40);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.includes("/commits/")
            ? { sha: commit }
            : { default_branch: "main" },
        ),
      );
    }) as typeof fetch;
    const gitRunner = vi.fn(
      async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (args.includes("clone")) {
          const selected = join(args.at(-1)!, "agents", "safe");
          mkdirSync(selected, { recursive: true });
          writeFileSync(join(selected, "SKILL.md"), `# ${commit}\n`);
          return { stdout: "", stderr: "" };
        }
        return { stdout: `${commit}\n`, stderr: "" };
      },
    );

    const first = await acquireCatalogResource({
      item: item(),
      projectId,
      fetchImpl,
      gitRunner,
    });
    commit = "c".repeat(40);
    const second = await acquireCatalogResource({
      item: item(),
      projectId,
      fetchImpl,
      gitRunner,
    });
    expect(second.status).toBe("active");
    expect(
      listResourceInstallations(projectId).find(
        (installation) => installation.id === first.id,
      )?.status,
    ).toBe("superseded");

    const restored = activateResourceInstallation(first.id, projectId);
    expect(restored?.status).toBe("active");
    expect(
      listResourceInstallations(projectId).find(
        (installation) => installation.id === second.id,
      )?.status,
    ).toBe("superseded");
  });
});
