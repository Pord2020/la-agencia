// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module fakeAdapter
 * Deterministic, network-free adapter available exclusively to automated tests.
 */

export function fakeAdapterEnabled(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.LA_AGENCIA_FAKE_ADAPTER === "1"
  );
}

export function fakeCodingResult(prompt: string): string {
  return JSON.stringify({
    adapter: "fake",
    ok: true,
    promptCharacters: prompt.length,
  });
}
