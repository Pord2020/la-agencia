// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildDayReport,
  DEFAULT_TOKEN_PRICES_USD,
  estimateUsd,
  type TokenUsageSample,
} from "./cost.js";

function sample(
  outcome: TokenUsageSample["outcome"],
  agentId: string,
  inputTokens: number,
  outputTokens: number,
): TokenUsageSample {
  return {
    agentId,
    label: agentId.toUpperCase(),
    inputTokens,
    outputTokens,
    durationMs: 10,
    at: "2026-07-29T00:00:00.000Z",
    source: "verification",
    estimated: true,
    outcome,
  };
}

describe("cost reporting", () => {
  it("returns an honest empty-day explanation", () => {
    const report = buildDayReport("2026-07-29", []);
    expect(report.samples).toBe(0);
    expect(report.estimatedUsd).toBe(0);
    expect(report.plainSummary).toContain("aún no");
  });

  it("aggregates success, failure and cancellation by agent", () => {
    const report = buildDayReport("2026-07-29", [
      sample("success", "alex", 1_000_000, 0),
      sample("failed", "alex", 0, 1_000_000),
      sample("cancelled", "sam", 500_000, 500_000),
    ]);
    expect(report.estimatedUsd).toBe(
      estimateUsd(1_500_000, 1_500_000, DEFAULT_TOKEN_PRICES_USD),
    );
    expect(report.byAgent[0]).toMatchObject({
      agentId: "alex",
      calls: 2,
      failedCalls: 1,
      cancelledCalls: 0,
    });
    expect(report.byAgent[1]).toMatchObject({
      agentId: "sam",
      calls: 1,
      failedCalls: 0,
      cancelledCalls: 1,
    });
    expect(report.plainSummary).toContain("suscripción");
  });
});
