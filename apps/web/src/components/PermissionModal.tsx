// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Permission gate for the human client.
 * Default recommendation for No-TI users: let the team work.
 */

export interface PermissionPayload {
  id: string;
  title: string;
  summary: string;
  technicalDetail?: string;
  recommended: string;
  kind: string;
  riskLevel: string;
  expiresAt: string;
}

export function PermissionModal({
  request,
  onResolve,
}: {
  request: PermissionPayload;
  onResolve: (
    decision: "allow_once" | "deny" | "allow_project_session",
  ) => void;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="pixel-panel w-full max-w-md p-5 text-ink">
        <div className="font-pixel text-[10px] mb-2">Permiso del equipo</div>
        <h3 className="text-base font-semibold mb-2">{request.title}</h3>
        <p className="text-sm leading-relaxed mb-3">{request.summary}</p>
        <p className="text-xs text-ink-soft mb-4 border-2 border-ink/15 bg-cream-dark/50 p-2">
          {request.riskLevel === "critical"
            ? "Esta acción tiene impacto externo o irreversible. Permítela solo si revisaste el detalle."
            : "Puedes permitir solo esta acción o confiar este tipo de trabajo al proyecto durante la sesión."}
        </p>
        {request.technicalDetail && (
          <details className="mb-3 text-xs text-ink-soft">
            <summary className="cursor-pointer">
              Detalle técnico (opcional)
            </summary>
            <pre className="mt-1 whitespace-pre-wrap break-all">
              {request.technicalDetail}
            </pre>
          </details>
        )}
        <div className="flex flex-col gap-2">
          {request.riskLevel !== "critical" && request.riskLevel !== "high" && (
            <button
              type="button"
              className="pixel-btn pixel-btn-primary w-full"
              onClick={() => onResolve("allow_project_session")}
            >
              Confiar este tipo de trabajo durante la sesión
            </button>
          )}
          <button
            type="button"
            className="pixel-btn w-full"
            onClick={() => onResolve("allow_once")}
          >
            Permitir solo esta vez
          </button>
          <button
            type="button"
            className="pixel-btn w-full"
            onClick={() => onResolve("deny")}
          >
            No, detener
          </button>
        </div>
      </div>
    </div>
  );
}
