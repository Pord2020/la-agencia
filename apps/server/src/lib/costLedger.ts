// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module costLedger
 * Persistent day ledger of estimated token usage.
 *
 * We never claim this is a bill. It answers: “How hard did the team work today,
 * and what would that cost at public API list prices?”
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  buildDayReport,
  type DayCostReport,
  type TokenUsageSample,
} from "@la-agencia/shared";
import { CONFIG_DIR, ensureDir } from "./paths.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function ledgerPath(date = todayKey()): string {
  ensureDir(CONFIG_DIR);
  const dir = join(CONFIG_DIR, "cost");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${date}.json`);
}

function loadSamples(date = todayKey()): TokenUsageSample[] {
  return readJson(
    ledgerPath(date),
    z.array(
      z.custom<TokenUsageSample>((value) =>
        Boolean(value && typeof value === "object"),
      ),
    ),
    [],
  );
}

function saveSamples(samples: TokenUsageSample[], date = todayKey()) {
  writeJsonAtomic(ledgerPath(date), samples);
}

/**
 * Record a model call. When true token counts are unknown (CLI subscriptions),
 * pass honest estimates based on prompt/response length.
 */
export function recordUsage(
  sample: Omit<TokenUsageSample, "at"> & { at?: string },
): DayCostReport {
  const date = todayKey();
  const samples = loadSamples(date);
  samples.push({
    ...sample,
    at: sample.at ?? new Date().toISOString(),
  });
  saveSamples(samples, date);
  return buildDayReport(date, samples);
}

/** Approximate tokens from text length (4 chars ≈ 1 token). Explicitly labeled as estimate. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function getDayCostReport(date = todayKey()): DayCostReport {
  return buildDayReport(date, loadSamples(date));
}
