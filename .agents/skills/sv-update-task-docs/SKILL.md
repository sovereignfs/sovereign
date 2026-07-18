---
name: sv-update-task-docs
description: Update Sovereign task completion docs. Use when a Sovereign task is complete or the user asks to mark a task done; reads CURRENT_TASK.md, marks the roadmap row and epic task heading complete, and removes CURRENT_TASK.md.
---

# Sovereign Update Task Docs

Mark the current Sovereign task complete in planning docs and remove transient
task context.

## Workflow

1. Read `CURRENT_TASK.md` from the repo root. Extract:
   - `**Roadmap version:**`
   - `**Epic task:**`
   - `**Epic file:**`
   - task title from the `####` heading line.

2. Update `docs/roadmap.md`:
   - If `Roadmap version` is not `—`, find the row whose Version column matches
     it and change the Status cell to `✅`.
   - If `Roadmap version` is `—`, find the row whose Epic task link text
     matches the epic task ID and change the Status cell to `✅`.

3. Update the epic file named by `**Epic file:**`:
   - Find the task heading for the epic task ID.
   - Change its status marker to `✅`, preserving the rest of the heading.

4. Sync version-bearing docs if this branch bumped a version — check
   `git diff main...HEAD -- package.json runtime/package.json`:
   - Root `package.json` version changed → update it in `CLAUDE.md` (both
     `The current version is **`X`**` and `Current platform version: **`X`**`)
     and in `docs/roadmap.md`'s `**Version:**` header line (also bump
     `**Last updated:**` to today's date).
   - `runtime/package.json` version changed → append a row for the new version
     to the `## Runtime version map` table in `docs/upgrade.md`, describing the
     task in one line. Keep the table in ascending version order — no gaps for
     versions that actually shipped.
   - Skip whichever half didn't change.

5. Delete `CURRENT_TASK.md`.

6. Report in 2-4 lines:
   - which roadmap row was marked complete,
   - which epic heading was marked complete,
   - which version-doc(s) were synced (or "none needed"),
   - that `CURRENT_TASK.md` was deleted.

## What not to do

- Do not append completion history to `CLAUDE.md` or `AGENTS.md`.
- Do not write a `⏳ Next:` pointer anywhere.
- Do not start a different roadmap task.
