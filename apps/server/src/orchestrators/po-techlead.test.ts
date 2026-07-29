// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@la-agencia/shared";
import {
  applySprintFeedback,
  planSprint,
  poChat,
  runSprint,
} from "./po-techlead.js";
import { loadSettings, saveSettings } from "../lib/store.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LA_AGENCIA_API_KEY;
});

function project(options: { checks?: boolean } = {}): Project {
  const workspacePath = mkdtempSync(join(tmpdir(), "agency-po-"));
  mkdirSync(join(workspacePath, ".agency"), { recursive: true });
  if (options.checks) {
    writeFileSync(
      join(workspacePath, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node -e \"console.log('ok')\"",
          build: "node -e \"console.log('ok')\"",
        },
      }),
    );
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `po-${Date.now()}-${Math.random()}`,
    name: "PO project",
    slug: "po-project",
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
    floorLeaders: ["pau", "alex", "sam"],
    sprints: [],
    epics: [
      {
        id: "epic-1",
        title: "Primera entrega",
        order: 1,
        status: "doing",
        sprintIds: [],
      },
    ],
    userTodos: [],
    messages: [],
    primaryAdapter: null,
    locale: "es",
    busyAgentIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("PO and tech lead orchestration", () => {
  it("keeps an offline conversation and incrementally extracts a brief", async () => {
    const input = project();
    await expect(poChat(input, "Muy corto")).resolves.toContain("Pau");
    expect(input.brief.goals).toEqual([]);
    await poChat(
      input,
      "Necesito una plataforma bilingüe para atender clientes y registrar pedidos.",
    );
    await poChat(
      input,
      "También debe mostrar el estado de cada entrega de forma simple.",
    );
    expect(input.status).toBe("briefing");
    expect(input.brief.goals).toHaveLength(1);
    expect(input.brief.rawNotes).toContain("También");
    expect(input.messages).toHaveLength(6);
  });

  it("builds deterministic fallback sprints and links them to the active epic", async () => {
    const input = project();
    input.brief.goals = ["Crear una primera entrega verificable"];
    const first = await planSprint(input);
    const second = await planSprint(input, "Agregar una mejora");
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(first.tasks.some((task) => task.ownerAgentId.includes("qa"))).toBe(
      true,
    );
    expect(
      first.tasks.some((task) => task.ownerAgentId.includes("wireframe")),
    ).toBe(true);
    expect(input.epics[0].sprintIds).toEqual([first.id, second.id]);
    expect(input.status).toBe("planning");
  });

  it("normalizes a model-generated plan and adds mandatory independent design and QA", async () => {
    const current = loadSettings();
    process.env.LA_AGENCIA_API_KEY = "test-key";
    saveSettings({
      ...current,
      primaryAdapter: null,
      enabledAdapters: [],
      llm: {
        provider: "openai",
        model: "fixture",
        apiKey: undefined,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      tasks: [
                        {
                          title: "Implementar flujo",
                          ownerAgentId: "frontend-core",
                          acceptance: ["Flujo visible"],
                        },
                        {},
                      ],
                    }),
                  },
                },
              ],
            }),
          ),
      ),
    );
    const input = project();
    input.epics = [];
    const sprint = await planSprint(input, "Plan desde modelo");
    expect(sprint.tasks.map((task) => task.ownerAgentId)).toEqual([
      "wireframe-designer",
      "frontend-core",
      "frontend-core",
      "qa-verifier",
    ]);
    expect(sprint.tasks[2]).toMatchObject({
      title: "Tarea",
      description: "",
    });
    expect(sprint.tasks[2].acceptance[0]).toContain("preview");
    expect(input.epics).toHaveLength(1);
    expect(input.hiredAgentIds).toContain("tech-lead");
    saveSettings(current);
  });

  it("blocks implementation without an adapter but still creates real artifacts and QA logs", async () => {
    const input = project({ checks: true });
    const sprint = await planSprint(input, "Validar un producto");
    const onVerifying = vi.fn();
    const result = await runSprint(input, sprint.id, { onVerifying });
    expect(onVerifying).toHaveBeenCalledOnce();
    expect(result.status).toBe("review");
    expect(
      result.tasks.find((task) => task.ownerAgentId.includes("wireframe"))
        ?.evidence?.[0],
    ).toMatchObject({ kind: "artifact", ok: true });
    expect(
      result.tasks.find((task) => task.ownerAgentId.includes("qa"))?.status,
    ).toBe("done");
    expect(
      result.tasks.some(
        (task) =>
          !task.ownerAgentId.includes("wireframe") &&
          !task.ownerAgentId.includes("qa") &&
          task.status === "blocked",
      ),
    ).toBe(true);
    expect(result.report).toContain("## Evidencia");
    expect(result.reportPath).toContain(".agency");
    expect(input.busyAgentIds).toEqual([]);
  }, 15_000);

  it("requires explicit approval or change requests", async () => {
    const input = project();
    const sprint = await planSprint(input, "Feedback explícito");
    const changes = applySprintFeedback(
      input,
      sprint.id,
      "request_changes",
      "Ajustar el texto",
    );
    expect(changes.status).toBe("review");
    const approved = applySprintFeedback(
      input,
      sprint.id,
      "approve",
      "Aprobado conscientemente",
    );
    expect(approved.status).toBe("done");
    expect(input.status).toBe("idle");
    expect(() => applySprintFeedback(input, "missing", "approve", "")).toThrow(
      "Sprint no encontrado",
    );
    await expect(runSprint(input, "missing")).rejects.toThrow(
      "Sprint no encontrado",
    );
  });
});
