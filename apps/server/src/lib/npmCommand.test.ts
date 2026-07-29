// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { npmCommand } from "./npmCommand.js";

describe("npm command", () => {
  it("invokes npm directly on POSIX", () => {
    expect(npmCommand(["run", "test"], "linux")).toEqual({
      bin: "npm",
      args: ["run", "test"],
      printable: "npm run test",
    });
  });

  it("uses the Windows command interpreter for the npm shim", () => {
    expect(
      npmCommand(["run", "build"], "win32", "C:\\Windows\\System32\\cmd.exe"),
    ).toEqual({
      bin: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "build"],
      printable: "npm run build",
    });
  });

  it("falls back to cmd.exe when ComSpec is unavailable", () => {
    expect(npmCommand(["run", "dev"], "win32", "").bin).toBe("cmd.exe");
  });
});
