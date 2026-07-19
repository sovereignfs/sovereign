# Verify

Run all quality checks for the current task and report a structured pass/fail summary. Can be run standalone or called by `/sv-task-complete`.

## Steps

1. **Read `CURRENT_TASK.md`** — note whether deliverables mention manifest fields, SDK surface, or env vars (signals docs-parity check needed). If the file does not exist, proceed with the standard suite anyway.

2. **Run each check separately** so failures are isolated:

   ```bash
   pnpm format:check 2>&1
   pnpm lint 2>&1
   pnpm typecheck 2>&1
   pnpm design:tokens:check 2>&1
   pnpm test 2>&1
   pnpm build 2>&1
   ```

   `pnpm build` runs `next build` via webpack and catches import-resolution errors
   (e.g. `.js` extensions that TypeScript accepts but webpack cannot resolve) that
   none of the other checks surface.

   `pnpm design:tokens:check` is unconditional — run it on every task, not
   just ones that touch `packages/ui`. It scans `packages/ui/src/components`,
   `runtime/app`, and `plugins/*/app` for hardcoded colour literals and
   undefined `--sv-*` token references, catching the same drift the pre-push
   hook (`verify:push`) would otherwise catch after the fact.

3. **Run docs-parity check** only if step 1 indicated manifest/SDK/env changes:

   ```bash
   pnpm test -- --reporter=verbose runtime/src/docs-parity 2>&1
   ```

4. **Run the version-doc sync check unconditionally** — this catches the class of
   drift where a version bump lands without the docs that cite it being updated:

   ```bash
   grep -m1 '"version"' package.json
   grep -m1 '"version"' runtime/package.json
   grep -n '^  The current version is' CLAUDE.md
   grep -n '^Current platform version:' CLAUDE.md
   grep -n '^\*\*Version:\*\*' ROADMAP.md
   ```

   Compare the results:
   - Root `package.json`'s version must match **both** version mentions in
     `CLAUDE.md` and the `**Version:**` line in `ROADMAP.md`.
   - If `runtime/package.json`'s version changed in this branch (check
     `git diff main...HEAD -- runtime/package.json`), its new value must have a
     matching row in the `## Runtime version map` table in `docs/upgrade.md`.

   If any of these are out of sync, do **not** silently ignore it — call it a
   **FAIL** in the report below (`/sv-update-task-docs` is what fixes it, so
   flag it there rather than editing docs yourself mid-verify).

5. **Report results in this exact format** — do not dump raw command output:

   ```
   ## Verification Results

   | Check | Result | Notes |
   |-------|--------|-------|
   | format:check | ✅ PASS | — |
   | lint | ✅ PASS | — |
   | typecheck | ✅ PASS | — |
   | design:tokens:check | ✅ PASS | — |
   | test | ✅ PASS | 47 tests passed |
   | build | ✅ PASS | — |
   | docs-parity | ✅ PASS | — |
   | version-doc sync | ✅ PASS | — |

   **Overall: ✅ All checks pass**
   ```

   For any failure, add a **Failures** section listing the specific error message — not the full compiler/test output:

   ```
   ## Failures

   **typecheck** — `runtime/src/foo.ts:42: Type 'string' is not assignable to type 'number'`
   ```

Output only the summary table and failure details. Never print raw command output.
