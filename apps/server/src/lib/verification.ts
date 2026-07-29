// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module verification
 * Evidence-producing project checks executed independently from coding jobs.
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SprintTask } from "@la-agencia/shared";
import { assertSafeWorkspace, ensureDir } from "./paths.js";
import { estimateTokensFromText, recordUsage } from "./costLedger.js";

const execFileAsync = promisify(execFile);

interface VerificationCommand {
  bin: string;
  args: string[];
  label: string;
}

function detectCommands(workspace: string): VerificationCommand[] {
  const packageFile = join(workspace, "package.json");
  if (existsSync(packageFile)) {
    try {
      const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const commands: VerificationCommand[] = [];
      if (pkg.scripts?.typecheck) {
        commands.push({
          bin: "npm",
          args: ["run", "typecheck"],
          label: "Typecheck",
        });
      }
      if (pkg.scripts?.test) {
        const extra = /vitest/.test(pkg.scripts.test) ? ["--", "--run"] : [];
        commands.push({
          bin: "npm",
          args: ["run", "test", ...extra],
          label: "Tests",
        });
      }
      if (pkg.scripts?.build) {
        commands.push({ bin: "npm", args: ["run", "build"], label: "Build" });
      }
      return commands;
    } catch {
      return [];
    }
  }
  if (existsSync(join(workspace, "Cargo.toml"))) {
    return [
      { bin: "cargo", args: ["check"], label: "Cargo check" },
      { bin: "cargo", args: ["test"], label: "Cargo tests" },
    ];
  }
  return [];
}

/** Executes detectable checks and returns durable evidence for the sprint. */
export async function verifyWorkspace(input: {
  projectId: string;
  workspace: string;
  sprintNumber: number;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; evidence: NonNullable<SprintTask["evidence"]> }> {
  const workspace = assertSafeWorkspace(input.workspace);
  const commands = detectCommands(workspace);
  const reportsDir = join(workspace, ".agency", "verification");
  ensureDir(reportsDir);
  const evidence: NonNullable<SprintTask["evidence"]> = [];

  if (!commands.length) {
    evidence.push({
      kind: "log",
      ok: false,
      summary: "No se detectó ningún comando de test, typecheck o build.",
    });
    return { ok: false, evidence };
  }

  for (const [index, command] of commands.entries()) {
    const startedAt = Date.now();
    const printable = [command.bin, ...command.args].join(" ");
    const logPath = join(
      reportsDir,
      `sprint-${input.sprintNumber}-${index + 1}-${command.label.toLowerCase().replace(/\W+/g, "-")}.log`,
    );
    try {
      const { stdout, stderr } = await execFileAsync(
        command.bin,
        command.args,
        {
          cwd: workspace,
          timeout: 5 * 60_000,
          maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, CI: "true" },
          signal: input.signal,
        },
      );
      const output = `${stdout}\n${stderr}`.trim();
      writeFileSync(logPath, `${output}\n`, "utf8");
      recordUsage({
        agentId: "qa-verifier",
        label: "QA Verifier",
        inputTokens: estimateTokensFromText(printable),
        outputTokens: estimateTokensFromText(output),
        durationMs: Date.now() - startedAt,
        source: "verification",
        estimated: true,
        outcome: "success",
      });
      evidence.push({
        kind: "command",
        command: printable,
        path: logPath,
        ok: true,
        summary: `${command.label} pasó correctamente.`,
      });
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error);
      writeFileSync(logPath, `${output}\n`, "utf8");
      recordUsage({
        agentId: "qa-verifier",
        label: "QA Verifier",
        inputTokens: estimateTokensFromText(printable),
        outputTokens: estimateTokensFromText(output),
        durationMs: Date.now() - startedAt,
        source: "verification",
        estimated: true,
        outcome: input.signal?.aborted ? "cancelled" : "failed",
        errorCode: input.signal?.aborted ? "CANCELLED" : "VERIFICATION_FAILED",
      });
      evidence.push({
        kind: "command",
        command: printable,
        path: logPath,
        ok: false,
        summary: `${command.label} falló.`,
      });
      return { ok: false, evidence };
    }
  }

  return { ok: true, evidence };
}

/** Persists a reviewable wireframe artifact for a sprint. */
export function createWireframeArtifact(input: {
  workspace: string;
  sprintNumber: number;
  goal: string;
}): string {
  const workspace = assertSafeWorkspace(input.workspace);
  const artifactDir = join(workspace, ".agency", "artifacts");
  ensureDir(artifactDir);
  const path = join(artifactDir, `sprint-${input.sprintNumber}-wireframe.md`);
  const markdown = [
    `# Wireframe · Sprint ${input.sprintNumber}`,
    "",
    `Goal: ${input.goal}`,
    "",
    "```mermaid",
    "flowchart TD",
    '  Start["Inicio"] --> Main["Pantalla principal"]',
    '  Main --> Action["Acción principal"]',
    '  Action --> Success["Estado de éxito"]',
    '  Action --> Error["Estado de error y recuperación"]',
    "```",
    "",
    "## Acceptance notes",
    "",
    "- The primary action must be visible without technical knowledge.",
    "- Success and failure states must explain the next step.",
    "- Keyboard navigation and readable contrast are required.",
    "",
  ].join("\n");
  writeFileSync(path, markdown, "utf8");
  return path;
}
