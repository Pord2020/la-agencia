// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Day spend panel — subscription transparency, not a bill.
 */

import { useEffect, useState } from "react";

interface DayCost {
  plainSummary: string;
  estimatedUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byAgent: Array<{
    label: string;
    calls: number;
    estimatedUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export function CostPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<DayCost | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/cost/today")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="pixel-panel w-full max-w-lg max-h-[85vh] overflow-auto p-5 text-ink">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-pixel text-[10px]">Gasto de la jornada</h2>
          <button type="button" className="pixel-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {!data ? (
          <p className="text-sm text-ink-soft">Cargando…</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed mb-3">{data.plainSummary}</p>
            <div className="border-2 border-ink bg-sun/30 p-3 mb-3 text-center">
              <div className="text-xs text-ink-soft">
                Equivalente API (estimado)
              </div>
              <div className="font-pixel text-lg">
                ${data.estimatedUsd.toFixed(2)}
              </div>
              <div className="text-[10px] text-ink-soft mt-1">
                No es un cobro extra: pagas tu suscripción fija.
              </div>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th className="py-1">Quién</th>
                  <th>Llamadas</th>
                  <th>Tokens</th>
                  <th>≈ USD</th>
                </tr>
              </thead>
              <tbody>
                {data.byAgent.map((a) => (
                  <tr key={a.label} className="border-b border-ink/20">
                    <td className="py-1 font-semibold">{a.label}</td>
                    <td>{a.calls}</td>
                    <td>{a.inputTokens + a.outputTokens}</td>
                    <td>${a.estimatedUsd.toFixed(2)}</td>
                  </tr>
                ))}
                {!data.byAgent.length && (
                  <tr>
                    <td colSpan={4} className="py-2 text-ink-soft">
                      Aún no hay actividad de modelos hoy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
