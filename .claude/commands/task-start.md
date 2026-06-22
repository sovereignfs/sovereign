# Task Start

Prepare to begin the next Sovereign task. Run this at the start of every work session.

## Steps

1. **Read the next task** from `docs/roadmap.md` — find the first item without a ✅ mark. If the CLAUDE.md `⏳ Next` line names it, use that.

2. **Check git state** — run `git status` and `git log --oneline -5`. Confirm you're on `main` and it's clean. If not, stop and ask.

3. **Pull latest** — `git switch main && git pull`.

4. **Determine branch name** from the task description:
   - Feature → `feat/<kebab-slug>`
   - Bug fix → `fix/<kebab-slug>`
   - Docs → `docs/<kebab-slug>`
   - Tooling/chore → `chore/<kebab-slug>`
   - Do **not** include task numbers in branch names.

5. **Read the relevant RFC** if the task references one (e.g. `RFC 0032` → `docs/rfcs/0032-*.md`).

6. **Print a summary** with:
   - Task title and what it changes
   - Branch name to create
   - Key files likely to be touched (from roadmap description)
   - Any version bumps required (feat → minor, fix → patch, chore/docs → none unless public API changed)
   - The review checklist from the roadmap entry if present

7. **Create the branch**: `git switch -c <branch-name>`

## Conventions reminder

- Commits end with: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- PRs target `main` and end with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Merge strategy: rebase and merge (never squash)
- When done: update `docs/roadmap.md` ✅ and `CLAUDE.md` Status in the same PR
- Run `/task-complete` when the implementation is ready for review
