<!-- SPDX-FileCopyrightText: 2026 La Agencia contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Code style — La Agencia

This repository is public and intended for community contribution and
write-ups on X. Code quality is a product requirement, not a nicety.

## Principles

1. **Clarity over cleverness.** Prefer a boring, readable solution.
2. **Document the “why”.** Comments explain non-obvious decisions, invariants,
   and No-TI product constraints — not what the next line does.
3. **No slop.** No placeholder stubs left in production paths, no `any` without
   a comment, no dead code, no “TODO: fix later” without an issue id.
4. **Original work.** Ideas may be inspired by other agent products; never
   copy their source, assets, or GPL-licensed material (MIT only).
5. **No-TI first.** User-facing strings avoid jargon. Technical detail belongs
   in advanced settings or server logs.

## TypeScript

- Strict mode always.
- Named exports preferred for library modules.
- Every public function on a module boundary gets a short JSDoc block.
- Prefer explicit types on exported APIs (`packages/shared`).

## File headers

Core modules start with a brief file-level comment:

```ts
/**
 * @module costLedger
 * Tracks estimated token usage and subscription-equivalent spend for the day.
 * Numbers are estimates for transparency — the user pays a flat subscription.
 */
```

## Comments policy

**Do write:**
- Product invariants (“User never sees port numbers”).
- Security notes (“Never log API keys”).
- Non-obvious algorithms (path BFS, queue recovery).

**Do not write:**
- Narration (`// increment i`).
- Emoji spam or meme comments.
- Outdated comments that lie.

## Commits & PRs

- Small, focused changes.
- PR description: what / why / how to test.
- Screenshots for UI changes when possible.
