# Update Task Docs

Mark the current task complete in the roadmap and remove CURRENT_TASK.md. Called by `/sv-task-complete` — can also be run standalone.

Requires `CURRENT_TASK.md` to exist in the repo root.

## Steps

1. **Read `CURRENT_TASK.md`** — extract:
   - `**Roadmap version:**` (e.g. `0.9.1`)
   - `**Epic task:**` (e.g. `9.9`)
   - `**Epic file:**` (e.g. `docs/epics/theming.md`)
   - Task title from the `####` heading line

2. **Update `docs/roadmap.md`** — find the row where the Version column matches the roadmap version. Change its Status cell from `⏳` to `✅`.

3. **Delete `CURRENT_TASK.md`:**

   ```bash
   rm CURRENT_TASK.md
   ```

4. **Report** in 2–3 lines: which roadmap row was marked ✅ and that CURRENT_TASK.md was deleted.

## What not to do

- Do **not** append a completion entry to `CLAUDE.md` — `docs/roadmap.md` is the canonical completion record.
- Do **not** write a `⏳ Next:` pointer anywhere — the developer assigns the next task at session start. See `docs/multi-agent.md`.
