// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Builds a package-manager invocation that works without a shell on POSIX and
 * through the system command interpreter on Windows, where npm is a `.cmd`
 * shim. All callers must pass fixed, internally generated arguments.
 */
export function npmCommand(
  args: string[],
  platform = process.platform,
  commandInterpreter = process.env.ComSpec,
): { bin: string; args: string[]; printable: string } {
  const printable = ["npm", ...args].join(" ");
  if (platform === "win32") {
    return {
      bin: commandInterpreter || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
      printable,
    };
  }
  return { bin: "npm", args, printable };
}
