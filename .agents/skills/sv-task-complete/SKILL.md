---
name: sv-task-complete
description: Finish a Sovereign task or workstream leg and prepare it for PR. Use when implementation is done and the user asks to complete, wrap up, finalize, or get a task ready for review; runs verification, the conditional security check, version bumps, task-doc updates, and drafts the PR description.
---

# Sovereign Task Complete

Finish the unit of work described by `CURRENT_TASK.md` (a task, or a whole
workstream leg) and prepare it for a pull request.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it. "Your instruction
> file" means `CLAUDE.md` for Claude Code or `AGENTS.md` for Codex; "your
> attribution" is that agent's commit trailer and PR footer.

## Steps

### 1. Confirm scope

Read `CURRENT_TASK.md`. In **leg** mode, every listed task must be
implemented before this skill runs — a leg is one PR. If a task in the leg is
unfinished, stop and say which.

### 2. Verify

Run the `sv-verify` skill (as a subagent briefed with its full skill file
plus "read `CURRENT_TASK.md`, run all checks, return only the summary table",
or inline if subagents are unavailable). All checks must pass. On failure,
fix, then re-run `sv-verify` before continuing. Never proceed to a PR with a
failing check.

### 3. Security check (conditional)

Run the `sv-security-check` skill if the diff touches any sensitive path:

```bash
git diff main...HEAD --name-only | grep -E \
  'apps/auth/|middleware|/api/|packages/sdk/|packages/manifest/|actions\.ts|bin/|Dockerfile|docker-compose|\.env|csp|cookie|session|secret|token'
```

Fix every violation before continuing.

### 4. Bump versions

In the same branch, per your instruction file's version-bump conventions:

- `fix/` → patch; `feat/` → minor; breaking → major plus a `docs/upgrade.md`
  migration note; `chore/`/`docs/` → none unless a public API changed.
- **Root `package.json`:** every completed task bumps **minor**; patches are
  reserved for hotfixes between tasks. A leg bumps the root **once**, by the
  largest change in the leg.
- Packages (`db`, `runtime`, `auth`, `manifest`, `mailer`, `sdk`, `ui`) bump
  independently by what actually changed in them. `sdk`/`ui` never ship a
  breaking change in a patch.
- Plugins bump only `manifest.json`; their `package.json` stays `0.0.0`.
- If `main` moved while this branch was open, re-target the bumps onto the
  real current `main` after rebasing — a stale base silently produces a
  duplicate version number.

Finish all version edits before step 5; the docs updater reads the final
root version.

### 5. Update task docs

Run the `sv-update-task-docs` skill (as a subagent briefed with its full
skill file plus "read `CURRENT_TASK.md`, record the final root version, mark
every listed task complete in the roadmap and epic files, sync RFC and
workstream status, delete `CURRENT_TASK.md`, and report what changed", or
inline). Do not run it in parallel with version bumping.

### 6. Draft the PR description

```
## What

[1–3 sentences on what changed; for a leg, one line per task]

## Why

[Motivation — SRS section, RFC, workstream, or bug]

## How

[Key implementation decisions, if non-obvious; anything learned that became
a new rule in docs/architecture-rules.md]

## Verification

[The sv-verify summary; live/manual verification performed]

## Checklist
- [ ] `pnpm format:check`, `lint`, `typecheck`, `design:tokens:check`,
      `docs:check-links`, `test`, `build` pass
- [ ] Docs-parity test passes (if manifest/SDK/env changed)
- [ ] Security check passes (if sensitive paths touched)
- [ ] Versions bumped per policy; `docs/upgrade.md` note if breaking
- [ ] `ROADMAP.md` row(s) ✅, moved out of Non-prioritised tasks, Version
      cell matches the final root version (or `—`)
- [ ] Epic task heading(s) ✅
- [ ] RFC `Status:` line + `docs/rfcs/README.md` row updated (if the work
      advances an RFC)
- [ ] Workstream doc updated (leg mode)
- [ ] `CURRENT_TASK.md` deleted

<your attribution footer>
```

No roadmap slot versions, doc task numbers, or epic IDs in the title.

### 7. Create the PR only when asked

If the user asks to open the PR, run `sv-create-pr`. Agent-created PRs always
start as GitHub drafts.

### 8. Stop

Do not merge, and in leg mode do not start the next leg. Wait for explicit
instruction.
