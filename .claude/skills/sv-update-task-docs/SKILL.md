---
name: sv-update-task-docs
description: Update Sovereign task-completion docs for a task or workstream leg. Use when a task or leg is complete or the user asks to mark one done; records the final platform version, moves completed roadmap rows into the correct phase, marks epic headings complete, syncs RFC and workstream status, and removes CURRENT_TASK.md.
---

# Sovereign Update Task Docs

Mark the unit of work in `CURRENT_TASK.md` complete in the planning docs and
remove the transient task file. Called by `sv-task-complete`; also runs
standalone. Requires `CURRENT_TASK.md`.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it.

## Workflow

1. **Read `CURRENT_TASK.md`.** Extract `**Mode:**`, the epic task ID(s), epic
   file(s), `**Roadmap version:**` (task mode), `**RFCs:**`, and in leg mode
   `**Workstream:**` and `**Leg:**`. In leg mode, every step below runs for
   **each** listed epic task.

2. **Resolve the final root platform version** before editing the roadmap:
   `git diff main...HEAD -- package.json` plus staged/unstaged changes. If the
   root version changed, use it exactly. Otherwise keep the row's existing
   non-`—` version, or `—`. Never substitute a package/runtime/plugin version.

3. **Update `ROADMAP.md` by epic task ID** (never by title or version alone):
   - Find the row whose Epic task link text matches; set Status `✅` and the
     Version cell to the value from step 2.
   - If the row is under `Non-prioritised tasks`, move the whole row: PWA work
     while root `<1.0.0` → `Phase v0.9+ — Pre-release Hardening`;
     Desktop/Mobile → that client's `Pre-v1` table; post-v1 → the applicable
     versioned phase. Keep versioned rows ascending; place a `—` row after its
     closest chronological neighbour. Remove empty group-label rows left
     behind. Never leave a completed task in `Non-prioritised tasks`.
   - In leg mode, all of the leg's tasks share the one root version.

4. **Update each epic file:** find the `####` heading for the task ID and set
   its status marker to `✅`, preserving the rest of the heading. If the epic
   file has a per-task Result/completion-note convention, add the note there —
   this is where per-task narrative belongs (not in `CLAUDE.md`/`AGENTS.md`).

5. **Sync RFC status** for every RFC the work advances (`**RFCs:**`, or
   `incorporated_into_plan` fields naming these task IDs): update the RFC's
   own `Status:` line and its row in `docs/rfcs/README.md`. `Implemented` once
   every incorporated task is ✅; `Partially implemented (reason)` otherwise;
   `Retired`/`Superseded` with a pointer if the feature was removed or
   replaced. These never update automatically.

6. **Leg mode — update the workstream doc:** mark the leg done wherever the
   document tracks leg status (Legs table status column if present), and
   append a Changelog row (version, month, one paragraph: what shipped, any
   decision the leg resolved that the doc had left open, anything the doc got
   wrong). If this was the final leg, say the workstream is complete.

7. **Sync version-bearing docs** when this branch bumped a version
   (`git diff main...HEAD -- package.json runtime/package.json`):
   - Root version changed → update `CLAUDE.md`'s
     `Current platform version: **\`X\`**`line and`ROADMAP.md`'s
`**Version:**`header, and set its`**Last updated:**` to today.
   - `runtime/package.json` changed → append a row to `docs/upgrade.md`'s
     `## Runtime version map` (ascending order, no gaps for shipped versions).
   - Skip whichever half didn't change.

8. **Validate:** each completed task ID appears exactly once as a roadmap
   link; roadmap and epic statuses are `✅`; no completed row remains in
   `Non-prioritised tasks`; a bumped root version matches every row and the
   two header lines; changed Markdown passes `pnpm exec prettier --check` and
   `git diff --check`; `pnpm docs:check-links` passes.

9. **Delete `CURRENT_TASK.md`.**

10. **Report** in 2–5 lines: rows and headings marked ✅, RFC/workstream
    statuses touched, version docs synced (or "none needed"), and that
    `CURRENT_TASK.md` was deleted.

## What not to do

- Do not append completion history or release narrative to `CLAUDE.md` or
  `AGENTS.md` — `ROADMAP.md`, the epic heading, and the PR body are the record.
- Do not write a `⏳ Next:` pointer anywhere; the human assigns the next task.
- Do not start another task or leg.
- Do not invent a platform version from a package bump, commit date, or tag.
