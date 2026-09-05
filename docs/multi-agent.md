---
docSection: contributors
docType: policy
audiences:
  - contributor
---

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

`ROADMAP.md` is the canonical task queue. The developer reads it, decides which task each agent picks up, and tells the agent at session start. Open PRs show what is in flight.

## Agent-specific context files

Each agent has its own context file that acts as a tool-specific adapter:

| File        | Read by     | Purpose                                  |
| ----------- | ----------- | ---------------------------------------- |
| `CLAUDE.md` | Claude Code | Conventions, rules, pointers to `docs/`  |
| `AGENTS.md` | Codex       | Same structure, Codex-specific mechanics |

These files are **lean, stable adapters** — not changelogs. They contain conventions and architectural rules. They do not contain task completion history or release narrative.

This was allowed to slip: by 2026-09-06 `CLAUDE.md`'s `## Status` section had grown to 355 KB of per-release narrative (about 96k tokens loaded into every session, half of it a paste duplicate). It was archived to `docs/task-history.md` and the adapter is back to about 7k tokens. The convention is now enforced by the adapter's own closing rule and by `/sv-update-task-docs`, which never writes there.

## Shared skills

The task-lifecycle skills — `sv-task-start`, `sv-task-complete`, `sv-verify`, `sv-security-check`, `sv-update-task-docs`, `sv-create-pr`, `sv-ui-design` — are one agent-neutral body each, kept as **real copies** in `.agents/skills/` (Codex) and `.claude/skills/` (Claude Code). Each says "your instruction file" and "your attribution" instead of naming an agent. `scripts/__tests__/agent-skills-sync.test.ts` fails CI if any file differs between the trees (only `agents/openai.yaml` is Codex-only). Edit one tree, copy to the other.

## Shared source of truth

Both agents read the same `docs/` tree without modification:

- `ROADMAP.md` — task queue and completion record (✅ entries go here)
- `docs/epics/` — full task detail
- `docs/development-workflow.md` — branch/PR/commit mechanics
- `docs/architecture-rules.md` — full detail behind every hard rule; where a reusable lesson is recorded
- `docs/sovereign-proposal-plan-srs.md` — architecture and SRS
- Everything else in `docs/`

Neither agent writes anything to these files that the other would need to undo. Completion is recorded once, in `ROADMAP.md`, in the PR that delivers the work.

## Commit trailers

Commit trailers identify which agent authored the work:

- **Claude Code**: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **Codex**: `Co-Authored-By: Codex <noreply@openai.com>` — confirmed in history (58 commits; 4 early ones used `codex@openai.com`)

The Claude trailer is deliberately model-agnostic. Some Claude Code harnesses inject a model-specific trailer (`Claude Sonnet 5`, `Claude Opus 4.8`, `Claude Fable 5.1`) that overrides the repo rule; 35 such commits exist on `main` and are treated as Claude Code. History is not rewritten for this — use the model-agnostic form going forward.

## What does NOT go in `CLAUDE.md` or `AGENTS.md`

- Task completion entries — use `ROADMAP.md` and the epic heading
- Release narrative — the PR body and the task's `docs/epics/` note; historical narrative is archived in `docs/task-history.md`
- A "next task" pointer — the developer assigns this at session start
- Git history or recent changes — `git log` is authoritative
- Incident stories — the fix is in the code and the PR body. If the incident yields a **reusable rule**, the rule goes in `docs/architecture-rules.md` with the full story, and the adapter gets a one- or two-sentence summary pointing there

## Decision log

| Date       | Decision                                                                  | Rationale                                                                                                    |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-06-29 | Separate clones per agent, no shared working tree                         | Eliminates all coordination overhead; each agent is fully isolated                                           |
| 2026-06-29 | Drop `⏳ Next:` pointer from `CLAUDE.md`                                  | With two agents, a single pointer is ambiguous; the developer is the scheduler                               |
| 2026-06-29 | Drop completion history from `CLAUDE.md` / `AGENTS.md`                    | These files are tool adapters, not changelogs; `ROADMAP.md` + merged PRs are the record                      |
| 2026-06-29 | Agent-specific context files (`CLAUDE.md` / `AGENTS.md`), shared `docs/`  | Each agent gets native context in its own format; project state is not duplicated                            |
| 2026-06-29 | Codex trailer treated as convention, not confirmed identity               | Codex's actual commit attribution config may differ; the trailer is a best-effort convention until confirmed |
| 2026-09-06 | Archive `CLAUDE.md`'s release narrative to `docs/task-history.md`         | The adapter had grown to ~96k tokens per session; narrative belongs in PR bodies and epic notes              |
| 2026-09-06 | One shared skill body per skill, real copies in both trees, test-enforced | Two hand-maintained sets had drifted (different rule tables, two skills on one side only, broken checks)     |
| 2026-09-06 | Codex trailer confirmed from history                                      | 58 commits carry `noreply@openai.com`; the 2026-06-29 caveat is closed                                       |
