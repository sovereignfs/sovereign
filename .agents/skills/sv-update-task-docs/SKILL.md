---
name: sv-update-task-docs
description: Update Sovereign task completion docs. Use when a Sovereign task is complete or the user asks to mark a task done; records the final platform version, moves completed backlog rows into the correct roadmap phase, marks the epic heading complete, and removes CURRENT_TASK.md.
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

2. Resolve the final root platform version before editing the roadmap:
   - Compare `package.json` on the merge base with the working tree:
     `git diff main...HEAD -- package.json`, plus unstaged/staged changes when
     completion is running before the final commit.
   - If the root `package.json` version changed, use the new version exactly.
   - If it did not change, use the existing roadmap version when it is not `—`;
     otherwise keep `—`. Never substitute a package or runtime version for the
     root platform version.

3. Update `ROADMAP.md` by epic task ID, not title or version alone:
   - Find the row whose Epic task link text matches the epic task ID.
   - Change its Status cell to `✅` and set its Version cell to the final value
     resolved in step 2.
   - If the row is under `Non-prioritised tasks`, move the entire row at sign-off:
     - PWA work while the root version is `<1.0.0` → `Phase v0.9+ — Pre-release Hardening`.
     - Desktop or Mobile work → that client section's `Pre-v1` table.
     - Post-v1 work → the applicable versioned phase table in the same client section.
   - Insert versioned rows in ascending version order. Put a completed `—` row
     after the closest known chronological neighbour; when that cannot be
     established, append it to the completed portion of the destination table.
   - Remove empty grouping/priority label rows left behind. Never leave a
     completed task in `Non-prioritised tasks`.

4. Update the epic file named by `**Epic file:**`:
   - Find the task heading for the epic task ID.
   - Change its status marker to `✅`, preserving the rest of the heading.

5. Sync version-bearing docs if this branch bumped a version — check
   `git diff main...HEAD -- package.json runtime/package.json`:
   - Root `package.json` version changed → update it in `CLAUDE.md` (both
     `The current version is **`X`**` and `Current platform version: **`X`**`)
     and in `ROADMAP.md`'s `**Version:**` header line (also bump
     `**Last updated:**` to today's date).
   - `runtime/package.json` version changed → append a row for the new version
     to the `## Runtime version map` table in `docs/upgrade.md`, describing the
     task in one line. Keep the table in ascending version order — no gaps for
     versions that actually shipped.
   - Skip whichever half didn't change.

6. Validate the planning-doc update:
   - The completed epic task ID appears exactly once as a roadmap link.
   - The roadmap and epic statuses are both `✅`.
   - The completed row is not under `Non-prioritised tasks`.
   - The roadmap Version cell equals the new root version when one was bumped.
   - Run Prettier on every changed Markdown file and `git diff --check`.

7. Delete `CURRENT_TASK.md`.

8. Report in 2-4 lines:
   - which roadmap row was marked complete,
   - which epic heading was marked complete,
   - which version-doc(s) were synced (or "none needed"),
   - that `CURRENT_TASK.md` was deleted.

## What not to do

- Do not append completion history to `CLAUDE.md` or `AGENTS.md`.
- Do not write a `⏳ Next:` pointer anywhere.
- Do not start a different roadmap task.
- Do not invent a platform version from a package-only bump, commit date, or
  nearby tag. Use `—` when the root version is not explicit.
