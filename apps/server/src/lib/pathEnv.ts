// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

/** Directories where coding CLIs commonly live (macOS + Linux). */
export function extraBinDirs(): string[] {
  const h = homedir();
  return [
    join(h, ".local", "bin"),
    join(h, ".grok", "bin"),
    join(h, ".npm-global", "bin"),
    join(h, ".cargo", "bin"),
    join(h, "Library", "pnpm"),
    join(h, ".antigravity", "antigravity", "bin"),
    join(h, ".antigravity-ide", "antigravity-ide", "bin"),
    "/Applications/Cursor.app/Contents/Resources/app/bin",
    "/Applications/Claude.app/Contents/MacOS",
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ].filter((d) => existsSync(d));
}

/** Ensure child processes and `which` see user-installed tools. */
export function enrichPath() {
  const parts = new Set(
    `${process.env.PATH || ""}:${extraBinDirs().join(":")}`
      .split(":")
      .filter(Boolean),
  );
  process.env.PATH = [...parts].join(":");
}

export function candidatePaths(binNames: string[]): string[] {
  const h = homedir();
  const out: string[] = [];
  for (const bin of binNames) {
    out.push(bin); // bare name via PATH
    for (const dir of extraBinDirs()) {
      out.push(join(dir, bin));
    }
    // App-bundle specific
    if (bin === "cursor") {
      out.push("/Applications/Cursor.app/Contents/Resources/app/bin/cursor");
    }
    if (bin === "claude") {
      out.push(join(h, ".local", "bin", "claude"));
      out.push(
        join(
          h,
          "Library",
          "Application Support",
          "Claude",
          "claude-code-vm",
          "2.1.209",
          "claude",
        ),
      );
    }
    if (bin === "codex") {
      out.push(join(h, ".npm-global", "bin", "codex"));
    }
    if (bin === "agy" || bin === "antigravity") {
      out.push(join(h, ".antigravity", "antigravity", "bin", "agy"));
      out.push(join(h, ".antigravity", "antigravity", "bin", "antigravity"));
      out.push(
        join(h, ".antigravity-ide", "antigravity-ide", "bin", "agy-ide"),
      );
    }
    if (bin === "kimi") {
      out.push("/Applications/Kimi.app/Contents/MacOS/Kimi");
    }
  }
  return out;
}

export const MAC_APPS: Record<string, string[]> = {
  "claude-code": ["/Applications/Claude.app"],
  cursor: ["/Applications/Cursor.app"],
  codex: ["/Applications/ChatGPT.app"],
  kimi: ["/Applications/Kimi.app"],
  antigravity: [
    "/Applications/Antigravity.app",
    "/Applications/Antigravity IDE.app",
  ],
  "grok-build": [],
};
