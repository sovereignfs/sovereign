# Task Complete

Finish a Sovereign task and prepare it for PR. Run this when implementation is done.

## Steps

1. **Run the verification checklist** — execute the commands listed in the roadmap entry for this task (typecheck, lint, tests, format check). Show all output. Do not claim done if any fail.

   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
   ```

2. **Check docs parity** — if you touched manifest fields, SDK surface, or env vars, verify the parity test passes:

   ```bash
   pnpm test -- --reporter=verbose runtime/src/docs-parity
   ```

3. **Mark roadmap done** — in `docs/roadmap.md`, find the task row and change its Status cell to ✅.

4. **Update CLAUDE.md Status** — append a one-line ✅ entry at the bottom of the Status section. Keep it to one sentence: what shipped and which packages changed. Then update the `⏳ Next` line to point at the following task (include the epic task ID and epic file path so the next session can jump straight to it — e.g. `⏳ Next: Task 0.9.2 — White-labeling Phase 3 → [9.10](docs/epics/theming.md) (epic task 9.10)`).

5. **Delete `CURRENT_TASK.md`** from the repo root — `rm CURRENT_TASK.md`. The task is done; the file should not persist.

6. **Bump versions** — in the same branch:
   - `fix/` → patch bump on affected packages
   - `feat/` → minor bump on affected packages
   - Breaking change → major bump + migration note in `docs/upgrade.md`
   - `chore/`/`docs/` → no bump unless a public API changed
   - Platform root `package.json` only bumps at phase completion (minor) or 1.0.xx hardening (patch)

7. **Draft the PR description** using this template:

   ```
   ## What

   [1-3 sentences on what changed]

   ## Why

   [The motivation — SRS section, RFC, or bug]

   ## How

   [Key implementation decisions, if non-obvious]

   ## Checklist
   - [ ] `pnpm format:check` passes
   - [ ] `pnpm lint` passes
   - [ ] `pnpm typecheck` passes
   - [ ] `pnpm test` passes
   - [ ] Docs parity test passes (if manifest/SDK/env changed)
   - [ ] Version bumped per semver policy
   - [ ] `docs/roadmap.md` row updated ✅
   - [ ] `CLAUDE.md` Status updated with ✅ entry and new `⏳ Next` pointer
   - [ ] `CURRENT_TASK.md` deleted

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

8. **Do not merge** — wait for explicit instruction or consent from the user.
