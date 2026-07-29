// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { app, bootstrapToken } from "./app.js";
import { createSprintOperation, getOperation } from "./lib/operations.js";
import { requestPermission } from "./lib/permissions.js";

async function sessionCookie(): Promise<string> {
  const response = await app.request("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ token: bootstrapToken() }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function authenticated(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      Cookie: cookie,
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function configureTestWorkspace(
  cookie: string,
  workspacesRoot: string,
): Promise<void> {
  const response = await authenticated("/api/settings", cookie, {
    method: "PUT",
    body: JSON.stringify({
      primaryAdapter: "codex",
      enabledAdapters: ["codex"],
      workspacesRoot,
    }),
  });
  expect(response.status).toBe(200);
}

async function createImportedProject(
  cookie: string,
  workspace: string,
): Promise<{
  id: string;
  workspacePath: string;
  sprints: Array<{ id: string }>;
}> {
  const response = await authenticated("/api/projects", cookie, {
    method: "POST",
    body: JSON.stringify({
      name: "Integration fixture",
      mode: "import",
      importPath: workspace,
    }),
  });
  expect(response.status).toBe(201);
  return response.json();
}

describe("local API security", () => {
  it("serves restrictive browser security headers", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects authenticated endpoints without a session", async () => {
    const response = await app.request("/api/settings");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects untrusted browser origins even with a session", async () => {
    const cookie = await sessionCookie();
    const response = await app.request("/api/settings", {
      headers: { Cookie: cookie, Origin: "https://attacker.example" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects an untrusted origin while establishing a session", async () => {
    const response = await app.request("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ token: bootstrapToken() }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ORIGIN_DENIED" });
  });

  it("validates catalog filters and serves a metadata-only catalog", async () => {
    const cookie = await sessionCookie();
    const invalid = await app.request("/api/catalog?kind=executable", {
      headers: { Cookie: cookie, Origin: "http://localhost:5173" },
    });
    expect(invalid.status).toBe(400);

    const response = await app.request("/api/catalog?limit=10", {
      headers: { Cookie: cookie, Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(200);
    const catalog = (await response.json()) as {
      items: Array<{ kind: string; riskFlags: string[] }>;
    };
    expect(catalog.items.length).toBeGreaterThan(0);
    expect(
      catalog.items.every((item) =>
        ["repository", "agent", "skill"].includes(item.kind),
      ),
    ).toBe(true);
  });

  it("denial cancels the linked operation before it can be queued", async () => {
    const cookie = await sessionCookie();
    const operation = createSprintOperation({
      projectId: "security-project",
      sprintId: "security-sprint",
      idempotencyKey: "security-denial",
    }).operation;
    const permission = requestPermission({
      projectId: operation.projectId,
      operationId: operation.id,
      kind: "spend_heavy",
    }).request;
    const response = await app.request(
      `/api/permissions/${permission.id}/resolve`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: "deny" }),
      },
    );
    expect(response.status).toBe(200);
    expect(getOperation(operation.id)?.status).toBe("cancelled");
  });

  it("runs one approved operation exactly once and preserves QA evidence", async () => {
    const cookie = await sessionCookie();
    const root = mkdtempSync(join(tmpdir(), "agency-integration-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "integration",
        scripts: {
          typecheck: "node -e \"console.log('typecheck ok')\"",
          build: "node -e \"console.log('build ok')\"",
        },
      }),
    );
    await configureTestWorkspace(
      cookie,
      mkdtempSync(join(tmpdir(), "agency-workspaces-")),
    );
    const project = await createImportedProject(cookie, root);

    const planned = await authenticated(
      `/api/projects/${project.id}/sprints/plan`,
      cookie,
      { method: "POST", body: JSON.stringify({ goal: "Ship fixture" }) },
    );
    expect(planned.status).toBe(200);
    const sprint = (await planned.json()) as { sprint: { id: string } };
    const runPath = `/api/projects/${project.id}/sprints/${sprint.sprint.id}/run`;
    const first = await authenticated(runPath, cookie, {
      method: "POST",
      headers: { "Idempotency-Key": "exactly-once" },
      body: "{}",
    });
    const second = await authenticated(runPath, cookie, {
      method: "POST",
      headers: { "Idempotency-Key": "exactly-once" },
      body: "{}",
    });
    const firstOperation = (await first.json()) as {
      operation: { id: string; permissionRequestId: string };
    };
    const secondOperation = (await second.json()) as {
      operation: { id: string };
    };
    expect(secondOperation.operation.id).toBe(firstOperation.operation.id);

    const allowed = await authenticated(
      `/api/permissions/${firstOperation.operation.permissionRequestId}/resolve`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({ decision: "allow_once" }),
      },
    );
    expect(allowed.status).toBe(200);
    const replay = await authenticated(
      `/api/permissions/${firstOperation.operation.permissionRequestId}/resolve`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({ decision: "allow_once" }),
      },
    );
    expect(replay.status).toBe(409);

    let status = "";
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const response = await authenticated(
        `/api/operations/${firstOperation.operation.id}`,
        cookie,
      );
      const payload = (await response.json()) as {
        operation: { status: string };
      };
      status = payload.operation.status;
      if (["review", "blocked", "failed"].includes(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(status).toBe("review");
    expect(existsSync(join(root, "la-agencia-fake-delivery.txt"))).toBe(true);
    const saved = await authenticated(`/api/projects/${project.id}`, cookie);
    const savedProject = (await saved.json()) as {
      sprints: Array<{
        tasks: Array<{ ownerAgentId: string; evidence?: unknown[] }>;
      }>;
    };
    const qa = savedProject.sprints[0].tasks.find((task) =>
      task.ownerAgentId.includes("qa"),
    );
    expect(qa?.evidence?.length).toBeGreaterThan(0);
    const changeRequest = await authenticated(
      `/api/projects/${project.id}/sprints/${sprint.sprint.id}/feedback`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "request_changes",
          comment: "Ajustar una etiqueta",
        }),
      },
    );
    expect(changeRequest.status).toBe(200);
    const approval = await authenticated(
      `/api/projects/${project.id}/sprints/${sprint.sprint.id}/feedback`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "approve",
          comment: "Aprobado explícitamente",
        }),
      },
    );
    expect(approval.status).toBe(200);
    const cost = await authenticated("/api/cost/today", cookie);
    expect((await cost.json()) as { samples: number }).toMatchObject({
      samples: expect.any(Number),
    });
  }, 15_000);

  it("denied sprint and unapproved sharing start no work or tunnel", async () => {
    const cookie = await sessionCookie();
    await configureTestWorkspace(
      cookie,
      mkdtempSync(join(tmpdir(), "agency-denied-workspaces-")),
    );
    const root = mkdtempSync(join(tmpdir(), "agency-denied-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "denied",
        scripts: { build: 'node -e "process.exit(0)"' },
      }),
    );
    const project = await createImportedProject(cookie, root);
    const planned = await authenticated(
      `/api/projects/${project.id}/sprints/plan`,
      cookie,
      { method: "POST", body: JSON.stringify({ goal: "Must not run" }) },
    );
    const sprint = (await planned.json()) as { sprint: { id: string } };
    const run = await authenticated(
      `/api/projects/${project.id}/sprints/${sprint.sprint.id}/run`,
      cookie,
      {
        method: "POST",
        headers: { "Idempotency-Key": "denied-no-process" },
        body: "{}",
      },
    );
    const operation = (await run.json()) as {
      operation: { id: string; permissionRequestId: string };
    };
    await authenticated(
      `/api/permissions/${operation.operation.permissionRequestId}/resolve`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({ decision: "deny" }),
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(join(root, "la-agencia-fake-delivery.txt"))).toBe(false);
    expect(getOperation(operation.operation.id)?.status).toBe("cancelled");

    const share = await authenticated(
      `/api/projects/${project.id}/preview/share`,
      cookie,
      { method: "POST", body: JSON.stringify({ ttlMinutes: 5 }) },
    );
    expect(share.status).toBe(202);
    const preview = await authenticated(
      `/api/projects/${project.id}/preview`,
      cookie,
    );
    expect(await preview.json()).toMatchObject({ preview: null });
  });

  it("rejects malicious paths, payloads and client-controlled ports", async () => {
    const cookie = await sessionCookie();
    const file = join(
      mkdtempSync(join(tmpdir(), "agency-invalid-")),
      "not-a-directory",
    );
    writeFileSync(file, "x");
    const symlink = join(
      mkdtempSync(join(tmpdir(), "agency-symlink-")),
      "home-link",
    );
    symlinkSync(homedir(), symlink);

    for (const importPath of ["/", homedir(), file, symlink, "relative"]) {
      const response = await authenticated("/api/projects", cookie, {
        method: "POST",
        body: JSON.stringify({
          name: "Unsafe",
          mode: "import",
          importPath,
        }),
      });
      expect(response.status).toBe(400);
    }
    const oversized = await authenticated("/api/projects", cookie, {
      method: "POST",
      body: JSON.stringify({ name: "x".repeat(300_000) }),
    });
    expect(oversized.status).toBe(413);
    const safeRoot = mkdtempSync(join(tmpdir(), "agency-port-"));
    writeFileSync(
      join(safeRoot, "package.json"),
      JSON.stringify({ name: "p" }),
    );
    const project = await createImportedProject(cookie, safeRoot);
    const arbitraryPort = await authenticated(
      `/api/projects/${project.id}/preview`,
      cookie,
      { method: "POST", body: JSON.stringify({ port: 22 }) },
    );
    expect(arbitraryPort.status).toBe(400);
  });

  it("serves the complete stable v0.4 API and rejects hidden roadmap features", async () => {
    const cookie = await sessionCookie();
    const workspacesRoot = mkdtempSync(
      join(tmpdir(), "agency-contract-workspaces-"),
    );
    await configureTestWorkspace(cookie, workspacesRoot);

    for (const path of [
      "/api/status",
      "/api/settings",
      "/api/adapters/meta",
      "/api/agents",
      "/api/agents?type=specialist",
      "/api/agents/product-owner",
      "/api/catalog?kind=skill&limit=3",
      "/api/catalog/status",
      "/api/resource-installations",
      "/api/projects",
      "/api/leaders",
      "/api/offices",
      "/api/cost/today",
      "/api/permissions",
      "/api/operations",
      "/api/harnesses",
      "/api/orchestrators",
    ]) {
      const response = await authenticated(path, cookie);
      expect(response.status, path).toBe(200);
    }

    const invalidSettings = await authenticated("/api/settings", cookie, {
      method: "PUT",
      body: JSON.stringify({ harness: "ralph-loop" }),
    });
    expect(invalidSettings.status).toBe(400);
    const invalidAdapter = await authenticated(
      "/api/adapters/not-real/usage",
      cookie,
    );
    expect(invalidAdapter.status).toBe(400);
    const invalidLogin = await authenticated(
      "/api/adapters/not-real/login",
      cookie,
      { method: "POST", body: "{}" },
    );
    expect(invalidLogin.status).toBe(400);
    expect((await authenticated("/api/agents/not-real", cookie)).status).toBe(
      404,
    );

    const createdResponse = await authenticated("/api/projects", cookie, {
      method: "POST",
      body: JSON.stringify({ name: "Árbol de Prueba", mode: "new" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      workspacePath: string;
    };
    expect(existsSync(join(created.workspacePath, "README.md"))).toBe(true);

    const projectPaths = [
      `/api/projects/${created.id}`,
      `/api/projects/${created.id}/queue`,
      `/api/projects/${created.id}/preview`,
      `/api/projects/${created.id}/triggers`,
    ];
    expect((await authenticated(projectPaths[0], cookie)).status).toBe(200);
    expect((await authenticated(projectPaths[1], cookie)).status).toBe(200);
    expect((await authenticated(projectPaths[2], cookie)).status).toBe(200);
    expect((await authenticated(projectPaths[3], cookie)).status).toBe(410);
    expect(
      (
        await authenticated(`/api/projects/${created.id}/triggers`, cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(410);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/triggers/example/fire`,
          cookie,
          { method: "POST", body: "{}" },
        )
      ).status,
    ).toBe(410);
    expect((await authenticated("/api/mcp", cookie)).status).toBe(410);
    expect(
      (
        await authenticated("/api/mcp/example/toggle", cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(410);

    const chat = await authenticated(
      `/api/projects/${created.id}/chat`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          message: "Necesito una aplicación bilingüe para mi negocio",
          leaderId: "pau",
        }),
      },
    );
    expect(chat.status).toBe(200);
    expect(
      (
        await authenticated(`/api/projects/${created.id}/chat`, cookie, {
          method: "POST",
          body: JSON.stringify({ message: "" }),
        })
      ).status,
    ).toBe(400);

    const hired = await authenticated(
      `/api/projects/${created.id}/hire`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          agentIds: ["frontend-core", "not-a-real-agent"],
        }),
      },
    );
    expect(hired.status).toBe(200);
    expect(
      (
        await authenticated(`/api/projects/${created.id}/hire`, cookie, {
          method: "POST",
          body: JSON.stringify({ agentIds: "invalid" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/todos/missing/complete`,
          cookie,
          { method: "POST", body: "{}" },
        )
      ).status,
    ).toBe(400);

    const officeResponse = await authenticated("/api/offices", cookie, {
      method: "POST",
      body: JSON.stringify({
        name: "Equipo",
        projectId: created.id,
        adapterId: "codex",
      }),
    });
    expect(officeResponse.status).toBe(201);
    const office = (await officeResponse.json()) as { id: string };
    expect(
      (
        await authenticated(`/api/offices/${office.id}`, cookie, {
          method: "PATCH",
          body: JSON.stringify({ name: "Equipo actualizado" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await authenticated("/api/offices/missing", cookie, {
          method: "PATCH",
          body: "{}",
        })
      ).status,
    ).toBe(404);

    expect(
      (await authenticated("/api/operations/missing", cookie)).status,
    ).toBe(404);
    expect(
      (
        await authenticated("/api/operations/missing/cancel", cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/sprints/missing/run`,
          cookie,
          { method: "POST", body: "{}" },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/sprints/missing/feedback`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({ decision: "ok" }),
          },
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await authenticated(`/api/projects/${created.id}/preview`, cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated(`/api/projects/${created.id}/preview`, cookie, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/preview/share`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({ ttlMinutes: 1 }),
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated(
          `/api/projects/${created.id}/preview/share`,
          cookie,
          { method: "DELETE" },
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await authenticated("/api/catalog/install", cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated("/api/resource-installations/remove", cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated("/api/resource-installations/activate", cookie, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect((await authenticated("/api/does-not-exist", cookie)).status).toBe(
      404,
    );
  }, 45_000);

  it("returns stable errors for every invalid stable-API decision boundary", async () => {
    const invalidSession = await app.request("/api/session", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "short" }),
    });
    expect(await invalidSession.json()).toMatchObject({
      code: "INVALID_REQUEST",
    });
    const wrongSession = await app.request("/api/session", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "x".repeat(32) }),
    });
    expect(await wrongSession.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const cookie = await sessionCookie();
    const workspacesRoot = mkdtempSync(
      join(tmpdir(), "agency-errors-workspaces-"),
    );
    const completeSettings = await authenticated("/api/settings", cookie, {
      method: "PUT",
      body: JSON.stringify({
        introLevel: "advanced",
        orchestrator: "po-techlead",
        harness: "consultancy",
        primaryAdapter: null,
        enabledAdapters: [],
        workspacesRoot,
        llm: {
          provider: "custom",
          model: "fixture-model",
          baseUrl: "https://models.example.test/v1",
        },
        usage: {
          warnAt: 0.7,
          blockHeavyAt: 0.9,
          pollMinutes: 15,
          cursorHoursLimit: 100,
          cursorHoursUsed: 20,
        },
        modelsByTier: {
          cheap: "cheap",
          medium: "medium",
          high: "high",
        },
      }),
    });
    expect(completeSettings.status).toBe(200);
    expect(
      (await authenticated("/api/adapters/cursor/usage", cookie)).status,
    ).toBe(200);

    const workspace = mkdtempSync(join(tmpdir(), "agency-errors-project-"));
    const project = await createImportedProject(cookie, workspace);
    const missingProjectRoutes: Array<[string, RequestInit?]> = [
      ["/api/projects/missing"],
      ["/api/projects/missing/queue"],
      ["/api/projects/missing/preview"],
      ["/api/projects/missing/chat", { method: "POST", body: "{}" }],
      ["/api/projects/missing/hire", { method: "POST", body: "{}" }],
      ["/api/projects/missing/sprints/plan", { method: "POST", body: "{}" }],
      [
        "/api/projects/missing/sprints/missing/run",
        { method: "POST", body: "{}" },
      ],
      [
        "/api/projects/missing/sprints/missing/feedback",
        { method: "POST", body: "{}" },
      ],
      ["/api/projects/missing/preview/share", { method: "POST", body: "{}" }],
    ];
    for (const [path, init] of missingProjectRoutes) {
      expect((await authenticated(path, cookie, init)).status, path).toBe(404);
    }

    expect(
      (
        await authenticated(
          `/api/projects/${project.id}/sprints/plan`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({ goal: "", unknown: true }),
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated(
          `/api/projects/${project.id}/sprints/missing/feedback`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({ decision: "approve", comment: "" }),
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated(
          `/api/projects/${project.id}/preview/share`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({
              permissionRequestId: "missing",
              ttlMinutes: 30,
            }),
          },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await authenticated("/api/permissions/missing/resolve", cookie, {
          method: "POST",
          body: JSON.stringify({ decision: "ok" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await authenticated("/api/permissions/missing/resolve", cookie, {
          method: "POST",
          body: JSON.stringify({ decision: "allow_once" }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await authenticated("/api/offices", cookie, {
          method: "POST",
          body: JSON.stringify({ unknown: true }),
        })
      ).status,
    ).toBe(400);
    const offices = await authenticated("/api/offices", cookie);
    const firstOffice = (
      (await offices.json()) as {
        offices: Array<{ id: string }>;
      }
    ).offices[0];
    expect(
      (
        await authenticated(`/api/offices/${firstOffice.id}`, cookie, {
          method: "PATCH",
          body: JSON.stringify({ adapterId: "invalid" }),
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await authenticated("/api/catalog/install", cookie, {
          method: "POST",
          body: JSON.stringify({
            resourceId: "missing-resource",
            projectId: project.id,
          }),
        })
      ).status,
    ).toBe(404);
    const repositoryCatalog = await authenticated(
      "/api/catalog?kind=repository&limit=1",
      cookie,
    );
    const repositoryId = (
      (await repositoryCatalog.json()) as {
        items: Array<{ id: string }>;
      }
    ).items[0].id;
    const installRequest = await authenticated("/api/catalog/install", cookie, {
      method: "POST",
      body: JSON.stringify({
        resourceId: repositoryId,
        projectId: project.id,
      }),
    });
    expect(installRequest.status).toBe(202);
    const installPermission = (await installRequest.json()) as {
      permission: { id: string };
    };
    expect(
      (
        await authenticated("/api/catalog/install", cookie, {
          method: "POST",
          body: JSON.stringify({
            resourceId: repositoryId,
            projectId: project.id,
            permissionRequestId: installPermission.permission.id,
          }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await authenticated(
          `/api/permissions/${installPermission.permission.id}/resolve`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({ decision: "allow_once" }),
          },
        )
      ).status,
    ).toBe(200);
    const rejectedRepository = await authenticated(
      "/api/catalog/install",
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          resourceId: repositoryId,
          projectId: project.id,
          permissionRequestId: installPermission.permission.id,
        }),
      },
    );
    expect(rejectedRepository.status).toBe(400);
    expect(await rejectedRepository.json()).toMatchObject({
      code: "RESOURCE_INSTALL_FAILED",
    });

    const shareRequest = await authenticated(
      `/api/projects/${project.id}/preview/share`,
      cookie,
      { method: "POST", body: JSON.stringify({ ttlMinutes: 5 }) },
    );
    const sharePermission = (await shareRequest.json()) as {
      permission: { id: string };
    };
    expect(
      (
        await authenticated(
          `/api/projects/${project.id}/preview/share`,
          cookie,
          {
            method: "POST",
            body: JSON.stringify({
              ttlMinutes: 5,
              permissionRequestId: sharePermission.permission.id,
            }),
          },
        )
      ).status,
    ).toBe(403);
    await authenticated(
      `/api/permissions/${sharePermission.permission.id}/resolve`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({ decision: "allow_once" }),
      },
    );
    const failedShare = await authenticated(
      `/api/projects/${project.id}/preview/share`,
      cookie,
      {
        method: "POST",
        body: JSON.stringify({
          ttlMinutes: 5,
          permissionRequestId: sharePermission.permission.id,
        }),
      },
    );
    expect(failedShare.status).toBe(400);
    expect(await failedShare.json()).toMatchObject({ code: "SHARE_FAILED" });
    expect(
      (
        await authenticated("/api/resource-installations/remove", cookie, {
          method: "POST",
          body: JSON.stringify({
            installationId: "missing",
            projectId: project.id,
          }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await authenticated("/api/resource-installations/activate", cookie, {
          method: "POST",
          body: JSON.stringify({
            installationId: "missing",
            projectId: project.id,
          }),
        })
      ).status,
    ).toBe(404);
  });
});
