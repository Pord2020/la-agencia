// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { nanoid } from "nanoid";
import type { Project, Sprint, SprintTask } from "@la-agencia/shared";
import { loadAgent } from "../lib/agents.js";
import {
  chatCompletion,
  offlinePoReply,
  listReadySubscriptions,
  pickSubscriptionAdapter,
} from "../llm/client.js";
import { loadSettings, saveProject } from "../lib/store.js";
import { publish } from "../lib/events.js";
import { runCodingJob } from "../adapters/index.js";
import {
  createWireframeArtifact,
  verifyWorkspace,
} from "../lib/verification.js";
import { estimateTokensFromText, recordUsage } from "../lib/costLedger.js";
import { catalogPromptBlock } from "../lib/resourceCatalog.js";

function introPrefix(level: string): string {
  if (level === "guided") {
    return "NIVEL GUIADO: habla como a un cliente sin conocimientos de TI. Cero jerga. Usa analogías.";
  }
  if (level === "advanced") {
    return "NIVEL AVANZADO: puedes usar términos técnicos con precisión.";
  }
  return "NIVEL STANDARD: lenguaje claro, jerga mínima y explicada.";
}

export async function poChat(
  project: Project,
  userText: string,
): Promise<string> {
  const settings = loadSettings();
  const po = loadAgent("product-owner");
  const system = [
    po?.systemPrompt || "Eres Pau, Product Owner.",
    introPrefix(settings.introLevel),
    "",
    `Proyecto: ${project.name}`,
    `Estado: ${project.status}`,
    `Brief actual: ${JSON.stringify(project.brief)}`,
    `Agentes contratados: ${project.hiredAgentIds.join(", ") || "(ninguno aún)"}`,
    `Adapter principal: ${project.primaryAdapter || settings.primaryAdapter || "sin configurar"}`,
    "",
    "Si el usuario describe un producto nuevo, resume goals/users/mustHaves en tu respuesta y sugiere contratar equipo.",
    "Si pide un cambio (ej. botón verde de pagos), indica que el Líder Técnico lo meterá en un sprint y pide confirmación.",
    catalogPromptBlock(userText),
  ].join("\n");

  project.messages.push({
    id: nanoid(8),
    role: "user",
    content: userText,
    createdAt: new Date().toISOString(),
  });

  let reply: string;
  const ready = await listReadySubscriptions();
  const sub = await pickSubscriptionAdapter(settings);

  try {
    if (!sub && !settings.llm.apiKey) {
      reply = offlinePoReply(userText, settings.introLevel, ready);
    } else {
      publish({
        type: "agent.activity",
        projectId: project.id,
        message: sub
          ? `Pau está pensando con tu suscripción (${sub})…`
          : "Pau está pensando…",
      });
      reply = await chatCompletion(
        settings,
        [
          { role: "system", content: system },
          ...project.messages.slice(-12).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
        { tier: "cheap" },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === "NO_SUBSCRIPTION" ||
      msg === "NO_API_KEY" ||
      msg === "ADAPTER_NOT_INSTALLED" ||
      msg === "ADAPTER_NOT_LOGGED_IN" ||
      msg === "ADAPTER_CHAT_FAILED"
    ) {
      reply = offlinePoReply(userText, settings.introLevel, ready);
      if (msg === "ADAPTER_NOT_LOGGED_IN") {
        reply =
          "Casi listo: la herramienta está instalada pero **falta iniciar sesión** con tu cuenta (se abre el navegador, como Netflix).\n\nVe a **Ajustes → Conectar cuenta → Iniciar sesión**, termina el login y vuelve a escribirme.\n\n" +
          reply;
      }
    } else {
      reply = [
        "Tuve un problema al hablar con tu suscripción.",
        settings.introLevel === "guided"
          ? "No te preocupes: ve a **Ajustes**, elige tu cuenta (Claude, Grok, Cursor…) y pulsa **Iniciar sesión**. Luego inténtalo otra vez."
          : `Detalle técnico: ${msg.slice(0, 200)}`,
        "",
        "Tu mensaje quedó guardado en el proyecto; lo retomo en cuanto la sesión funcione.",
      ].join("\n");
    }
  }

  // Light brief extraction heuristics
  updateBriefHeuristic(project, userText);

  project.messages.push({
    id: nanoid(8),
    role: "assistant",
    agentId: "product-owner",
    content: reply,
    createdAt: new Date().toISOString(),
  });
  project.updatedAt = new Date().toISOString();
  if (project.status === "setup" || project.status === "idle")
    project.status = "briefing";
  saveProject(project);
  return reply;
}

function updateBriefHeuristic(project: Project, text: string) {
  const t = text.trim();
  if (t.length < 12) return;
  if (!project.brief.rawNotes) project.brief.rawNotes = t;
  else project.brief.rawNotes += "\n" + t;
  // First substantial message becomes a goal if empty
  if (project.brief.goals.length === 0) {
    project.brief.goals.push(t.slice(0, 240));
  }
}

export async function planSprint(
  project: Project,
  goal?: string,
): Promise<Sprint> {
  const settings = loadSettings();
  const lt = loadAgent("tech-lead");
  const sprintGoal =
    goal ||
    project.brief.goals[0] ||
    "Primera entrega usable según el brief del cliente";
  const resourceContext = catalogPromptBlock(
    `${sprintGoal} ${project.brief.rawNotes}`,
    8,
  );

  publish({
    type: "agent.activity",
    projectId: project.id,
    message: "Líder Técnico ordenando backlog y sprint…",
  });

  let tasks: SprintTask[] = [];
  const planningStartedAt = Date.now();

  // Plan vía suscripción del usuario (misma que el PO), sin API keys
  try {
    const raw = await chatCompletion(
      settings,
      [
        {
          role: "system",
          content:
            (lt?.systemPrompt || "Eres LT.") +
            '\nResponde SOLO JSON: {"tasks":[{"title":"","ownerAgentId":"frontend-core|backend-api|qa-verifier|wireframe-designer","acceptance":["..."],"description":""}]}',
        },
        {
          role: "user",
          content: `Brief: ${JSON.stringify(project.brief)}\nSprint goal: ${sprintGoal}\nAdapter: ${project.primaryAdapter || settings.primaryAdapter}\n${resourceContext}`,
        },
      ],
      { tier: "medium", temperature: 0.2 },
    );
    recordUsage({
      agentId: "tech-lead",
      label: "Sprint planning",
      inputTokens: estimateTokensFromText(
        JSON.stringify(project.brief) + sprintGoal,
      ),
      outputTokens: estimateTokensFromText(raw),
      durationMs: Date.now() - planningStartedAt,
      source: "planning",
      estimated: true,
      outcome: "success",
    });
    const json = extractJson(raw);
    if (json?.tasks?.length) {
      tasks = json.tasks.slice(0, 8).map((t) => ({
        id: nanoid(8),
        title: t.title || "Tarea",
        description: t.description || "",
        ownerAgentId: t.ownerAgentId || "frontend-core",
        status: "todo" as const,
        acceptance: t.acceptance || [
          "El PO puede validar el cambio en la preview",
        ],
        adapterHint:
          project.primaryAdapter || settings.primaryAdapter || undefined,
      }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordUsage({
      agentId: "tech-lead",
      label: "Sprint planning",
      inputTokens: estimateTokensFromText(
        JSON.stringify(project.brief) + sprintGoal,
      ),
      outputTokens: estimateTokensFromText(message),
      durationMs: Date.now() - planningStartedAt,
      source: "planning",
      estimated: true,
      outcome: "failed",
      errorCode: message.slice(0, 120),
    });
  }

  if (tasks.length === 0) {
    tasks = defaultTasks(project, sprintGoal);
  }
  if (!tasks.some((task) => task.ownerAgentId.includes("wireframe"))) {
    tasks.unshift({
      id: nanoid(8),
      title: "Wireframe verificable",
      description: `Documentar el flujo para: ${sprintGoal}`,
      ownerAgentId: "wireframe-designer",
      status: "todo",
      acceptance: ["Existe un artefacto persistido y revisable"],
    });
  }
  if (!tasks.some((task) => task.ownerAgentId.includes("qa"))) {
    tasks.push({
      id: nanoid(8),
      title: "Verificación QA independiente",
      description: "Ejecutar checks detectables y conservar evidencia.",
      ownerAgentId: "qa-verifier",
      status: "todo",
      acceptance: ["Tests, typecheck o build pasan con logs persistidos"],
    });
  } else {
    tasks = [
      ...tasks.filter((task) => !task.ownerAgentId.includes("qa")),
      ...tasks.filter((task) => task.ownerAgentId.includes("qa")),
    ];
  }

  const wireframes = [
    `Wireframe · ${sprintGoal}`,
    "1) Pantalla principal con el flujo del usuario",
    "2) Acción principal (botón/CTA) destacada",
    "3) Estado de éxito y de error",
    "4) Cómo se conecta con datos/pago si aplica",
  ];

  const diagrams = [
    "```mermaid\nflowchart LR\n  U[Usuario] --> UI[Pantalla]\n  UI --> API[Lógica/API]\n  API --> DB[(Datos)]\n  API --> Pay[Pagos opcional]\n```",
  ];

  const sprint: Sprint = {
    id: nanoid(10),
    number: project.sprints.length + 1,
    goal: sprintGoal,
    status: "planned",
    tasks,
    wireframes,
    diagrams,
    screenshots: [],
    report: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // hire agents mentioned
  for (const t of tasks) {
    if (!project.hiredAgentIds.includes(t.ownerAgentId)) {
      project.hiredAgentIds.push(t.ownerAgentId);
    }
  }
  for (const id of [
    "product-owner",
    "tech-lead",
    "qa-verifier",
    "wireframe-designer",
  ]) {
    if (!project.hiredAgentIds.includes(id)) project.hiredAgentIds.push(id);
  }

  // Link to current epic
  if (!project.epics) project.epics = [];
  let epic = project.epics.find((e) => e.status === "doing");
  if (!epic) {
    epic = {
      id: nanoid(8),
      title: "Primera entrega usable",
      order: 1,
      status: "doing",
      sprintIds: [],
    };
    project.epics.push(epic);
  }
  sprint.epicId = epic.id;
  epic.sprintIds.push(sprint.id);

  project.sprints.push(sprint);
  project.status = "planning";
  project.updatedAt = new Date().toISOString();
  saveProject(project);

  publish({
    type: "sprint.update",
    projectId: project.id,
    message: `Sprint ${sprint.number} planificado: ${sprint.goal}`,
    payload: { sprintId: sprint.id },
  });

  return sprint;
}

function defaultTasks(project: Project, goal: string): SprintTask[] {
  const adapter = project.primaryAdapter || undefined;
  return [
    {
      id: nanoid(8),
      title: "Wireframes e informe de alcance",
      description: `Documentar pantallas y flujo para: ${goal}`,
      ownerAgentId: "wireframe-designer",
      status: "todo",
      acceptance: ["El cliente entiende el flujo sin ver código"],
    },
    {
      id: nanoid(8),
      title: "Implementar la entrega del sprint",
      description: goal,
      ownerAgentId: "frontend-core",
      status: "todo",
      acceptance: ["Se puede probar en el navegador local"],
      adapterHint: adapter,
    },
    {
      id: nanoid(8),
      title: "Verificación QA",
      description: "Probar criterios de aceptación; no auto-aprobar.",
      ownerAgentId: "qa-verifier",
      status: "todo",
      acceptance: ["Checklist de aceptación pasado o fallos listados"],
    },
  ];
}

interface PlannedTask {
  title?: string;
  description?: string;
  ownerAgentId?: string;
  acceptance?: string[];
}

function extractJson(text: string): { tasks?: PlannedTask[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as { tasks?: PlannedTask[] };
  } catch {
    return null;
  }
}

export async function runSprint(
  project: Project,
  sprintId: string,
  hooks?: { onVerifying?: () => void; signal?: AbortSignal },
): Promise<Sprint> {
  const sprint = project.sprints.find((s) => s.id === sprintId);
  if (!sprint) throw new Error("Sprint no encontrado");
  const settings = loadSettings();
  const adapter = project.primaryAdapter || settings.primaryAdapter;

  sprint.status = "running";
  project.status = "sprinting";
  project.busyAgentIds = ["alex", "worker-fe", "worker-be"];
  saveProject(project);

  publish({
    type: "agent.animation",
    projectId: project.id,
    message: "El equipo se pone a trabajar…",
    payload: { pose: "type", agentIds: project.busyAgentIds },
  });

  for (const task of sprint.tasks) {
    if (task.status === "done") continue;
    if (hooks?.signal?.aborted) throw new Error("OPERATION_CANCELLED");
    task.status = "doing";
    saveProject(project);
    publish({
      type: "agent.activity",
      projectId: project.id,
      message: `${task.ownerAgentId} trabajando en: ${task.title}`,
    });

    const agent = loadAgent(task.ownerAgentId);
    const brief = [
      `Tarea: ${task.title}`,
      task.description,
      `Aceptación: ${task.acceptance.join("; ")}`,
      `Proyecto: ${project.name}`,
      `Brief: ${JSON.stringify(project.brief)}`,
      agent ? `Rol: ${agent.name}\n${agent.systemPrompt.slice(0, 1500)}` : "",
      catalogPromptBlock(`${task.title} ${task.description}`, 5),
      "",
      "Implementa el cambio en este repositorio con buenas prácticas. No deploys a producción sin pedir confirmación.",
    ].join("\n");

    task.technicalBrief = brief;

    if (task.ownerAgentId.includes("wireframe")) {
      const artifactPath = createWireframeArtifact({
        workspace: project.workspacePath,
        sprintNumber: sprint.number,
        goal: sprint.goal,
      });
      task.evidence = [
        {
          kind: "artifact",
          path: artifactPath,
          ok: true,
          summary: "Wireframe persistido como artefacto revisable.",
        },
      ];
      task.summaryForPo = `Wireframe disponible en ${artifactPath}.`;
      task.status = "done";
    } else if (task.ownerAgentId.includes("qa")) {
      hooks?.onVerifying?.();
      const verification = await verifyWorkspace({
        projectId: project.id,
        workspace: project.workspacePath,
        sprintNumber: sprint.number,
        signal: hooks?.signal,
      });
      task.evidence = verification.evidence;
      task.summaryForPo = verification.ok
        ? "QA ejecutó los checks detectados y conservó la evidencia."
        : "QA bloqueó el sprint: faltan checks verificables o alguno falló.";
      task.status = verification.ok ? "done" : "blocked";
    } else if (adapter) {
      const result = await runCodingJob({
        projectId: project.id,
        taskId: task.id,
        cwd: project.workspacePath,
        prompt: brief,
        adapterId: task.adapterHint || adapter,
        signal: hooks?.signal,
      });
      task.summaryForPo = result.ok
        ? `Implementación ejecutada vía ${adapter}.`
        : `No se pudo completar vía CLI (${result.mode}). Brief en .agency/jobs/.`;
      task.status = result.ok ? "done" : "blocked";
    } else {
      task.summaryForPo =
        "Sin adapter de coding conectado. El brief de la tarea está listo; conecta Cursor/Codex/Grok/… en Ajustes.";
      task.status = "blocked";
    }
    sprint.updatedAt = new Date().toISOString();
    saveProject(project);
  }

  sprint.status = "review";
  sprint.report = buildSprintReport(sprint);
  // Persist report for Pau / client
  try {
    const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const reports = join(project.workspacePath, ".agency", "reports");
    if (!existsSync(reports)) mkdirSync(reports, { recursive: true });
    const reportPath = join(reports, `sprint-${sprint.number}.md`);
    writeFileSync(reportPath, sprint.report, "utf8");
    sprint.reportPath = reportPath;
  } catch {
    /* ignore */
  }
  project.status = "review";
  project.busyAgentIds = [];
  project.updatedAt = new Date().toISOString();
  saveProject(project);

  publish({
    type: "notification",
    projectId: project.id,
    message: `Sprint ${sprint.number} listo para revisión. ¿Qué opinas? ¿Vamos bien?`,
    payload: { sprintId: sprint.id, reportPath: sprint.reportPath },
  });

  return sprint;
}

function buildSprintReport(sprint: Sprint): string {
  const lines = [
    `# Informe Sprint ${sprint.number}`,
    "",
    `**Objetivo:** ${sprint.goal}`,
    "",
    "## Trabajo realizado",
    ...sprint.tasks.map(
      (t) =>
        `- **${t.title}** (${t.ownerAgentId}) — ${t.status}${t.summaryForPo ? `: ${t.summaryForPo}` : ""}`,
    ),
    "",
    "## Evidencia",
    ...sprint.tasks.flatMap((task) =>
      (task.evidence || []).map(
        (evidence) =>
          `- ${evidence.ok ? "PASS" : "FAIL"} · ${task.title}: ${evidence.summary}` +
          `${evidence.command ? ` — \`${evidence.command}\`` : ""}` +
          `${evidence.path ? ` — ${evidence.path}` : ""}`,
      ),
    ),
    "",
    "## Wireframes",
    ...sprint.wireframes.map((w) => `- ${w}`),
    "",
    "## Diagrama",
    ...sprint.diagrams,
    "",
    "## Siguiente paso",
    "Prueba el resultado en tu workspace y responde al PO: ¿aprobamos, cambios, o paramos?",
  ];
  return lines.join("\n");
}

export function applySprintFeedback(
  project: Project,
  sprintId: string,
  decision: "approve" | "request_changes",
  comment: string,
): Sprint {
  const sprint = project.sprints.find((s) => s.id === sprintId);
  if (!sprint) throw new Error("Sprint no encontrado");
  sprint.feedback = comment;
  sprint.status = decision === "approve" ? "done" : "review";
  if (sprint.status === "done") project.status = "idle";
  project.updatedAt = new Date().toISOString();
  saveProject(project);
  publish({
    type: "sprint.update",
    projectId: project.id,
    message: `Feedback del sprint ${sprint.number} registrado.`,
  });
  return sprint;
}
