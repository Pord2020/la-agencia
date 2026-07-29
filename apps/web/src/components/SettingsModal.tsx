// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "react";
import { api } from "../lib/api";

const FRIENDLY: Record<
  string,
  { title: string; blurb: string; account: string }
> = {
  "claude-code": {
    title: "Claude",
    blurb: "Si pagas Claude Pro / Max o usas Claude en el ordenador.",
    account: "Tu cuenta de Claude (Anthropic)",
  },
  "grok-build": {
    title: "Grok",
    blurb: "Si usas Grok / X Premium o Grok Build en el ordenador.",
    account: "Tu cuenta de Grok / xAI",
  },
  cursor: {
    title: "Cursor",
    blurb: "Si usas el editor Cursor con su plan de agente.",
    account: "Tu cuenta de Cursor",
  },
  codex: {
    title: "ChatGPT / Codex",
    blurb: "Si pagas ChatGPT Plus/Pro y usas Codex.",
    account: "Tu cuenta de ChatGPT / OpenAI",
  },
  kimi: {
    title: "Kimi",
    blurb: "Si usas Kimi con tu suscripción.",
    account: "Tu cuenta de Kimi",
  },
  antigravity: {
    title: "Antigravity (Google)",
    blurb: "Si usas la cuenta Google / Antigravity.",
    account: "Tu cuenta de Google",
  },
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adapters, setAdapters] = useState<
    Array<{
      id: string;
      name: string;
      installed: boolean;
      version?: string;
      detail?: string;
    }>
  >([]);
  const [chatReady, setChatReady] = useState(false);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [form, setForm] = useState({
    introLevel: "guided",
    orchestrator: "po-techlead",
    harness: "consultancy",
    primaryAdapter: "" as string,
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "",
    hasKey: false,
    cursorHoursLimit: 5,
    cursorHoursUsed: 0,
    warnAt: 0.8,
    blockHeavyAt: 0.9,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

  const reload = async () => {
    const [s, a] = await Promise.all([api.settings(), api.adapters()]);
    setAdapters(a);
    const sub = s.subscription as
      { active?: string | null; chatReady?: boolean } | undefined;
    setChatReady(Boolean(sub?.chatReady));
    setActiveSub(sub?.active || null);
    const llm = s.llm as {
      provider?: string;
      model?: string;
      baseUrl?: string;
      hasKey?: boolean;
    };
    setForm((f) => ({
      ...f,
      introLevel: String(s.introLevel || "guided"),
      orchestrator: String(s.orchestrator || "po-techlead"),
      harness: String(s.harness || "consultancy"),
      primaryAdapter: String(s.primaryAdapter || sub?.active || ""),
      provider: llm.provider || "openai",
      model: llm.model || "gpt-4o-mini",
      baseUrl: llm.baseUrl || "",
      hasKey: Boolean(llm.hasKey),
      cursorHoursLimit: Number(
        (s.usage as { cursorHoursLimit?: number })?.cursorHoursLimit || 5,
      ),
      cursorHoursUsed: Number(
        (s.usage as { cursorHoursUsed?: number })?.cursorHoursUsed || 0,
      ),
      warnAt: Number((s.usage as { warnAt?: number })?.warnAt || 0.8),
      blockHeavyAt: Number(
        (s.usage as { blockHeavyAt?: number })?.blockHeavyAt || 0.9,
      ),
    }));
  };

  useEffect(() => {
    void (async () => {
      await reload();
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.saveSettings({
        introLevel: form.introLevel,
        orchestrator: form.orchestrator,
        harness: form.harness,
        primaryAdapter: form.primaryAdapter || null,
        enabledAdapters: form.primaryAdapter ? [form.primaryAdapter] : [],
        llm: showAdvanced
          ? {
              provider: form.provider,
              model: form.model,
              baseUrl: form.baseUrl || undefined,
            }
          : undefined,
        usage: {
          warnAt: form.warnAt,
          blockHeavyAt: form.blockHeavyAt,
          pollMinutes: 15,
          cursorHoursLimit: form.cursorHoursLimit,
          cursorHoursUsed: form.cursorHoursUsed,
        },
      });
      setMsg("Listo. Guardado solo en tu ordenador.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const login = async (id: string) => {
    setLoginMsg(null);
    try {
      const r = await api.adapterLogin(id);
      setLoginMsg(r.message);
      setForm((f) => ({ ...f, primaryAdapter: id }));
      await api.saveSettings({
        primaryAdapter: id,
        enabledAdapters: [id],
      });
      await reload();
    } catch (e) {
      setLoginMsg(e instanceof Error ? e.message : "No se pudo conectar");
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="pixel-panel max-h-[90vh] w-full max-w-2xl overflow-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-pixel text-[11px] text-ink">
            Conectar tu cuenta
          </h2>
          <button type="button" className="pixel-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-soft">Cargando…</p>
        ) : (
          <div className="space-y-5 text-sm text-ink">
            <div
              className={`border-4 p-3 text-xs ${
                chatReady
                  ? "border-green-800 bg-green-50"
                  : "border-amber-700 bg-amber-50"
              }`}
            >
              {chatReady ? (
                <>
                  <strong>Pau puede hablar contigo</strong>
                  {activeSub
                    ? ` usando tu suscripción (${FRIENDLY[activeSub]?.title || activeSub}).`
                    : "."}{" "}
                  No hace falta ninguna “clave secreta”.
                </>
              ) : (
                <>
                  <strong>Aún no hay una cuenta conectada.</strong> Elige abajo
                  la que ya pagas e inicia sesión en el navegador — igual que
                  entrar a Netflix o al correo.
                </>
              )}
            </div>

            <section>
              <h3 className="mb-1 font-semibold">
                1. ¿Qué suscripción quieres usar?
              </h3>
              <p className="mb-3 text-xs text-ink-soft">
                Pau (el Product Owner) y el equipo de programación usan{" "}
                <em>la misma</em> cuenta. Tú solo eliges y entras una vez.
              </p>
              <div className="space-y-2">
                {Object.keys(FRIENDLY).map((id) => {
                  const f = FRIENDLY[id];
                  const det = adapters.find((a) => a.id === id);
                  const selected = form.primaryAdapter === id;
                  return (
                    <div
                      key={id}
                      className={`border-2 p-3 ${
                        selected ? "border-ink bg-sun/40" : "border-ink/25"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="radio"
                            name="adapter"
                            className="mt-1"
                            checked={selected}
                            onChange={() =>
                              setForm({ ...form, primaryAdapter: id })
                            }
                          />
                          <div>
                            <div className="font-semibold">{f.title}</div>
                            <div className="text-xs text-ink-soft">
                              {f.blurb}
                            </div>
                            <div className="mt-1 text-[11px]">
                              {det?.installed ? (
                                <span className="text-green-800">
                                  Instalado en este ordenador ✓
                                </span>
                              ) : (
                                <span className="text-amber-800">
                                  Aún no instalado — al iniciar sesión te
                                  diremos cómo
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                        <button
                          type="button"
                          className="pixel-btn pixel-btn-primary"
                          onClick={() => void login(id)}
                        >
                          Iniciar sesión
                        </button>
                      </div>
                      <div className="mt-1 text-[10px] text-ink-soft">
                        Cuenta: {f.account}
                      </div>
                    </div>
                  );
                })}
              </div>
              {loginMsg && (
                <p className="mt-2 border-2 border-ink bg-sky/15 p-2 text-xs whitespace-pre-wrap">
                  {loginMsg}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-semibold">2. Cómo te habla Pau</h3>
              <select
                className="w-full border-2 border-ink bg-white p-2"
                value={form.introLevel}
                onChange={(e) =>
                  setForm({ ...form, introLevel: e.target.value })
                }
              >
                <option value="guided">
                  Como a un cliente (recomendado) — sin palabras raras
                </option>
                <option value="standard">Normal</option>
                <option value="advanced">Avanzado (más técnico)</option>
              </select>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">
                3. Avisos de “horas de trabajo” (Cursor u otros)
              </h3>
              <p className="mb-2 text-xs text-ink-soft">
                Si tu plan tiene un cupo de horas al día/semana, avísanos para
                no quedarnos a medias. Te avisaremos al 80 % y al 90 %.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Horas del plan (ej. 5)
                  <input
                    type="number"
                    className="mt-1 w-full border-2 border-ink p-2"
                    value={form.cursorHoursLimit}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cursorHoursLimit: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-xs">
                  Horas que llevas usadas
                  <input
                    type="number"
                    step="0.1"
                    className="mt-1 w-full border-2 border-ink p-2"
                    value={form.cursorHoursUsed}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cursorHoursUsed: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <details className="border-2 border-ink/20 p-2">
              <summary
                className="cursor-pointer text-xs text-ink-soft"
                onClick={() => setShowAdvanced(true)}
              >
                Opciones para gente técnica (opcional — puedes ignorar)
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-soft">
                  Solo si alguien de confianza te lo pide. La Agencia normal{" "}
                  <strong>no usa esto</strong>: trabaja con tu suscripción.
                </p>
                <select
                  className="w-full border-2 border-ink bg-white p-2"
                  value={form.harness}
                  onChange={(e) =>
                    setForm({ ...form, harness: e.target.value })
                  }
                >
                  <option value="consultancy">Harness consultora</option>
                </select>
                <select
                  className="w-full border-2 border-ink bg-white p-2"
                  value={form.orchestrator}
                  onChange={(e) =>
                    setForm({ ...form, orchestrator: e.target.value })
                  }
                >
                  <option value="po-techlead">PO → Líder Técnico</option>
                </select>
                <p className="text-[11px] text-ink-soft">
                  Las API keys ya no se guardan en el navegador. Usuarios
                  avanzados pueden usar la variable de entorno
                  LA_AGENCIA_API_KEY durante la sesión.
                </p>
              </div>
            </details>

            {msg && (
              <p className="border-2 border-ink bg-sky/20 p-2 text-xs">{msg}</p>
            )}

            <button
              type="button"
              className="pixel-btn pixel-btn-primary w-full"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar y seguir"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
