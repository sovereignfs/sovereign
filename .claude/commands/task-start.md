# Task Start

Prepare to begin the next Sovereign task. Run this at the start of every work session.

## Steps

1. **Identify the next task** — read the `⏳ Next:` line in `CLAUDE.md` to get the **epic task ID** (e.g. `9.9`). Then look up the **current roadmap slot** for that ID directly from `docs/roadmap.md` — this is the authoritative source and may differ from CLAUDE.md if priorities shifted since it was last updated:

   ```bash
   grep "\[9\.9\]" docs/roadmap.md
   # → | 0.9.2   | Email template system... | ⏳  | [9.9](...) |
   ```

   Extract the version from column 1 of that row. If `⏳ Next:` is absent from CLAUDE.md, find the first non-✅ row in `docs/roadmap.md` directly.

2. **Check git state** — run `git status` and `git log --oneline -5`. Confirm you're on `main` and it's clean. If not, stop and ask.

3. **Pull latest** — `git switch main && git pull`.

4. **Load the task detail** — find the epic task ID in `docs/epics/README.md` to get the epic file name, then grep for the heading in that file:

   ```bash
   grep -n "^#### " docs/epics/<epic-file>.md | grep "<task-id>"
   ```

   Read from that line to the next `---` separator to get Goal, Deliverables, SRS reference, and Review checklist.

5. **Read the relevant RFC** if the task references one (e.g. `RFC 0031` → `docs/rfcs/0031-*.md`).

6. **Write `CURRENT_TASK.md`** in the repo root with this structure:

   ```markdown
   # Current Task

   **Epic task:** <id>
   **Roadmap version:** <version>
   **Branch:** <branch-name>
   **Epic file:** docs/epics/<file>.md

   ---

   <paste the full task block verbatim: Goal, Deliverables, SRS reference, Review checklist>
   ```

7. **Determine branch name** from the task description:
   - Feature → `feat/<kebab-slug>`
   - Bug fix → `fix/<kebab-slug>`
   - Docs → `docs/<kebab-slug>`
   - Tooling/chore → `chore/<kebab-slug>`
   - Do **not** include task numbers in branch names.

8. **Print a summary** with:
   - Task title and what it changes
   - Branch name to create
   - Key files likely to be touched
   - Any version bumps required (feat → minor, fix → patch, chore/docs → none unless public API changed)
   - The review checklist

9. **Create the branch**: `git switch -c <branch-name>`

## Conventions reminder

- Any agent working on this task should read `CURRENT_TASK.md` first — it has everything needed without further navigation.
- Commits end with: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- PRs target `main` and end with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Merge strategy: rebase and merge (never squash)
- Run `/task-complete` when the implementation is ready for review
