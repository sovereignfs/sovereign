# Update Task Docs

Mark the current task complete in the roadmap and CLAUDE.md, then remove CURRENT_TASK.md. Called by `/sv-task-complete` — can also be run standalone.

Requires `CURRENT_TASK.md` to exist in the repo root.

## Steps

1. **Read `CURRENT_TASK.md`** — extract:
   - `**Roadmap version:**` (e.g. `0.9.1`)
   - `**Epic task:**` (e.g. `9.9`)
   - `**Epic file:**` (e.g. `docs/epics/theming.md`)
   - Task title from the `####` heading line

2. **Update `docs/roadmap.md`** — find the row where the Version column matches the roadmap version. Change its Status cell from `⏳` to `✅`.

3. **Find the next task** — in `docs/roadmap.md`, find the first row after the one just updated whose Status is not `✅`. Note its Version, Task name, and Epic task link (the `[X.Y](...)` value in the Epic task column).

4. **Update `CLAUDE.md` Status section:**
   - Append a one-line ✅ entry under the recent completions list:
     `- Task <version> — <title> (<affected packages and version bumps, if any>).`
   - Replace the `⏳ **Next:**` line with:
     `⏳ **Next: Task <next-version> — <next-title> → epic task [<epic-id>](<epic-file>).** Branch from up-to-date \`main\`.`

5. **Delete `CURRENT_TASK.md`:**

   ```bash
   rm CURRENT_TASK.md
   ```

6. **Report** in 2–3 lines: which roadmap row was marked ✅, what the new ⏳ Next pointer says, and that CURRENT_TASK.md was deleted.
