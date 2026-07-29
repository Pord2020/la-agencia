<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Architecture

La Agencia is a local-first monorepo with four distributable layers:

- `apps/web`: React office UI with Spanish/English copy.
- `apps/server`: importable Hono application plus a thin process bootstrap.
- `packages/shared`: versioned contracts, settings, permissions and cost types.
- `apps/desktop`: experimental Tauri supervisor for the same web/server runtime.

The stable v0.4 path is `consultancy + po-techlead`. Roadmap harnesses,
orchestrators, MCP execution, triggers and real multi-office routing are not
advertised as capabilities.

## Execution flow

1. A sprint run creates a persisted idempotent operation in
   `waiting_permission`.
2. A scoped, expiring permission can move it to `queued`; denial or expiry
   starts no process.
3. The worker serializes work per project and moves through `running` and
   `verifying`.
4. Autonomous Codex coding runs against a bounded staged copy. Safe additions
   and modifications are applied with atomic writes; deletion and concurrent
   source changes are blocked.
5. An independent verifier detects and runs test, typecheck and build commands
   with bounded logs. Missing or failed evidence blocks the sprint.
6. The human explicitly chooses `approve` or `request_changes`.

## Trust boundaries

The API is loopback-only, uses an HttpOnly bootstrap session and validates
browser origin. All payloads use Zod. Imported paths are canonical directories
and cannot be root, HOME or symlink escapes. Chat runs in an empty temporary
directory. Secrets are read from environment/session memory and are not
persisted in `config.json`.

Resource acquisition is separate from indexing. It requires one-time
permission, isolated public Git transport, an immutable commit, content and
license scanning, read-only version storage and hash-checked rollback.

Local previews use runtime-assigned ports. Public sharing is a distinct,
critical permission with visible expiry and explicit revocation.

## Persistence

Settings and projects have `schemaVersion` and explicit migrations. JSON writes
use temporary files, fsync and rename, with corrupt-source backups. Project
mutations are serialized. Operations, permissions, evidence, resource versions
and the cost ledger survive process restarts.
