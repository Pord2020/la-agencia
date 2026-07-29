// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { watchParentProcess } from "./parentWatchdog.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("parent watchdog", () => {
  it("stops the embedded runtime once its supervisor disappears", () => {
    vi.useFakeTimers();
    const onMissing = vi.fn();
    const stop = watchParentProcess(42, onMissing, 100, () => false);

    vi.advanceTimersByTime(100);

    expect(onMissing).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not stop while the supervisor is alive and supports cancellation", () => {
    vi.useFakeTimers();
    const onMissing = vi.fn();
    const stop = watchParentProcess(42, onMissing, 100, () => true);

    vi.advanceTimersByTime(300);
    stop();
    vi.advanceTimersByTime(300);

    expect(onMissing).not.toHaveBeenCalled();
  });

  it("rejects unsafe identifiers and intervals", () => {
    expect(() => watchParentProcess(1, vi.fn())).toThrow(/Parent PID/);
    expect(() => watchParentProcess(42, vi.fn(), 10)).toThrow(/interval/);
  });
});
