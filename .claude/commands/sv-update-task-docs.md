# Update Task Docs

Mark the current task complete in the roadmap and epic file, then remove CURRENT_TASK.md.
Called by `/sv-task-complete` — can also be run standalone.

Requires `CURRENT_TASK.md` to exist in the repo root.

## Steps

1. **Read `CURRENT_TASK.md`** — extract:
   - `**Roadmap version:**` (e.g. `0.9.1`)
   - `**Epic task:**` (e.g. `9.9`)
   - `**Epic file:**` (e.g. `docs/epics/theming.md`)
   - Task title from the `####` heading line

2. **Update `docs/roadmap.md`**:
   - If `Roadmap version` is not `—`, find the row where the Version column matches the roadmap version. Change its Status cell to `✅`.
   - If `Roadmap version` is `—`, find the row whose Epic task link text matches the epic task ID. Change its Status cell to `✅`.

3. **Update the epic file** named by `**Epic file:**` — find the heading for the epic task ID and change its status marker to `✅`.

4. **Sync the version-bearing docs whenever this branch bumped a version** (root
   `package.json` and/or `runtime/package.json` — check `git diff main...HEAD --
package.json runtime/package.json`):

   - **Root `package.json` version changed** → update it in lockstep in:
     - `CLAUDE.md` — both `The current version is **`X`**` and
       `Current platform version: **`X`**` mentions.
     - `docs/roadmap.md` — the `**Version:**` line in the header, and bump
       `**Last updated:**` to today's date.
   - **`runtime/package.json` version changed** → append a new row to the
     `## Runtime version map` table in `docs/upgrade.md`, keyed to the new
     version, describing the task in one line (reuse the roadmap row title /
     epic task ID from step 1–2). Keep the table in ascending version order —
     do not leave a gap for a version that was actually shipped.

   Skip whichever half didn't change — a task that only bumps `runtime` (most
   feature work) doesn't need the `CLAUDE.md`/`roadmap.md` header touched, and
   vice versa.

5. **Delete `CURRENT_TASK.md`:**

   ```bash
   rm CURRENT_TASK.md
   ```

6. **Report** in 2–4 lines: which roadmap row and epic heading were marked ✅,
   which version-doc(s) were synced (or "none needed"), and that
   CURRENT_TASK.md was deleted.

## What not to do

- Do **not** append a completion entry to `CLAUDE.md` — `docs/roadmap.md` and the task's epic heading are the canonical completion markers.
- Do **not** write a `⏳ Next:` pointer anywhere — the developer assigns the next task at session start. See `docs/multi-agent.md`.
