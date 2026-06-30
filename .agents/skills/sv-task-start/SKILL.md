---
name: sv-task-start
description: Start an explicitly assigned Sovereign roadmap task for Codex. Use when the user asks Codex to begin, prepare, or set up a Sovereign task by epic ID, roadmap slot, task title, or description; use to inspect roadmap/epic docs, create CURRENT_TASK.md, summarize scope, and create the task branch.
---

# Sovereign Task Start

Prepare a Codex work session for one assigned Sovereign roadmap task.

## Workflow

1. Identify the task from the user's assignment. Accept an epic task ID, roadmap
   slot, title, or description. If no task is specified, read `docs/roadmap.md`,
   identify the first non-done row, and ask the user to confirm before
   continuing. Do not infer a task from a Next pointer.

2. Read these files as needed:
   - `AGENTS.md`
   - `docs/multi-agent.md`
   - `docs/roadmap.md`
   - `docs/epics/README.md`
   - the relevant `docs/epics/<epic>.md`
   - any RFC referenced by the task

3. Check git state:
   - Run `git status --short`.
   - Run `git log --oneline -5`.
   - Confirm the worktree is clean and on the correct base branch. If not, stop
     and ask before switching branches or mixing with existing changes.
   - If allowed by the user/session, update the base with `git switch main` and
     `git pull`.

4. Resolve task metadata:
   - roadmap version from `docs/roadmap.md`
   - stable epic task ID
   - epic file path
   - task title
   - referenced RFCs
   - review checklist

5. Determine a branch name from the task title:
   - `feat/<slug>` for features
   - `fix/<slug>` for bug fixes
   - `docs/<slug>` for documentation
   - `chore/<slug>` for tooling, scaffolding, dependencies, or maintenance
   - Never include roadmap slot versions, doc task numbers, or epic IDs.

6. Create `CURRENT_TASK.md` in the repo root with this structure:

   ```markdown
   # Current Task

   **Epic task:** <id>
   **Roadmap version:** <version>
   **Branch:** <branch-name>
   **Epic file:** docs/epics/<file>.md

   ---

   <full task block: Goal, Deliverables, SRS/RFC reference, Review checklist>
   ```

7. Summarize for the user:
   - task title and intent
   - branch name
   - likely files or areas touched
   - referenced RFC/SRS sections
   - expected version bump
   - review checklist

8. Create the branch with `git switch -c <branch-name>` only after the task and
   branch name are clear.

## Conventions

- The human is the scheduler. Do not auto-pick or advance a Next Task pointer.
- `CURRENT_TASK.md` is local transient context and should not be committed.
- Commits end with `Co-Authored-By: Codex <noreply@openai.com>` unless local
  Codex config emits a different attribution.
- PRs target `main`, are created as draft first with `sv-create-pr`, and PR
  bodies end with `🤖 Generated with [Codex](https://developers.openai.com/codex)`.
