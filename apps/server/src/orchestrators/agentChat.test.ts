// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@la-agencia/shared";
import { chatWithLeader, completeUserTodo } from "./agentChat.js";
import { loadSettings, saveSettings } from "../lib/store.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LA_AGENCIA_API_KEY;
});

function enableApiChat(): void {
  const current = loadSettings();
  process.env.LA_AGENCIA_API_KEY = "test-api-key";
  saveSettings({
    ...current,
    introLevel: "guided",
    primaryAdapter: null,
    enabledAdapters: [],
    llm: {
      provider: "openai",
      model: "fixture",
      apiKey: undefined,
    },
  });
}

function project(): Project {
  const workspacePath = mkdtempSync(join(tmpdir(), "agency-chat-"));
  mkdirSync(join(workspacePath, ".agency"), { recursive: true });
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `chat-${Date.now()}-${Math.random()}`,
    name: "Chat project",
    slug: "chat-project",
    status: "setup",
    workspacePath,
    source: "new",
    brief: {
      goals: [],
      users: [],
      mustHaves: [],
      outOfScope: [],
      constraints: [],
      rawNotes: "",
    },
    hiredAgentIds: [],
    floorLeaders: ["pau", "ana"],
    sprints: [],
    epics: [],
    userTodos: [],
    messages: [],
    primaryAdapter: null,
    locale: "es",
    busyAgentIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("leader chat", () => {
  it("persists an offline guided conversation without invoking a provider", async () => {
    const input = project();
    const result = await chatWithLeader(
      input,
      "pau",
      "Quiero construir una aplicación para mi negocio",
    );
    expect(result.reply).toContain("Pau");
    expect(result.project.messages).toHaveLength(2);
    expect(result.project.status).toBe("briefing");
    expect(result.project.busyAgentIds).toEqual([]);
  });

  it("creates unique manual account tasks and completes explicit confirmations", async () => {
    const input = project();
    await chatWithLeader(
      input,
      "ana",
      "Necesito cuentas de AWS, GitHub, Railway y Stripe para pagos",
    );
    expect(input.userTodos?.map((todo) => todo.title)).toEqual([
      "Crear cuenta AWS",
      "Crear cuenta GitHub",
      "Crear cuenta Railway",
      "Crear cuenta Stripe",
    ]);
    await chatWithLeader(input, "ana", "AWS listo");
    expect(
      input.userTodos?.find((todo) => todo.title === "Crear cuenta AWS")
        ?.status,
    ).toBe("done");
    expect(input.userTodos).toHaveLength(4);
  });

  it("completes a selected todo and rejects unknown ids", async () => {
    const input = project();
    input.userTodos = [
      {
        id: "todo-1",
        title: "Crear cuenta",
        detail: "Manual",
        steps: ["Crear"],
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];
    await expect(completeUserTodo(input, "missing")).rejects.toThrow(
      "Todo no encontrado",
    );
    const updated = await completeUserTodo(input, "todo-1");
    expect(updated.userTodos?.[0].status).toBe("done");
    expect(updated.messages.at(-1)?.agentId).toBe("ana");
  });

  it("uses the advanced API path while tracking busy state and usage", async () => {
    enableApiChat();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "A verified model reply." } }],
            }),
          ),
      ),
    );
    const input = project();
    input.locale = "en";
    const result = await chatWithLeader(
      input,
      "alex",
      "Please explain the next delivery.",
    );
    expect(result.reply).toBe("A verified model reply.");
    expect(result.project.busyAgentIds).toEqual([]);
  });

  it("persists a guided failure without leaving the leader busy", async () => {
    enableApiChat();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider down", { status: 503 })),
    );
    const input = project();
    const result = await chatWithLeader(
      input,
      "unknown-leader",
      "Try a failing provider call.",
    );
    expect(result.reply).toContain("no pude usar tu suscripción");
    expect(result.project.busyAgentIds).toEqual([]);
    expect(result.project.messages.at(-1)?.content).toContain("503");
  });
});
