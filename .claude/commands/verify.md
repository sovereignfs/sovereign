# Verify

Run all quality checks for the current task and report a structured pass/fail summary. Can be run standalone or called by `/task-complete`.

## Steps

1. **Read `CURRENT_TASK.md`** — note whether deliverables mention manifest fields, SDK surface, or env vars (signals docs-parity check needed). If the file does not exist, proceed with the standard suite anyway.

2. **Run each check separately** so failures are isolated:

   ```bash
   pnpm format:check 2>&1
   pnpm lint 2>&1
   pnpm typecheck 2>&1
   pnpm test 2>&1
   pnpm build 2>&1
   ```

   `pnpm build` runs `next build` via webpack and catches import-resolution errors
   (e.g. `.js` extensions that TypeScript accepts but webpack cannot resolve) that
   none of the other checks surface.

3. **Run docs-parity check** only if step 1 indicated manifest/SDK/env changes:

   ```bash
   pnpm test -- --reporter=verbose runtime/src/docs-parity 2>&1
   ```

4. **Report results in this exact format** — do not dump raw command output:

   ```
   ## Verification Results

   | Check | Result | Notes |
   |-------|--------|-------|
   | format:check | ✅ PASS | — |
   | lint | ✅ PASS | — |
   | typecheck | ✅ PASS | — |
   | test | ✅ PASS | 47 tests passed |
   | build | ✅ PASS | — |
   | docs-parity | ✅ PASS | — |

   **Overall: ✅ All checks pass**
   ```

   For any failure, add a **Failures** section listing the specific error message — not the full compiler/test output:

   ```
   ## Failures

   **typecheck** — `runtime/src/foo.ts:42: Type 'string' is not assignable to type 'number'`
   ```

Output only the summary table and failure details. Never print raw command output.
