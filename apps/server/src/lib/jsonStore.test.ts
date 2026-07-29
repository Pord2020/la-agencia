// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

describe("jsonStore", () => {
  it("returns the fallback when no valid state exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "json-store-"));
    const missing = join(directory, "missing.json");
    expect(
      readJson(missing, z.object({ value: z.number() }), { value: 0 }),
    ).toEqual({
      value: 0,
    });
    writeFileSync(missing, "{broken", "utf8");
    expect(
      readJson(missing, z.object({ value: z.number() }), { value: 0 }),
    ).toEqual({
      value: 0,
    });
    writeFileSync(`${missing}.bak`, "{also-broken", "utf8");
    expect(
      readJson(missing, z.object({ value: z.number() }), { value: 0 }),
    ).toEqual({
      value: 0,
    });
  });

  it("writes valid JSON and preserves a recoverable backup", () => {
    const directory = mkdtempSync(join(tmpdir(), "json-store-"));
    const file = join(directory, "state.json");
    writeJsonAtomic(file, { value: 1 });
    writeJsonAtomic(file, { value: 2 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ value: 2 });
    expect(JSON.parse(readFileSync(`${file}.bak`, "utf8"))).toEqual({
      value: 1,
    });
  });

  it("recovers from the backup when the primary file is corrupted", () => {
    const directory = mkdtempSync(join(tmpdir(), "json-store-"));
    const file = join(directory, "state.json");
    writeJsonAtomic(file, { value: 1 });
    writeJsonAtomic(file, { value: 2 });
    writeFileSync(file, "{broken", "utf8");
    expect(
      readJson(file, z.object({ value: z.number() }), { value: 0 }),
    ).toEqual({
      value: 1,
    });
  });
});
