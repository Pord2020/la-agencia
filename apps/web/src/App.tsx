// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Settings,
  LayoutList,
  ListTodo,
  Users,
  Wallet,
  Music,
  Library,
} from "lucide-react";
import {
  OfficeEngine,
  type EngineHandle,
  type NPCPlacement,
} from "./pixel/engine";
import {
  DESK_SLOTS,
  LEADER_SLOTS,
  PO_SLOT,
  DEPARTMENT_LABELS,
  CANVAS_W,
  CANVAS_H,
} from "./pixel/office";
import { BootScreen } from "./components/BootScreen";
import { SettingsModal } from "./components/SettingsModal";
import { SprintPanel } from "./components/SprintPanel";
import { AgentsPanel } from "./components/AgentsPanel";
import { OfficeSidebar } from "./components/OfficeSidebar";
import { PokemonDialogue } from "./components/PokemonDialogue";
import { ConnectionBanner } from "./components/ConnectionBanner";
import {
  PermissionModal,
  type PermissionPayload,
} from "./components/PermissionModal";
import { CostPanel } from "./components/CostPanel";
import { ResourceCatalogPanel } from "./components/ResourceCatalogPanel";
import { api, type PreviewDTO, type ProjectDTO } from "./lib/api";
import { lookForAgent, PLAYER_PALETTE, PO_PALETTE } from "./lib/palettes";
import { sfx } from "./lib/sfx";
import { detectLocale, t, type Locale } from "./lib/i18n";
import { ensureNotifyPermission, notifyDesktop } from "./lib/notify";
import {
  isMusicPlaying,
  startAmbientMusic,
  stopAmbientMusic,
  toggleAmbientMusic,
} from "./lib/music";
import type { WorkPose } from "./pixel/sprites";

type Phase = "boot" | "office";

const LEADER_META: Record<
  string,
  { name: string; nameEn: string; role: string; roleEn: string; slot?: number }
> = {
  pau: {
    name: "Pau",
    nameEn: "Pau",
    role: "Product Owner",
    roleEn: "Product Owner",
  },
  alex: {
    name: "Alex",
    nameEn: "Alex",
    role: "Líder Técnico",
    roleEn: "Tech Lead",
    slot: 0,
  },
  maya: {
    name: "Maya",
    nameEn: "Maya",
    role: "Líder Marketing",
    roleEn: "Marketing Lead",
    slot: 1,
  },
  leo: {
    name: "Leo",
    nameEn: "Leo",
    role: "Líder Diseño",
    roleEn: "Design Lead",
    slot: 2,
  },
  nora: {
    name: "Nora",
    nameEn: "Nora",
    role: "Líder Legal",
    roleEn: "Legal Lead",
    slot: 3,
  },
  sam: {
    name: "Sam",
    nameEn: "Sam",
    role: "Líder QA",
    roleEn: "QA Lead",
    slot: 4,
  },
  ana: {
    name: "Ana",
    nameEn: "Ana",
    role: "Asistente",
    roleEn: "Assistant",
    slot: 5,
  },
};

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [locale, setLocale] = useState<Locale>(detectLocale());
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showSprints, setShowSprints] = useState(true);
  const [showTodos, setShowTodos] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [offices, setOffices] = useState<
    Array<{
      id: string;
      name: string;
      adapterId: string | null;
      projectId: string | null;
    }>
  >([]);
  const [activeOffice, setActiveOffice] = useState("main");
  const [agentCount, setAgentCount] = useState(0);
  const [talkingTo, setTalkingTo] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [dialogueLines, setDialogueLines] = useState<string[]>([]);
  const [perm, setPerm] = useState<PermissionPayload | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [subConnected, setSubConnected] = useState(false);
  const [preview, setPreview] = useState<PreviewDTO | null>(null);
  const engineRef = useRef<EngineHandle>(null);

  const ping = useCallback(async () => {
    try {
      await api.health();
      const h = await api.status();
      setOnline(true);
      setAgentCount(h.agents);
      const ready = Boolean(h.subscription?.ready);
      setSubConnected(ready);
      return true;
    } catch {
      setOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void ping();
    const iv = setInterval(() => void ping(), 4000);
    return () => clearInterval(iv);
  }, [ping]);

  useEffect(() => {
    void api
      .offices()
      .then((r) => setOffices(r.offices))
      .catch(() => {
        setOffices([
          { id: "main", name: "La Agencia", adapterId: null, projectId: null },
        ]);
      });
  }, []);

  useEffect(() => {
    if (!project) return;
    void api
      .preview(project.id)
      .then((result) => setPreview(result.preview))
      .catch(() => setPreview(null));
  }, [project?.id]);

  useEffect(() => {
    if (phase !== "office") return;
    void ensureNotifyPermission();
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/events");
      const pushMsg = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as {
            message?: string;
            type?: string;
          };
          if (data.message) setEvents((e) => [...e.slice(-30), data.message!]);
        } catch {
          /* ping */
        }
      };
      [
        "agent.activity",
        "notification",
        "sprint.update",
        "task.completed",
        "usage.alert",
        "log",
        "cost.updated",
        "preview.ready",
        "trigger.fired",
        "operation.update",
        "catalog.updated",
      ].forEach((ev) => es!.addEventListener(ev, pushMsg));

      es.addEventListener("operation.update", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            payload?: { operation?: { status?: string; projectId?: string } };
          };
          const operation = data.payload?.operation;
          if (
            operation?.projectId &&
            ["review", "blocked", "failed", "cancelled"].includes(
              operation.status || "",
            )
          ) {
            void api.getProject(operation.projectId).then(setProject);
          }
        } catch {
          /* ignore malformed event */
        }
      });

      es.addEventListener("permission.request", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            message?: string;
            payload?: PermissionPayload;
          };
          if (data.payload?.id) setPerm(data.payload);
          notifyDesktop(
            "La Agencia — permiso",
            data.payload?.title || data.message || "El equipo pide permiso",
          );
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("task.completed", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            message?: string;
          };
          notifyDesktop("La Agencia", data.message || "Tarea lista");
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("sprint.update", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            message?: string;
          };
          notifyDesktop("Sprint", data.message || "Actualización de sprint");
        } catch {
          /* ignore */
        }
      });

      es.onerror = () => {
        es?.close();
        setOnline(false);
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      es?.close();
      clearTimeout(retry);
    };
  }, [phase]);

  // Ambient lo-fi only when a subscription is connected (user can toggle).
  useEffect(() => {
    if (phase === "office" && subConnected && musicOn) {
      void startAmbientMusic(true);
    } else {
      stopAmbientMusic();
    }
  }, [phase, subConnected, musicOn]);

  const enterOffice = async () => {
    setBusy(true);
    sfx.confirm();
    try {
      const ok = await ping();
      if (!ok) {
        setBusy(false);
        return;
      }
      // Resume last project or create default
      const list = await api.projects();
      let p: ProjectDTO;
      if (list.projects[0]) {
        p = await api.getProject(list.projects[0].id);
      } else {
        p = await api.createProject({ name: "Mi producto", mode: "new" });
      }
      if (p.locale) setLocale(p.locale);
      setProject(p);
      setPhase("office");
      setTimeout(
        () => engineRef.current?.walkTo(PO_SLOT.x, PO_SLOT.y + 2),
        400,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const npcs: NPCPlacement[] = useMemo(() => {
    if (!project) return [];
    const busyIds = new Set(project.busyAgentIds || []);
    const leaders = ["alex", "maya", "leo", "nora", "sam", "ana"];
    const list: NPCPlacement[] = leaders.map((id, i) => {
      const look = lookForAgent(id, i);
      const slot = LEADER_SLOTS[id] ?? i;
      return {
        id,
        slotIndex: slot,
        palette: look.palette,
        accessory: look.accessory,
        hasNew: !busyIds.has(id),
        busy: busyIds.has(id),
        pose: (busyIds.has(id) ? "think" : "idle") as WorkPose,
        interactable: true,
        displayName: LEADER_META[id]?.name,
      };
    });
    // Sub-office workers (visible, not talkable)
    const workersBusy = project.status === "sprinting" || busyIds.size > 0;
    list.push({
      id: "worker-fe",
      slotIndex: 6,
      palette: lookForAgent("frontend", 6).palette,
      accessory: "none",
      hasNew: false,
      busy: workersBusy,
      pose: workersBusy ? "type" : "idle",
      interactable: false,
      displayName: "Dev",
    });
    list.push({
      id: "worker-be",
      slotIndex: 7,
      palette: lookForAgent("backend", 7).palette,
      accessory: "glasses",
      hasNew: false,
      busy: workersBusy,
      pose: workersBusy ? "type" : "idle",
      interactable: false,
      displayName: "Dev",
    });
    return list;
  }, [project]);

  const openTalk = (leaderId: string) => {
    if (!project) return;
    sfx.open();
    setTalkingTo(leaderId);
    const msgs = project.messages
      .filter(
        (m) =>
          m.agentId === leaderId ||
          (leaderId === "pau" &&
            (m.agentId === "product-owner" ||
              m.agentId === "pau" ||
              !m.agentId)),
      )
      .slice(-4)
      .map((m) => m.content);
    if (msgs.length === 0) {
      const meta = LEADER_META[leaderId];
      const name = locale === "en" ? meta?.nameEn : meta?.name;
      setDialogueLines([
        locale === "en"
          ? `Hi, I'm ${name}. How can I help?`
          : `Hola, soy ${name}. ¿En qué te ayudo?`,
      ]);
    } else {
      setDialogueLines(msgs.slice(-2));
    }
  };

  const handleInteract = (id: string) => {
    if (!project) return;
    if (id === "po" || id === "reception") {
      openTalk("pau");
      return;
    }
    if (id.startsWith("npc:")) {
      openTalk(id.slice(4));
      return;
    }
    if (id.startsWith("worker:")) {
      setTalkingTo("hint");
      setDialogueLines([t(locale, "workerHint")]);
      return;
    }
    if (id === "whiteboard") {
      setShowSprints(true);
      setTalkingTo("pau");
      setDialogueLines([
        locale === "en"
          ? "That's the sprint board. Check progress with the boxes."
          : "Esa es la pizarra de sprints. Mira los checks de avance.",
      ]);
    }
  };

  const sendChat = async () => {
    if (
      !project ||
      !chatInput.trim() ||
      busy ||
      !talkingTo ||
      talkingTo === "hint"
    )
      return;
    const msg = chatInput.trim();
    setChatInput("");
    setBusy(true);
    setDialogueLines((l) => [...l, `› ${msg}`]);
    try {
      const { project: p, reply } = await api.chat(project.id, msg, talkingTo);
      setProject(p);
      setDialogueLines((lines) => [...lines.slice(-6), reply]);
      sfx.open();
    } catch (e) {
      setDialogueLines((l) => [
        ...l,
        e instanceof Error ? e.message : "Error de chat",
      ]);
    } finally {
      setBusy(false);
    }
  };

  const plan = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const { project: p } = await api.planSprint(project.id);
      setProject(p);
      sfx.confirm();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const run = async (sprintId: string) => {
    if (!project) return;
    setBusy(true);
    try {
      const { operation } = await api.runSprint(project.id, sprintId);
      void (async () => {
        for (let attempt = 0; attempt < 900; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const current = (await api.operation(operation.id)).operation;
          if (
            ["review", "blocked", "failed", "cancelled"].includes(
              current.status,
            )
          ) {
            setProject(await api.getProject(current.projectId));
            return;
          }
        }
      })().catch(() => {
        setOnline(false);
      });
      setTalkingTo("pau");
      setDialogueLines([
        locale === "en"
          ? "The sprint is waiting for your permission. Work starts only after you approve it."
          : "El sprint espera tu permiso. El trabajo comienza solo después de aprobarlo.",
      ]);
      sfx.confirm();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const speaker =
    talkingTo && talkingTo !== "hint" ? LEADER_META[talkingTo] : null;

  if (phase === "boot") {
    return (
      <div className="h-dvh w-full relative">
        <ConnectionBanner
          online={online}
          locale={locale}
          onReconnect={() => void ping()}
        />
        <BootScreen
          onEnter={() => {
            void enterOffice();
          }}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40 pointer-events-none">
            <div className="font-pixel text-[10px] text-sun">
              {t(locale, "connecting")}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-arcade text-cream">
      <ConnectionBanner
        online={online}
        locale={locale}
        onReconnect={() => void ping()}
      />

      <OfficeSidebar
        locale={locale}
        offices={
          offices.length
            ? offices
            : [
                {
                  id: "main",
                  name: project?.name || "La Agencia",
                  adapterId: project?.primaryAdapter || null,
                  projectId: project?.id || null,
                },
              ]
        }
        activeId={activeOffice}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onSelect={(id) => setActiveOffice(id)}
        onNew={() => setShowSettings(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-cream/15 bg-ink/50 px-3 py-2">
          <div className="font-pixel text-[9px] text-sun">LA AGENCIA</div>
          <div className="text-xs text-cream/70 truncate max-w-[200px]">
            {project?.name} · {project?.status}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            className="text-[10px] text-cream/60 underline"
            onClick={() => setLocale((l) => (l === "es" ? "en" : "es"))}
          >
            {locale === "es" ? "EN" : "ES"}
          </button>
          <button
            type="button"
            className="hud-btn"
            title={
              subConnected
                ? "Música ambiente (lo-fi)"
                : "Conecta una cuenta para activar la música"
            }
            onClick={() => {
              if (!subConnected) return;
              void toggleAmbientMusic(true).then((on) => setMusicOn(on));
            }}
          >
            <Music className="h-3 w-3" />{" "}
            {musicOn || isMusicPlaying() ? "♪" : "–"}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowCost(true)}
          >
            <Wallet className="h-3 w-3" /> $
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowTodos((v) => !v)}
          >
            <ListTodo className="h-3 w-3" /> {t(locale, "todos")}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowSprints((v) => !v)}
          >
            <LayoutList className="h-3 w-3" /> {t(locale, "sprints")}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowLibrary(true)}
          >
            <Library className="h-3 w-3" />{" "}
            {locale === "en" ? "Library" : "Biblioteca"}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowAgents(true)}
          >
            <Users className="h-3 w-3" /> {t(locale, "team")}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-3 w-3" /> {t(locale, "settings")}
          </button>
        </header>

        <div className="flex min-h-0 flex-1 gap-2 p-2">
          <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center">
            <div className="arcade-frame relative w-full max-w-[920px]">
              <OfficeEngine
                ref={engineRef}
                npcs={npcs}
                playerPalette={PLAYER_PALETTE}
                playerAccessory="none"
                poPalette={PO_PALETTE}
                onInteract={handleInteract}
                controlsEnabled={
                  !showSettings && !showAgents && !showLibrary && online
                }
              />
              <div className="scanlines pointer-events-none absolute inset-0" />

              {/* Dept labels */}
              {DEPARTMENT_LABELS.map((d) => (
                <div
                  key={d.id}
                  className="pointer-events-none absolute font-pixel text-[5px] text-cream/50"
                  style={{
                    left: `${(((d.x * 16) / CANVAS_W) * 100).toFixed(2)}%`,
                    top: `${(((d.y * 16) / CANVAS_H) * 100).toFixed(2)}%`,
                  }}
                >
                  {locale === "en" ? d.labelEn : d.label}
                </div>
              ))}

              {/* Leader name tags */}
              {npcs
                .filter((n) => n.interactable !== false)
                .map((n) => {
                  const slot = DESK_SLOTS[n.slotIndex];
                  if (!slot) return null;
                  return (
                    <div
                      key={n.id}
                      className="npc-tag"
                      style={{
                        left: `${(((slot.x * 16 + 8) / CANVAS_W) * 100).toFixed(2)}%`,
                        top: `${(((slot.y * 16 + 18) / CANVAS_H) * 100).toFixed(2)}%`,
                      }}
                    >
                      <span className="tag-name">{n.displayName || n.id}</span>
                      <br />
                      <span className="tag-role">
                        {locale === "en"
                          ? LEADER_META[n.id]?.roleEn
                          : LEADER_META[n.id]?.role}
                      </span>
                    </div>
                  );
                })}
              <div
                className="npc-tag"
                style={{
                  left: `${(((PO_SLOT.x * 16 + 8) / CANVAS_W) * 100).toFixed(2)}%`,
                  top: `${(((PO_SLOT.y * 16 + 18) / CANVAS_H) * 100).toFixed(2)}%`,
                }}
              >
                <span className="tag-name">Pau</span>
                <br />
                <span className="tag-role">PO</span>
              </div>

              {talkingTo && (
                <PokemonDialogue
                  speakerName={
                    talkingTo === "hint"
                      ? "…"
                      : locale === "en"
                        ? speaker?.nameEn || talkingTo
                        : speaker?.name || talkingTo
                  }
                  speakerRole={
                    talkingTo === "hint"
                      ? undefined
                      : locale === "en"
                        ? speaker?.roleEn
                        : speaker?.role
                  }
                  lines={dialogueLines}
                  input={chatInput}
                  onInput={setChatInput}
                  onSend={() => void sendChat()}
                  onClose={() => {
                    setTalkingTo(null);
                    setChatInput("");
                  }}
                  busy={busy}
                  placeholder={t(locale, "typeHere")}
                  sendLabel={t(locale, "send")}
                  talkingToLabel={t(locale, "talkingTo")}
                />
              )}
            </div>
            <div className="mt-2 text-center font-pixel text-[7px] text-cream/50">
              {t(locale, "talkHint")}
              {agentCount ? ` · ${agentCount}` : ""}
            </div>
            {events.length > 0 && (
              <div className="mt-1 max-h-12 w-full max-w-[920px] overflow-auto text-[10px] text-sky">
                {events.slice(-3).map((e, i) => (
                  <div key={i}>▸ {e}</div>
                ))}
              </div>
            )}
          </div>

          {/* Right: sprints + todos */}
          <div className="flex w-full max-w-sm shrink-0 flex-col gap-2 overflow-hidden sm:w-[320px]">
            {showSprints && project && (
              <div className="min-h-0 flex-1 overflow-hidden">
                <SprintPanel
                  project={project}
                  locale={locale}
                  busy={busy}
                  onPlan={() => void plan()}
                  onRun={(id) => void run(id)}
                  preview={preview}
                  onStartPreview={() => {
                    void api
                      .startPreview(project.id)
                      .then((result) => setPreview(result.preview))
                      .catch((error) =>
                        alert(
                          error instanceof Error
                            ? error.message
                            : "No se pudo iniciar la preview",
                        ),
                      );
                  }}
                  onSharePreview={() => {
                    void api
                      .requestPreviewShare(project.id)
                      .catch((error) =>
                        alert(
                          error instanceof Error
                            ? error.message
                            : "No se pudo solicitar el enlace",
                        ),
                      );
                  }}
                  onStopShare={() => {
                    void api.stopPreviewShare(project.id).then(() => {
                      void api
                        .preview(project.id)
                        .then((result) => setPreview(result.preview));
                    });
                  }}
                  onFeedback={(id, decision, comment) => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const { project: p } = await api.feedback(
                          project.id,
                          id,
                          decision,
                          comment,
                        );
                        setProject(p);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                />
              </div>
            )}
            {showTodos && project && (
              <div className="pixel-panel max-h-56 overflow-auto p-3 text-sm text-ink">
                <div className="font-pixel text-[9px] mb-2">
                  {t(locale, "todos")}
                </div>
                {!(project.userTodos && project.userTodos.length) && (
                  <p className="text-xs text-ink-soft">
                    {t(locale, "noTodos")}
                  </p>
                )}
                {project.userTodos?.map((todo) => (
                  <div
                    key={todo.id}
                    className="mb-2 border-2 border-ink/20 p-2"
                  >
                    <div className="font-semibold text-xs">
                      {todo.status === "done" ? "☑" : "☐"} {todo.title}
                    </div>
                    {todo.link && (
                      <a
                        className="text-[10px] text-blue-700 underline break-all"
                        href={todo.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {todo.link}
                      </a>
                    )}
                    <ol className="mt-1 list-decimal pl-4 text-[11px]">
                      {todo.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    {todo.status !== "done" && (
                      <button
                        type="button"
                        className="pixel-btn mt-1 text-[7px]"
                        onClick={() => {
                          void api
                            .completeTodo(project.id, todo.id)
                            .then(setProject);
                        }}
                      >
                        {t(locale, "markDone")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {perm && (
        <PermissionModal
          request={perm}
          onResolve={(decision) => {
            void api
              .resolvePermission(perm.id, decision)
              .then(async () => {
                if (
                  decision !== "deny" &&
                  perm.kind === "deploy_production" &&
                  project
                ) {
                  const result = await api.confirmPreviewShare(
                    project.id,
                    perm.id,
                  );
                  setPreview(result.preview);
                }
                if (
                  decision !== "deny" &&
                  perm.kind === "acquire_resource" &&
                  perm.technicalDetail &&
                  project
                ) {
                  await api.confirmResourceInstall(
                    perm.technicalDetail,
                    project.id,
                    perm.id,
                  );
                  window.dispatchEvent(new Event("agency:resources-updated"));
                }
                if (
                  decision !== "deny" &&
                  perm.kind === "delete_files" &&
                  perm.technicalDetail &&
                  project
                ) {
                  await api.confirmResourceRemoval(
                    perm.technicalDetail,
                    project.id,
                    perm.id,
                  );
                  window.dispatchEvent(new Event("agency:resources-updated"));
                }
                if (
                  decision !== "deny" &&
                  perm.kind === "activate_resource" &&
                  perm.technicalDetail &&
                  project
                ) {
                  await api.confirmResourceActivation(
                    perm.technicalDetail,
                    project.id,
                    perm.id,
                  );
                  window.dispatchEvent(new Event("agency:resources-updated"));
                }
              })
              .finally(() => setPerm(null));
          }}
        />
      )}
      <CostPanel open={showCost} onClose={() => setShowCost(false)} />
      {showLibrary && (
        <ResourceCatalogPanel
          locale={locale}
          projectId={project?.id || ""}
          onClose={() => setShowLibrary(false)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAgents && project && (
        <AgentsPanel
          hired={project.hiredAgentIds}
          onClose={() => setShowAgents(false)}
          onHire={(ids) => {
            void api.hire(project.id, ids).then((p) => {
              setProject(p);
              setShowAgents(false);
              sfx.confirm();
            });
          }}
        />
      )}

      <style>{`
        .hud-btn {
          display: inline-flex; align-items: center; gap: 4px;
          border: 2px solid #fffdf5; background: #fffdf5; color: #22223b;
          padding: 4px 8px; font-size: 10px; cursor: pointer;
        }
        .hud-btn:hover { background: #f3ead8; }
      `}</style>
    </div>
  );
}
