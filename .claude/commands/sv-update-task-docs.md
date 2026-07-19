# Update Task Docs

Mark the current task complete, record its final platform version, move it into
the correct roadmap phase, then remove CURRENT_TASK.md.
Called by `/sv-task-complete` — can also be run standalone.

Requires `CURRENT_TASK.md` to exist in the repo root.

## Steps

1. **Read `CURRENT_TASK.md`** — extract:
   - `**Roadmap version:**` (e.g. `0.9.1`)
   - `**Epic task:**` (e.g. `9.9`)
   - `**Epic file:**` (e.g. `docs/epics/theming.md`)
   - Task title from the `####` heading line

2. **Resolve the final root platform version before editing the roadmap:**
   - Check the merge-base diff plus staged/unstaged changes for root
     `package.json`.
   - If its version changed, use the new root version exactly.
   - Otherwise retain the row's existing non-`—` version, or use `—` when no
     root version was recorded. Never use a package/runtime version here.

3. **Update `ROADMAP.md` by epic task ID:**
   - Find the row whose Epic task link text matches the epic task ID.
   - Mark it `✅` and set its Version cell to the value resolved above.
   - If it is under `Non-prioritised tasks`, move the entire row at sign-off:
     - PWA work while root is `<1.0.0` → `Phase v0.9+ — Pre-release Hardening`.
     - Desktop/Mobile work → that client section's `Pre-v1` table.
     - Post-v1 work → the applicable versioned phase in the same client section.
   - Keep versioned rows ascending. Place a completed `—` row after its closest
     known chronological neighbour, or at the end of the completed destination
     table when chronology cannot be established.
   - Remove empty priority/group label rows left behind. Never leave a completed
     task in `Non-prioritised tasks`.

4. **Update the epic file** named by `**Epic file:**` — find the heading for the epic task ID and change its status marker to `✅`.

5. **Sync the version-bearing docs whenever this branch bumped a version** (root
   `package.json` and/or `runtime/package.json` — check `git diff main...HEAD --
package.json runtime/package.json`):

   - **Root `package.json` version changed** → update it in lockstep in:
     - `CLAUDE.md` — both `The current version is **`X`**` and
       `Current platform version: **`X`**` mentions.
     - `ROADMAP.md` — the `**Version:**` line in the header, and bump
       `**Last updated:**` to today's date.
   - **`runtime/package.json` version changed** → append a new row to the
     `## Runtime version map` table in `docs/upgrade.md`, keyed to the new
     version, describing the task in one line (reuse the roadmap row title /
     epic task ID from step 1–2). Keep the table in ascending version order —
     do not leave a gap for a version that was actually shipped.

   Skip whichever half didn't change — a task that only bumps `runtime` (most
   feature work) doesn't need the `CLAUDE.md`/`ROADMAP.md` header touched, and
   vice versa.

6. **Validate the planning update:** the epic task link occurs exactly once in
   the roadmap; roadmap and epic statuses are `✅`; the row is outside
   `Non-prioritised tasks`; a bumped root version matches the row; changed
   Markdown passes Prettier and `git diff --check`.

7. **Delete `CURRENT_TASK.md`:**

   ```bash
   rm CURRENT_TASK.md
   ```

8. **Report** in 2–4 lines: which roadmap row and epic heading were marked ✅,
   which version-doc(s) were synced (or "none needed"), and that
   CURRENT_TASK.md was deleted.

## What not to do

- Do **not** append a completion entry to `CLAUDE.md` — `ROADMAP.md` and the task's epic heading are the canonical completion markers.
- Do **not** write a `⏳ Next:` pointer anywhere — the developer assigns the next task at session start. See `docs/multi-agent.md`.
- Do **not** invent a platform version from a package-only bump, commit date, or nearby tag. Use `—` when the root version is not explicit.
