// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { nanoid } from "nanoid";
import type { Project } from "@la-agencia/shared";
import { loadAgent } from "../lib/agents.js";
import { leaderById } from "../lib/leaders.js";
import {
  chatCompletion,
  offlinePoReply,
  listReadySubscriptions,
  pickSubscriptionAdapter,
} from "../llm/client.js";
import { loadSettings, saveProject } from "../lib/store.js";
import { publish } from "../lib/events.js";
import { enqueue, updateQueueItem } from "../lib/queue.js";
import { estimateTokensFromText, recordUsage } from "../lib/costLedger.js";
import { catalogPromptBlock } from "../lib/resourceCatalog.js";

const ROLE_PROMPTS: Record<string, string> = {
  pau: `Eres Pau, Product Owner. Solo negocio y entregas comprensibles. Si te preguntan algo muy técnico, di que Alex (Líder Técnico) lo resuelve y ofreces traducir.`,
  alex: `Eres Alex, Líder Técnico. Orquestas el equipo técnico. Si te preguntan de negocio puro (precios, marketing, vision de producto), deriva a Pau. No sueltes jerga al cliente en nivel guided.`,
  ana: `Eres Ana, Asistente. Ayudas con cuentas (GitHub, AWS, Railway, Stripe…). Pasos cortos, enlaces, checkboxes. Cuando el usuario confirma un paso manual, marcas el todo y avisas a Alex.`,
  maya: `Eres Maya, líder de Marketing. Growth y mensajes. Contratas subagentes de marketing; el usuario no habla con ellos.`,
  leo: `Eres Leo, líder de Diseño. Wireframes y UX. Subagentes de diseño trabajan en la suboficina.`,
  nora: `Eres Nora, líder Legal (orientativo, no consejo legal).`,
  sam: `Eres Sam, líder de QA. Verificación y no auto-aprobar al maker.`,
};

export async function chatWithLeader(
  project: Project,
  leaderId: string,
  userText: string,
): Promise<{ reply: string; project: Project }> {
  const settings = loadSettings();
  const leader = leaderById(leaderId) || leaderById("pau")!;
  const agent = loadAgent(leader.agentFileId);
  const locale = project.locale || "es";

  const system = [
    ROLE_PROMPTS[leader.id] || agent?.systemPrompt || `Eres ${leader.name}.`,
    settings.introLevel === "guided"
      ? locale === "en"
        ? "GUIDED: zero jargon, short sentences, analogies."
        : "GUIADO: cero jerga, frases cortas, analogías."
      : "",
    `Proyecto: ${project.name}`,
    `Brief: ${JSON.stringify(project.brief)}`,
    `Todos del usuario pendientes: ${JSON.stringify(project.userTodos?.filter((t) => t.status !== "done") || [])}`,
    leader.id === "ana"
      ? "Si el usuario necesita crear una cuenta, crea un userTodo con steps y link. Si dice que ya lo hizo, marca done y menciona que avisarás a Alex."
      : "",
    leader.id === "pau"
      ? "Al generar informes, indica la carpeta .agency/reports/ y usa tablas markdown. Ofrece un enlace de preview cuando exista."
      : "",
    "MCP tool execution is not available in v0.4.",
    catalogPromptBlock(userText),
  ]
    .filter(Boolean)
    .join("\n");

  project.messages.push({
    id: nanoid(8),
    role: "user",
    agentId: leader.id,
    content: userText,
    createdAt: new Date().toISOString(),
  });

  const q = enqueue(project.workspacePath, {
    kind: "chat",
    title: `Chat con ${leader.name}`,
    projectId: project.id,
    payload: { leaderId: leader.id, text: userText },
    status: "running",
  });

  const ready = await listReadySubscriptions();
  const sub = await pickSubscriptionAdapter(settings);
  let reply: string;
  let queueFailed = false;

  try {
    if (!sub && !settings.llm.apiKey) {
      reply = offlinePoReply(userText, settings.introLevel, ready);
    } else {
      publish({
        type: "agent.activity",
        projectId: project.id,
        message: `${leader.name} está pensando…`,
      });
      // Mark leader busy
      if (!project.busyAgentIds) project.busyAgentIds = [];
      if (!project.busyAgentIds.includes(leader.id))
        project.busyAgentIds.push(leader.id);

      const started = Date.now();
      reply = await chatCompletion(settings, [
        { role: "system", content: system },
        ...project.messages
          .filter(
            (m) => !m.agentId || m.agentId === leader.id || m.role === "user",
          )
          .slice(-10)
          .map((m) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as
              "user" | "assistant",
            content: m.content,
          })),
      ]);

      // Ledger: subscription ≠ API bill, but we show equivalent intensity.
      const inTok = estimateTokensFromText(system + userText);
      const outTok = estimateTokensFromText(reply);
      const report = recordUsage({
        agentId: leader.id,
        label: leader.name,
        inputTokens: inTok,
        outputTokens: outTok,
        durationMs: Date.now() - started,
        adapterId: sub ?? undefined,
        source: "chat",
        estimated: true,
        outcome: "success",
      });
      publish({
        type: "cost.updated",
        projectId: project.id,
        message: report.plainSummary,
        payload: { estimatedUsd: report.estimatedUsd },
      });

      project.busyAgentIds = project.busyAgentIds.filter(
        (id) => id !== leader.id,
      );
    }
  } catch (e) {
    project.busyAgentIds = (project.busyAgentIds || []).filter(
      (id) => id !== leader.id,
    );
    const msg = e instanceof Error ? e.message : String(e);
    recordUsage({
      agentId: leader.id,
      label: leader.name,
      inputTokens: estimateTokensFromText(system + userText),
      outputTokens: estimateTokensFromText(msg),
      durationMs: 0,
      adapterId: sub ?? undefined,
      source: "chat",
      estimated: true,
      outcome: "failed",
      errorCode: msg.slice(0, 120),
    });
    reply =
      settings.introLevel === "guided"
        ? `${leader.name}: no pude usar tu suscripción ahora. Ve a Ajustes → Iniciar sesión y reintenta.\n(${msg.slice(0, 120)})`
        : `Error: ${msg}`;
    updateQueueItem(project.workspacePath, q.id, {
      status: "failed",
      error: msg,
    });
    queueFailed = true;
  }

  // Ana: simple todo creation heuristics
  if (leader.id === "ana") {
    maybeAddTodos(project, userText, reply);
  }

  project.messages.push({
    id: nanoid(8),
    role: "assistant",
    agentId: leader.id,
    content: reply,
    createdAt: new Date().toISOString(),
  });
  project.updatedAt = new Date().toISOString();
  if (project.status === "setup") project.status = "briefing";
  saveProject(project);
  if (!queueFailed)
    updateQueueItem(project.workspacePath, q.id, { status: "done" });

  return { reply, project };
}

function maybeAddTodos(project: Project, userText: string, reply: string) {
  if (!project.userTodos) project.userTodos = [];
  const lower = (userText + " " + reply).toLowerCase();
  const candidates: Array<{ title: string; link: string; steps: string[] }> =
    [];
  if (/aws|amazon web/.test(lower)) {
    candidates.push({
      title: "Crear cuenta AWS",
      link: "https://aws.amazon.com/",
      steps: [
        "Entra al enlace de AWS",
        "Crea o inicia sesión",
        "Guarda el correo de la cuenta",
        "Vuelve y dime «AWS listo»",
      ],
    });
  }
  if (/github|git hub/.test(lower)) {
    candidates.push({
      title: "Crear cuenta GitHub",
      link: "https://github.com/signup",
      steps: ["Abre GitHub", "Regístrate o entra", "Dime «GitHub listo»"],
    });
  }
  if (/railway/.test(lower)) {
    candidates.push({
      title: "Crear cuenta Railway",
      link: "https://railway.app/",
      steps: ["Abre Railway", "Entra con GitHub", "Dime «Railway listo»"],
    });
  }
  if (/stripe|pago|pagos/.test(lower)) {
    candidates.push({
      title: "Crear cuenta Stripe",
      link: "https://dashboard.stripe.com/register",
      steps: [
        "Abre Stripe",
        "Regístrate",
        "Activa modo test",
        "Dime «Stripe listo»",
      ],
    });
  }
  for (const c of candidates) {
    if (
      project.userTodos.some((t) => t.title === c.title && t.status !== "done")
    )
      continue;
    project.userTodos.push({
      id: nanoid(8),
      title: c.title,
      detail: "Tarea manual tuya para no frenar al equipo",
      link: c.link,
      steps: c.steps,
      status: "pending",
      blocksAgentId: "alex",
      createdAt: new Date().toISOString(),
    });
  }

  // Complete on confirmation
  if (
    /listo|done|ya está|ya esta|completed|hecho/.test(userText.toLowerCase())
  ) {
    for (const t of project.userTodos) {
      if (
        t.status !== "done" &&
        userText.toLowerCase().includes(t.title.split(" ").pop()!.toLowerCase())
      ) {
        t.status = "done";
        t.completedAt = new Date().toISOString();
      }
    }
    // Generic: mark first pending if user says account ready
    if (
      /aws listo|github listo|railway listo|stripe listo/.test(
        userText.toLowerCase(),
      )
    ) {
      const key = userText.toLowerCase().split(" ")[0];
      for (const t of project.userTodos) {
        if (t.status !== "done" && t.title.toLowerCase().includes(key)) {
          t.status = "done";
          t.completedAt = new Date().toISOString();
        }
      }
    }
  }
}

export async function completeUserTodo(project: Project, todoId: string) {
  const t = project.userTodos?.find((x) => x.id === todoId);
  if (!t) throw new Error("Todo no encontrado");
  t.status = "done";
  t.completedAt = new Date().toISOString();
  project.messages.push({
    id: nanoid(8),
    role: "assistant",
    agentId: "ana",
    content: `✓ «${t.title}» marcada como hecha. Aviso a Alex para que el equipo continúe (stoppage resuelto).`,
    createdAt: new Date().toISOString(),
  });
  project.updatedAt = new Date().toISOString();
  saveProject(project);
  publish({
    type: "notification",
    projectId: project.id,
    message: `Ana: stoppage resuelto — ${t.title}. Alex puede seguir.`,
  });
  return project;
}
