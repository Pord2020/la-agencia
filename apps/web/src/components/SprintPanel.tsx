// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import type { PreviewDTO, ProjectDTO, SprintDTO } from "../lib/api";
import { t, type Locale } from "../lib/i18n";

export function SprintPanel({
  project,
  locale,
  onPlan,
  onRun,
  onFeedback,
  preview,
  onStartPreview,
  onSharePreview,
  onStopShare,
  busy,
}: {
  project: ProjectDTO;
  locale: Locale;
  onPlan: () => void;
  onRun: (sprintId: string) => void;
  onFeedback: (
    sprintId: string,
    decision: "approve" | "request_changes",
    comment: string,
  ) => void;
  preview: PreviewDTO | null;
  onStartPreview: () => void;
  onSharePreview: () => void;
  onStopShare: () => void;
  busy: boolean;
}) {
  const epics = project.epics || [];
  const currentEpic = epics.find((e) => e.status === "doing") || epics[0];
  const epicSprints = project.sprints.filter(
    (s) => !currentEpic || s.epicId === currentEpic?.id || !s.epicId,
  );
  const latest = project.sprints[project.sprints.length - 1] as
    SprintDTO | undefined;

  return (
    <div className="pixel-panel flex h-full flex-col overflow-hidden text-ink">
      <div className="border-b-4 border-ink bg-cream-dark px-3 py-2 font-pixel text-[9px]">
        {t(locale, "sprints")}
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
        {/* Epic progress checks */}
        {currentEpic && (
          <div className="border-2 border-ink p-2 bg-cream-dark/40">
            <div className="text-xs font-semibold">
              {t(locale, "epic")} {currentEpic.order}: {currentEpic.title}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(epicSprints.length ? epicSprints : project.sprints).map((s) => {
                const done = s.status === "done";
                const active = s.status === "running" || s.status === "review";
                return (
                  <div
                    key={s.id}
                    title={s.goal}
                    className={`flex h-7 w-7 items-center justify-center border-2 border-ink text-[10px] font-bold ${
                      done
                        ? "bg-green-300 line-through"
                        : active
                          ? "bg-sun animate-pulse"
                          : "bg-white"
                    }`}
                  >
                    {done ? "✓" : s.number}
                  </div>
                );
              })}
              {!project.sprints.length && (
                <span className="text-xs text-ink-soft">—</span>
              )}
            </div>
            {latest && (
              <div className="mt-1 text-[11px] text-ink-soft">
                {t(locale, "sprintOf")} {latest.number}
                {epicSprints.length > 0
                  ? ` ${t(locale, "of")} ~${Math.max(epicSprints.length, latest.number)}`
                  : ""}
                : {latest.goal.slice(0, 60)}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="pixel-btn pixel-btn-primary w-full"
          disabled={busy}
          onClick={onPlan}
        >
          {t(locale, "planSprint")}
        </button>

        <div className="border-2 border-ink p-2 text-[11px]">
          <div className="mb-1 font-semibold">
            {locale === "en" ? "Safe preview" : "Preview segura"}
          </div>
          {!preview ? (
            <button
              type="button"
              className="pixel-btn w-full text-[7px]"
              disabled={busy}
              onClick={onStartPreview}
            >
              {locale === "en" ? "Start local preview" : "Abrir preview local"}
            </button>
          ) : (
            <>
              <a
                className="block break-all text-blue-700 underline"
                href={preview.publicUrl || preview.localUrl}
                target="_blank"
                rel="noreferrer"
              >
                {preview.publicUrl || preview.localUrl}
              </a>
              {preview.mode === "shared" ? (
                <>
                  <div className="my-1 text-ink-soft">
                    {locale === "en" ? "Public until" : "Pública hasta"}{" "}
                    {preview.shareExpiresAt
                      ? new Date(preview.shareExpiresAt).toLocaleTimeString()
                      : "—"}
                  </div>
                  <button
                    type="button"
                    className="pixel-btn w-full text-[7px]"
                    onClick={onStopShare}
                  >
                    {locale === "en"
                      ? "Close public link"
                      : "Cerrar enlace público"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="pixel-btn w-full text-[7px]"
                  onClick={onSharePreview}
                >
                  {locale === "en"
                    ? "Share for 30 minutes"
                    : "Compartir por 30 minutos"}
                </button>
              )}
            </>
          )}
        </div>

        {project.sprints
          .slice()
          .reverse()
          .map((s) => (
            <div key={s.id} className="border-2 border-ink p-2">
              <div className="font-semibold text-xs">
                #{s.number}{" "}
                <span
                  className={
                    s.status === "done"
                      ? "line-through text-green-800"
                      : s.status === "running"
                        ? "text-amber-800"
                        : ""
                  }
                >
                  {s.goal}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px]">
                {s.tasks.map((task) => (
                  <li key={task.id} className="flex gap-1">
                    <span>
                      {task.status === "done"
                        ? "☑"
                        : task.status === "doing"
                          ? "◐"
                          : task.status === "blocked"
                            ? "☒"
                            : "☐"}
                    </span>
                    <span
                      className={
                        task.status === "done" ? "line-through opacity-70" : ""
                      }
                    >
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
              {s.reportPath && (
                <div className="mt-1 text-[10px] text-ink-soft">
                  📄 {s.reportPath}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {s.status === "planned" && (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-primary text-[7px]"
                    disabled={busy}
                    onClick={() => onRun(s.id)}
                  >
                    {t(locale, "runSprint")}
                  </button>
                )}
                {(s.status === "review" || s.status === "running") && (
                  <>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-primary text-[7px]"
                      disabled={busy}
                      onClick={() =>
                        onFeedback(s.id, "approve", "Todo bien, aprobamos.")
                      }
                    >
                      {t(locale, "approve")}
                    </button>
                    <button
                      type="button"
                      className="pixel-btn text-[7px]"
                      disabled={busy}
                      onClick={() =>
                        onFeedback(
                          s.id,
                          "request_changes",
                          "Necesitamos cambios.",
                        )
                      }
                    >
                      {t(locale, "changes")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
