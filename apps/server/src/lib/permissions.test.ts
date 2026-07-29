// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("permission gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("persists an explicit denial and never treats it as allowed", async () => {
    const permissions = await import("./permissions.js");
    const created = permissions.requestPermission({
      projectId: "project-a",
      operationId: "operation-a",
      kind: "spend_heavy",
    });
    expect(created.request.status).toBe("pending");
    const resolved = permissions.resolvePermission(created.request.id, "deny");
    expect(resolved.ok).toBe(true);
    expect(permissions.getPermission(created.request.id)?.status).toBe(
      "denied",
    );
    expect(permissions.listPending("project-a")).toHaveLength(0);
  });

  it("never grants project-session trust to critical actions", async () => {
    const permissions = await import("./permissions.js");
    const created = permissions.requestPermission({
      projectId: "project-b",
      kind: "deploy_production",
    });
    expect(
      permissions.resolvePermission(created.request.id, "allow_project_session")
        .ok,
    ).toBe(false);
    expect(permissions.getPermission(created.request.id)?.status).toBe(
      "pending",
    );
  });

  it("expires pending requests", async () => {
    const permissions = await import("./permissions.js");
    const created = permissions.requestPermission({
      projectId: "project-c",
      kind: "spend_heavy",
      expiresInMs: -1,
    });
    permissions.expirePermissions();
    expect(permissions.getPermission(created.request.id)?.status).toBe(
      "expired",
    );
  });

  it("deduplicates a pending request for the same operation", async () => {
    const permissions = await import("./permissions.js");
    const input = {
      projectId: "project-d",
      operationId: "operation-d",
      kind: "spend_heavy" as const,
    };
    const first = permissions.requestPermission(input);
    const second = permissions.requestPermission(input);
    expect(second.request.id).toBe(first.request.id);
    expect(second.autoApproved).toBe(false);
  });

  it("scopes session trust to a project and safe permission kind", async () => {
    const permissions = await import("./permissions.js");
    const first = permissions.requestPermission({
      projectId: "trusted-project",
      kind: "spend_heavy",
    });
    expect(
      permissions.resolvePermission(first.request.id, "allow_project_session")
        .ok,
    ).toBe(true);
    expect(
      permissions.requestPermission({
        projectId: "trusted-project",
        kind: "spend_heavy",
      }).autoApproved,
    ).toBe(true);
    expect(
      permissions.requestPermission({
        projectId: "different-project",
        kind: "spend_heavy",
      }).autoApproved,
    ).toBe(false);
  });

  it("consumes an allow-once permission exactly once", async () => {
    const permissions = await import("./permissions.js");
    const created = permissions.requestPermission({
      projectId: "share-project",
      kind: "deploy_production",
    });
    expect(
      permissions.resolvePermission(created.request.id, "allow_once").ok,
    ).toBe(true);
    const input = {
      id: created.request.id,
      projectId: "share-project",
      kind: "deploy_production" as const,
    };
    expect(permissions.consumePermission(input)).toBe(true);
    expect(permissions.consumePermission(input)).toBe(false);
    expect(permissions.consumePermission({ ...input, id: "missing" })).toBe(
      false,
    );
  });

  it("rejects missing, already resolved, and directly expired requests", async () => {
    const permissions = await import("./permissions.js");
    expect(permissions.resolvePermission("missing", "deny").ok).toBe(false);
    const denied = permissions.requestPermission({
      projectId: "resolved-project",
      kind: "open_external",
    });
    expect(permissions.resolvePermission(denied.request.id, "deny").ok).toBe(
      true,
    );
    expect(permissions.resolvePermission(denied.request.id, "deny").ok).toBe(
      false,
    );
    const expired = permissions.requestPermission({
      projectId: "direct-expiry",
      kind: "open_external",
      expiresInMs: -1,
    });
    expect(
      permissions.resolvePermission(expired.request.id, "allow_once").ok,
    ).toBe(false);
  });
});
