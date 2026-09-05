---
name: sv-task-start
description: Start an assigned Sovereign roadmap task or workstream leg. Use when the user asks to begin, prepare, or set up a task by epic ID, roadmap slot, title, or description, or a workstream leg by workstream number and leg number; inspects roadmap/epic/workstream docs, writes CURRENT_TASK.md, summarizes scope, and creates the branch.
---

# Sovereign Task Start

Prepare a work session for one assigned unit of work: a single roadmap task,
or one **leg** of a workstream (`docs/workstreams/`).

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it. "Your instruction
> file" means `CLAUDE.md` for Claude Code or `AGENTS.md` for Codex.

## Workflow

1. **Identify the unit of work** from the user's assignment.
   - A **task**: an epic task ID (`9.9`), roadmap slot, title, or description.
   - A **leg**: a workstream number plus leg number ("workstream 0023 leg 5").
   - If nothing is specified, read `ROADMAP.md`, find the first non-✅ row,
     and ask the user to confirm before continuing. Never infer a task from a
     "Next" pointer — the human is the scheduler (`docs/multi-agent.md`).

2. **Read** your instruction file, `docs/development-workflow.md`,
   `ROADMAP.md`, `docs/epics/README.md`, the relevant `docs/epics/<epic>.md`,
   any RFC the task references (`RFC 0031` → `docs/rfcs/0031-*.md`), and — for
   a leg — the workstream document and `docs/workstreams/README.md`.

3. **Check git state:** `git status --short` and `git log --oneline -5`.
   The worktree must be clean and on `main`; if not, stop and ask. Then
   `git switch main && git pull`.
   - For a leg: confirm the previous leg's PR is merged (the "no task on an
     unmerged PR" rule applies at leg boundaries). If the leg has a
     **Do not proceed if** clause, check it now and stop if it holds.

4. **Resolve metadata.**
   - Task: epic task ID, epic file, title, roadmap slot version (column 1 of
     the row — `grep "\[9\.9\]" ROADMAP.md`), referenced RFCs, review checklist.
   - Leg: every epic task in the leg (from the workstream's Legs table), each
     task's epic file and block, the leg's Technical notes, Done-when, and
     Do-not-proceed-if text, and whether the leg is a **gate**.

5. **Choose the branch name** by change type — `feat/`, `fix/`, `docs/`,
   `chore/` plus a kebab slug. A leg uses `feat/<workstream-slug>-leg-<n>` (or
   the matching type prefix). Never include roadmap slot versions, doc task
   numbers, or epic IDs.

6. **Write `CURRENT_TASK.md`** in the repo root. It is gitignored, transient,
   and the only context the completion skills need.

   Task mode:

   ```markdown
   # Current Task

   **Mode:** task
   **Epic task:** <id>
   **Roadmap version:** <version or —>
   **Branch:** <branch-name>
   **Epic file:** docs/epics/<file>.md
   **RFCs:** <ids or none>

   ---

   <full task block verbatim: Goal, Deliverables, SRS reference, Review checklist>
   ```

   Leg mode:

   ```markdown
   # Current Task

   **Mode:** leg
   **Workstream:** docs/workstreams/<file>.md
   **Leg:** <n> — <name> (gate: yes|no)
   **Epic tasks:** <id>, <id>, …
   **Branch:** <branch-name>
   **Epic files:** docs/epics/<a>.md, docs/epics/<b>.md
   **RFCs:** <ids or none>

   ---

   ## Leg detail

   <the leg's Technical notes, Done when, and Do not proceed if, verbatim>

   ## Task <id>

   <that task's full block verbatim>

   ## Task <id>

   …
   ```

7. **Summarize for the user:** title and intent; branch name; likely files;
   RFC/SRS sections; expected version bump (see your instruction file's
   version-bump conventions — a leg bumps once, by its largest change); the
   review checklist(s). For a leg, also state the stop condition: every task
   in order, one PR, then stop — never start the next leg.

8. **Create the branch:** `git switch -c <branch-name>`.

## Conventions

- Anyone working on this unit reads `CURRENT_TASK.md` first.
- Commits end with your agent's attribution trailer; PRs are created as drafts
  with `sv-create-pr`; merge strategy is rebase and merge.
- Run `sv-task-complete` when the task (or the whole leg) is implemented.
