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

4. **Delete `CURRENT_TASK.md`:**

   ```bash
   rm CURRENT_TASK.md
   ```

5. **Report** in 2–3 lines: which roadmap row and epic heading were marked ✅, and that CURRENT_TASK.md was deleted.

## What not to do

- Do **not** append a completion entry to `CLAUDE.md` — `docs/roadmap.md` and the task's epic heading are the canonical completion markers.
- Do **not** write a `⏳ Next:` pointer anywhere — the developer assigns the next task at session start. See `docs/multi-agent.md`.
