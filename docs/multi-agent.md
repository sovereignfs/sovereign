# Multi-Agent Development Model

This project is co-developed by two AI coding agents — **Claude Code** and **Codex** — alongside the human developer. This document records the model we use, the decisions behind it, and the conventions each agent must follow.

## How we got here

This model was established in a three-way conversation (developer + Claude Code + Codex) on 2026-06-29. Both agents were consulted simultaneously, proposed a shared structure, and refined it collaboratively before it was written down. The exercise itself validated the model: two agents can work on the same codebase without conflict when the conventions are clear and the human is the scheduler.

## The model

Each agent works from its own **separate local clone** of the repository. There is no shared working tree, no shared branch, and no shared `CURRENT_TASK.md`. Agents work independently; the only shared state is `main` (via git).

```
Developer
   ├── Clone A  →  Claude Code
   └── Clone B  →  Codex
              ↑
           git remote (shared main)
```

## Task assignment

The **developer assigns tasks explicitly** at the start of each session. Neither agent infers its next task from a file — there is no `⏳ Next:` pointer in `CLAUDE.md` or `AGENTS.md`.

`docs/roadmap.md` is the canonical task queue. The developer reads it, decides which task each agent picks up, and tells the agent at session start. Open PRs show what is in flight.

## Agent-specific context files

Each agent has its own context file that acts as a tool-specific adapter:

| File        | Read by     | Purpose                                  |
| ----------- | ----------- | ---------------------------------------- |
| `CLAUDE.md` | Claude Code | Conventions, rules, pointers to `docs/`  |
| `AGENTS.md` | Codex       | Same structure, Codex-specific mechanics |

These files are **lean, stable adapters** — not changelogs. They contain conventions and architectural rules. They do not contain task completion history.

## Shared source of truth

Both agents read the same `docs/` tree without modification:

- `docs/roadmap.md` — task queue and completion record (✅ entries go here)
- `docs/epics/` — full task detail
- `docs/development-workflow.md` — branch/PR/commit mechanics
- `docs/sovereign-proposal-plan-srs.md` — architecture and SRS
- Everything else in `docs/`

Neither agent writes anything to these files that the other would need to undo. Completion is recorded once, in `docs/roadmap.md`, in the PR that delivers the work.

## Commit trailers

Commit trailers identify which agent authored the work:

- **Claude Code**: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **Codex**: `Co-Authored-By: Codex <noreply@openai.com>` _(or whatever value Codex's local config emits)_

## What does NOT go in `CLAUDE.md` or `AGENTS.md`

- Task completion entries — use `docs/roadmap.md`
- A "next task" pointer — the developer assigns this at session start
- Git history or recent changes — `git log` is authoritative
- Debugging solutions — the fix is in the code; the commit message has the context

## Decision log

| Date       | Decision                                                                 | Rationale                                                                                                    |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 2026-06-29 | Separate clones per agent, no shared working tree                        | Eliminates all coordination overhead; each agent is fully isolated                                           |
| 2026-06-29 | Drop `⏳ Next:` pointer from `CLAUDE.md`                                 | With two agents, a single pointer is ambiguous; the developer is the scheduler                               |
| 2026-06-29 | Drop completion history from `CLAUDE.md` / `AGENTS.md`                   | These files are tool adapters, not changelogs; `docs/roadmap.md` + merged PRs are the record                 |
| 2026-06-29 | Agent-specific context files (`CLAUDE.md` / `AGENTS.md`), shared `docs/` | Each agent gets native context in its own format; project state is not duplicated                            |
| 2026-06-29 | Codex trailer treated as convention, not confirmed identity              | Codex's actual commit attribution config may differ; the trailer is a best-effort convention until confirmed |
