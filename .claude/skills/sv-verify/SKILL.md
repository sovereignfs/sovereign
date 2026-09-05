---
name: sv-verify
description: Run Sovereign verification checks for the current task or leg. Use when the user asks to verify, validate, run checks, prepare for PR, or confirm an implementation is ready; reads CURRENT_TASK.md when present and reports structured pass/fail results without raw command dumps.
---

# Sovereign Verify

Run the standard quality checks and return a compact result table.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it.

## Workflow

1. **Read `CURRENT_TASK.md`** if it exists. Note whether the task/leg or the
   diff (`git diff main...HEAD --name-only`) touches: manifest schema or
   permissions; SDK surface; env vars / `.env.example`; `registry/`;
   `packages/ui/src/`; any `plugins/*/app/` file.

2. **Ensure generated files exist.** `pnpm typecheck` fails on a fresh
   checkout with "Cannot find module '@/generated/…'" — that is an
   environment gap, not a code error. Run `pnpm generate` first if
   `runtime/generated/registry.ts` is missing.

3. **Run each check separately** so failures are isolated:

   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm design:tokens:check
   pnpm docs:check-links
   pnpm test
   pnpm build
   ```

   - `pnpm typecheck` never compiles composed plugin route files
     (`runtime/tsconfig.json` excludes them; plugins have no `typecheck`
     script). `pnpm build` is the only check that does, and it also catches
     bundler import-resolution errors — it is required, not optional,
     whenever anything under `plugins/*/app/` or `runtime/app/` changed.
   - `design:tokens:check` is unconditional: it scans `packages/ui/src`,
     `runtime/app`, and `plugins/*/app` for hardcoded colour literals and
     undefined `--sv-*` tokens on every task.
   - `docs:check-links` is in the pre-push hook; running it here surfaces a
     broken link before push instead of after.

4. **Conditional checks:**
   - Manifest / SDK / env changed → docs parity:
     `pnpm exec vitest run runtime/src/__tests__/docs-parity.test.ts`
     (the file lives under `__tests__/`; a filter of `runtime/src/docs-parity`
     matches nothing and silently passes).
   - `packages/ui/src/` changed → `pnpm --filter @sovereignfs/ui typecheck`
     (stories must type-check).
   - `registry/` changed → `pnpm registry:check`.
   - A new regression test → confirm it fails against the pre-fix code
     (`git stash` the fix, run it, `git stash pop`). A test that never failed
     proves nothing.

5. **Version-doc sync (unconditional):**

   ```bash
   grep -m1 '"version"' package.json
   grep -m1 '"version"' runtime/package.json
   grep -n '^Current platform version:' CLAUDE.md
   grep -n '^\*\*Version:\*\*' ROADMAP.md
   git diff main...HEAD -- package.json runtime/package.json
   ```

   - If root `package.json` changed on this branch, its version must appear in
     `CLAUDE.md`'s `Current platform version:` line and `ROADMAP.md`'s
     `**Version:**` header.
   - If `runtime/package.json` changed, the new version must have a row in
     `docs/upgrade.md`'s `## Runtime version map`.
   - A mismatch is a **FAIL** here; `sv-update-task-docs` is what fixes it —
     do not edit docs mid-verify.

6. **Report only this table plus concise failure details:**

   ```markdown
   ## Verification Results

   | Check                  | Result  | Notes        |
   | ---------------------- | ------- | ------------ |
   | format:check           | ✅ PASS | —            |
   | lint                   | ✅ PASS | —            |
   | typecheck              | ✅ PASS | —            |
   | design:tokens:check    | ✅ PASS | —            |
   | docs:check-links       | ✅ PASS | —            |
   | test                   | ✅ PASS | 3222 passed  |
   | build                  | ✅ PASS | —            |
   | docs-parity            | skipped | not relevant |
   | ui typecheck           | skipped | not relevant |
   | registry:check         | skipped | not relevant |
   | regression-fails-first | ✅ PASS | <test name>  |
   | version-doc sync       | ✅ PASS | —            |

   **Overall:** ✅ All checks pass
   ```

   For a failure, add a `Failures` section with the command, file/line, and
   the smallest useful error excerpt — never full compiler/test/build logs.
   If a command cannot run (missing dependency, Docker not running, no
   Postgres for `.pg.test.ts`), report it as **BLOCKED** with the exact
   command and reason, not as a pass.

## Notes

- Never claim a task complete while a required check fails or is blocked.
- Running `pnpm test` alongside a live dev server can produce
  resource-contention flakes; re-run a lone failure in isolation before
  treating it as real.
