# Task Complete

Finish a Sovereign task and prepare it for PR. Run this when implementation is done.

## Steps

### 1. Spawn parallel agents

Launch two sub-agents **simultaneously** (single message, two Agent tool calls):

**Agent A — Verifier:** Brief it with the full contents of `.claude/commands/sv-verify.md` plus: "The repo is at `/Users/nemo/Dev/kasunben/sovereignfs/sovereign`. Read `CURRENT_TASK.md` for task context, run all checks, and return only the summary table."

**Agent B — Docs Updater:** Brief it with the full contents of `.claude/commands/sv-update-task-docs.md` plus: "The repo is at `/Users/nemo/Dev/kasunben/sovereignfs/sovereign`. Read `CURRENT_TASK.md`, update `docs/roadmap.md` and `CLAUDE.md`, delete `CURRENT_TASK.md`, and report what changed."

Wait for both agents to return before continuing.

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

### 5. Draft the PR description

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
- [ ] `docs/roadmap.md` row updated ✅
- [ ] `CURRENT_TASK.md` deleted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 6. Do not merge

Wait for explicit instruction or consent from the user.
