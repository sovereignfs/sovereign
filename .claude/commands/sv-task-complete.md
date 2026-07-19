# Task Complete

Finish a Sovereign task and prepare it for PR. Run this when implementation is done.

## Steps

### 1. Verify the task

Launch a verifier agent briefed with the full contents of
`.claude/commands/sv-verify.md` plus: "The repo is at the current working
directory. Read `CURRENT_TASK.md` for task context, run all checks, and return
only the summary table."

### 2. Handle verification results

- If Verifier reports **all checks pass** → continue.
- If Verifier reports **failures** → fix them, then re-run `/sv-verify` before continuing. Do not proceed to PR with failing checks.

### 3. Security check (conditional)

Run `/sv-security-check` if the diff touches sensitive paths:

```bash
git diff main...HEAD --name-only | grep -E "apps/auth/|middleware|/api/|packages/sdk/|csp|cookie|session"
```

If any matches → spawn a Security Check agent briefed with the contents of `.claude/commands/sv-security-check.md`. Fix any violations before continuing.

### 4. Bump versions

In the same branch:

- `fix/` → patch bump on affected packages
- `feat/` → minor bump on affected packages
- Breaking change → major bump + migration note in `docs/upgrade.md`
- `chore/`/`docs/` → no bump unless a public API changed
- Platform root `package.json` only bumps at phase completion (minor) or 1.0.xx hardening (patch)

Finish all required version edits before updating task docs. The docs updater
uses the final root version to populate and relocate the roadmap row.

### 5. Update task completion docs

Launch a docs-updater agent briefed with the full contents of
`.claude/commands/sv-update-task-docs.md` plus: "The repo is at the current
working directory. Read `CURRENT_TASK.md`; record the final root version, move
the completed roadmap row into the correct phase, update the matching epic
heading, delete `CURRENT_TASK.md`, and report what changed."

Do not run this agent in parallel with version bumping.

### 6. Draft the PR description

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
- [ ] `pnpm build` passes
- [ ] Docs parity test passes (if manifest/SDK/env changed)
- [ ] Security check passes (if auth/middleware/CSP touched)
- [ ] Version bumped per semver policy
- [ ] `ROADMAP.md` row updated ✅
- [ ] Completed roadmap row moved out of Non-prioritised Tasks
- [ ] Roadmap Version cell matches the final root version, or `—` when no root bump exists
- [ ] Epic task heading updated ✅
- [ ] `CURRENT_TASK.md` deleted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 7. Create a draft PR only when requested

If the developer asks to create/open the PR, run `/sv-create-pr`. All
agent-created PRs must start as GitHub draft PRs via `gh pr create --draft`,
even when the developer simply says "create the PR".

### 8. Do not merge

Wait for explicit instruction or consent from the user.
