// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { getDayCostReport, recordUsage } from "./costLedger.js";

describe("cost ledger", () => {
  it("counts successful, failed and cancelled invocations honestly", () => {
    const agentId = `ledger-${Date.now()}`;
    for (const outcome of ["success", "failed", "cancelled"] as const) {
      recordUsage({
        agentId,
        label: "Ledger fixture",
        inputTokens: 100,
        outputTokens: 25,
        durationMs: 10,
        adapterId: "codex",
        source: "coding",
        estimated: true,
        outcome,
        errorCode: outcome === "success" ? undefined : outcome.toUpperCase(),
      });
    }

    const report = getDayCostReport();
    const summary = report.byAgent.find((entry) => entry.agentId === agentId);
    expect(summary).toMatchObject({
      calls: 3,
      failedCalls: 1,
      cancelledCalls: 1,
      inputTokens: 300,
      outputTokens: 75,
    });
    expect(report.samples).toBeGreaterThanOrEqual(3);
    expect(report.estimatedUsd).toBeGreaterThan(0);
  });
});
