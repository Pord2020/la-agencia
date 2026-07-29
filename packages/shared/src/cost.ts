// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module cost
 * Transparent “what would this have cost via API?” ledger.
 *
 * Users typically pay a flat subscription (e.g. $20 or $100/mo). We still show
 * estimated token usage and a notional USD amount so they understand intensity
 * of work — not a bill.
 */

export type CostAgentKey = string;

/** Rough public list prices (USD per 1M tokens). Adjustable in settings later. */
export const DEFAULT_TOKEN_PRICES_USD = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
} as const;

export interface TokenUsageSample {
  agentId: CostAgentKey;
  /** Logical role label for the UI (Pau, Alex, …). */
  label: string;
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock ms spent in the model call. */
  durationMs: number;
  at: string;
  /** Which subscription adapter ran the work. */
  adapterId?: string;
  source: "chat" | "planning" | "coding" | "verification";
  estimated: boolean;
  outcome: "success" | "failed" | "cancelled";
  errorCode?: string;
}

export interface AgentCostSummary {
  agentId: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  failedCalls: number;
  cancelledCalls: number;
  /** Notional API cost in USD. */
  estimatedUsd: number;
}

export interface DayCostReport {
  date: string;
  samples: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedUsd: number;
  byAgent: AgentCostSummary[];
  /** Copy-ready explanation for No-TI clients. */
  plainSummary: string;
}

export function estimateUsd(
  inputTokens: number,
  outputTokens: number,
  prices = DEFAULT_TOKEN_PRICES_USD,
): number {
  return (
    (inputTokens / 1_000_000) * prices.inputPerMillion +
    (outputTokens / 1_000_000) * prices.outputPerMillion
  );
}

export function buildDayReport(
  date: string,
  samples: TokenUsageSample[],
  prices = DEFAULT_TOKEN_PRICES_USD,
): DayCostReport {
  const map = new Map<string, AgentCostSummary>();
  let totalIn = 0;
  let totalOut = 0;

  for (const s of samples) {
    totalIn += s.inputTokens;
    totalOut += s.outputTokens;
    const cur = map.get(s.agentId) ?? {
      agentId: s.agentId,
      label: s.label,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      failedCalls: 0,
      cancelledCalls: 0,
      estimatedUsd: 0,
    };
    cur.inputTokens += s.inputTokens;
    cur.outputTokens += s.outputTokens;
    cur.calls += 1;
    if (s.outcome === "failed") cur.failedCalls += 1;
    if (s.outcome === "cancelled") cur.cancelledCalls += 1;
    cur.estimatedUsd = estimateUsd(cur.inputTokens, cur.outputTokens, prices);
    map.set(s.agentId, cur);
  }

  const estimatedUsd = estimateUsd(totalIn, totalOut, prices);
  const plainSummary =
    samples.length === 0
      ? "Hoy el equipo aún no ha consumido trabajo de modelos."
      : `Hoy el equipo usó ~${Math.round((totalIn + totalOut) / 1000)} mil tokens. ` +
        `Si esto se cobrara por API, serían unos $${estimatedUsd.toFixed(2)} USD. ` +
        `Con tu suscripción pagas una cuota fija; esta cifra solo muestra la intensidad del trabajo.`;

  return {
    date,
    samples: samples.length,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    estimatedUsd,
    byAgent: [...map.values()].sort((a, b) => b.estimatedUsd - a.estimatedUsd),
    plainSummary,
  };
}
