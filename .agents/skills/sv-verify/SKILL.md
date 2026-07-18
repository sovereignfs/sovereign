---
name: sv-verify
description: Run Sovereign verification checks for the current task. Use when the user asks to verify, validate, run checks, prepare for PR, or confirm a Sovereign implementation is ready; reads CURRENT_TASK.md when present and reports structured pass/fail results without raw command dumps.
---

# Sovereign Verify

Run the standard Sovereign quality checks and return a compact result summary.

## Workflow

1. Read `CURRENT_TASK.md` if it exists. Note whether the task or diff touches:
   - manifest schema or permissions
   - SDK surface
   - env vars or `.env.example`
   - registry files
   - `packages/ui/src/` stories, tokens, or components

2. Run checks separately so failures are isolated:

   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm design:tokens:check
   pnpm test
   pnpm build
   ```

   `design:tokens:check` is unconditional, not one of the conditional checks
   below — it scans `packages/ui/src/components`, `runtime/app`, and
   `plugins/*/app` for hardcoded colour literals and undefined `--sv-*` token
   references on every task, whether or not `CURRENT_TASK.md` mentions UI
   work. It's also part of the pre-push hook (`verify:push`); running it here
   surfaces the same failure before push instead of after.

3. Run conditional checks when relevant:
   - Manifest/SDK/env docs parity:
     `pnpm test -- --reporter=verbose runtime/src/docs-parity`
   - UI package story/type coverage after `packages/ui/src/` changes:
     `pnpm --filter @sovereignfs/ui typecheck`
   - Registry changes:
     `pnpm registry:check`

4. Report only the summary table and concise failure details:

   ```markdown
   ## Verification Results

   | Check               | Result  | Notes        |
   | ------------------- | ------- | ------------ |
   | format:check        | ✅ PASS | —            |
   | lint                | ✅ PASS | —            |
   | typecheck           | ✅ PASS | —            |
   | design:tokens:check | ✅ PASS | —            |
   | test                | ✅ PASS | —            |
   | build               | ✅ PASS | —            |
   | docs-parity         | skipped | Not relevant |
   | ui typecheck        | skipped | Not relevant |
   | registry:check      | skipped | Not relevant |

   **Overall:** ✅ All checks pass
   ```

5. For failures, include a `Failures` section with the command, file/line if
   available, and the smallest useful error excerpt. Do not paste full compiler,
   test, or build logs.

## Notes

- `pnpm build` is required because it catches bundler/import-resolution failures
  that typecheck can miss.
- Do not claim the task is complete if required checks fail.
- If a command cannot run because dependencies or environment setup are missing,
  report that as blocked with the exact command and reason.
