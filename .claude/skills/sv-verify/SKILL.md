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
   diff (`git diff main...HEAD --name-only`) touches: `spec/core-api/` or an
   API route; env vars / `.env.example` / `spec/env.md`; `packages/ui/src/`;
   database schemas or migrations; `docs/specs/core-app.md`.

2. **Run each check separately** so failures are isolated:

   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm design:tokens:check
   pnpm docs:check-links
   pnpm test
   pnpm build
   ```

   - `pnpm build` also catches bundler import-resolution errors that
     typecheck does not — it is required, not optional, whenever anything
     under `apps/core/` or a package's source changed.
   - `design:tokens:check` is unconditional: it scans `packages/ui/src` and
     `apps/core` for hard-coded colour literals and undefined `--sv-*` tokens.
   - `docs:check-links` is in the pre-push hook; running it here surfaces a
     broken link before push instead of after.

3. **Conditional checks:**
   - Core API or an API route changed → the contract tests (core's handlers
     against `spec/core-api/`), and `packages/api-client` regenerated with no
     diff left over.
   - Env vars changed → every `process.env` read is declared in `.env.example`,
     the spec's variable table and `spec/env.md` agree.
   - Schema or migrations changed → migrations apply from empty on sqld,
     PostgreSQL and a SQLite file, and the dialect parity test passes.
   - `packages/ui/src/` changed → `pnpm --filter @sovereignfs/ui typecheck`
     (stories must type-check).
   - A new regression test → confirm it fails against the pre-fix code
     (`git stash` the fix, run it, `git stash pop`). A test that never failed
     proves nothing.

4. **Version-doc sync (unconditional):**

   ```bash
   grep -m1 '"version"' package.json
   grep -n '^Current platform version:' AGENTS.md
   grep -n '^\*\*Version:\*\*' ROADMAP.md
   git diff main...HEAD -- package.json
   ```

   - If root `package.json` changed on this branch, its version must appear in
     `AGENTS.md`'s `Current platform version:` line and `ROADMAP.md`'s
     `**Version:**` header.
   - A mismatch is a **FAIL** here; `sv-update-task-docs` is what fixes it —
     do not edit docs mid-verify.

5. **Report only this table plus concise failure details:**

   ```markdown
   ## Verification Results

   | Check                  | Result  | Notes        |
   | ---------------------- | ------- | ------------ |
   | format:check           | ✅ PASS | —            |
   | lint                   | ✅ PASS | —            |
   | typecheck              | ✅ PASS | —            |
   | design:tokens:check    | ✅ PASS | —            |
   | docs:check-links       | ✅ PASS | —            |
   | test                   | ✅ PASS | 412 passed   |
   | build                  | ✅ PASS | —            |
   | contract tests         | skipped | not relevant |
   | env declarations       | skipped | not relevant |
   | three-database checks  | skipped | not relevant |
   | ui typecheck           | skipped | not relevant |
   | regression-fails-first | ✅ PASS | <test name>  |
   | version-doc sync       | ✅ PASS | —            |

   **Overall:** ✅ All checks pass
   ```

   For a failure, add a `Failures` section with the command, file/line, and
   the smallest useful error excerpt — never full compiler/test/build logs.
   If a command cannot run (missing dependency, Docker not running, no
   PostgreSQL for the Postgres tests), report it as **BLOCKED** with the exact
   command and reason, not as a pass.

## Notes

- Never claim a task complete while a required check fails or is blocked.
- Running `pnpm test` alongside a live dev server can produce
  resource-contention flakes; re-run a lone failure in isolation before
  treating it as real.
