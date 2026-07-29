// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * Bundles the Hono runtime into a self-contained Node sidecar for Tauri.
 *
 * The command intentionally builds only the current target. Release CI runs it
 * independently on macOS, Linux and Windows before packaging each installer.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(root, "apps", "desktop");
const buildRoot = join(desktopRoot, ".sidecar-build");
const binariesRoot = join(desktopRoot, "src-tauri", "binaries");
const bundlePath = join(buildRoot, "agency-runtime.cjs");
const executableExtension = process.platform === "win32" ? ".exe" : "";
const temporaryExecutable = join(
  buildRoot,
  `agency-runtime${executableExtension}`,
);

function hostTriple() {
  try {
    return execFileSync("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
    }).trim();
  } catch {
    const verbose = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
    const match = verbose.match(/^host:\s+(\S+)/m);
    if (!match) throw new Error("Unable to determine the Rust host triple");
    return match[1];
  }
}

function pkgTarget(triple) {
  const architecture = triple.startsWith("aarch64")
    ? "arm64"
    : triple.startsWith("x86_64")
      ? "x64"
      : null;
  const platform = triple.includes("apple-darwin")
    ? "macos"
    : triple.includes("windows")
      ? "win"
      : triple.includes("linux")
        ? "linux"
        : null;
  if (!architecture || !platform) {
    throw new Error(`Unsupported desktop target: ${triple}`);
  }
  return `node22-${platform}-${architecture}`;
}

const triple = hostTriple();
const targetPath = join(
  binariesRoot,
  `agency-runtime-${triple}${executableExtension}`,
);

mkdirSync(buildRoot, { recursive: true });
mkdirSync(binariesRoot, { recursive: true });

await build({
  entryPoints: [join(root, "apps", "server", "dist", "index.js")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
  banner: {
    js: "/* SPDX-FileCopyrightText: 2026 La Agencia contributors\\n * SPDX-License-Identifier: MIT\\n */",
  },
});

const pkgCli = join(
  root,
  "node_modules",
  "@yao-pkg",
  "pkg",
  "lib-es5",
  "bin.js",
);
execFileSync(
  process.execPath,
  [
    pkgCli,
    bundlePath,
    "--target",
    pkgTarget(triple),
    "--output",
    temporaryExecutable,
    "--compress",
    "Brotli",
  ],
  { cwd: root, stdio: "inherit" },
);
copyFileSync(temporaryExecutable, targetPath);
if (process.platform !== "win32") chmodSync(targetPath, 0o755);

console.log(`Sidecar ready: ${targetPath}`);
