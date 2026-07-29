// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fakeAdapterEnabled, fakeCodingResult } from "./fake.js";

describe("fake adapter", () => {
  it("is deterministic and test-only", () => {
    process.env.NODE_ENV = "test";
    process.env.LA_AGENCIA_FAKE_ADAPTER = "1";
    expect(fakeAdapterEnabled()).toBe(true);
    expect(fakeCodingResult("same")).toBe(fakeCodingResult("same"));
  });
});
