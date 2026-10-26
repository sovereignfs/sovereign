# Multi-Agent Development Model

How Claude Code and Codex work on this repository side by side.

## The model

Each agent works from its own **separate local clone** of the repository. There
is no shared working tree, no shared branch, and no shared `CURRENT_TASK.md`.
Agents work independently; the only shared state is `main` (via git).

```
Developer
   ├── Clone A  →  Claude Code
   └── Clone B  →  Codex
              ↑
           git remote (shared main)
```

## Task assignment

The **developer assigns tasks explicitly** at the start of each session. Neither
agent infers its next task from a file — there is no "next" pointer in any
document.

`ROADMAP.md` is the canonical task queue. The developer reads it, decides which
task each agent picks up, and tells the agent at session start. Open PRs show
what is in flight.

## One instruction file

| File        | Read by                 | Purpose                                                    |
| ----------- | ----------------------- | ---------------------------------------------------------- |
| `AGENTS.md` | Codex; every agent      | The conventions and architectural rules — the only copy    |
| `CLAUDE.md` | Claude Code             | Imports `AGENTS.md` and adds only Claude Code specifics    |

Keeping one copy means the two agents can never follow diverging rules. Both
files are **lean, stable instructions** — not changelogs. They contain
conventions and architectural rules, never task completion history or release
narrative. (The legacy Sovereign repository kept two parallel copies, and one
grew to hundreds of kilobytes of per-release narrative loaded into every
session; this layout and the closing rule in `AGENTS.md` exist to prevent
that.)

## Shared skills

The task-lifecycle skills — `sv-task-start`, `sv-task-complete`, `sv-verify`,
`sv-security-check`, `sv-update-task-docs`, `sv-create-pr`, `sv-ui-design` — are
one agent-neutral body each, kept as **real copies** in `.agents/skills/`
(Codex) and `.claude/skills/` (Claude Code), because each tool loads skills only
from its own directory. Each says "your instruction file" and "your
attribution" instead of naming an agent. A test fails CI if any file differs
between the trees (only `agents/openai.yaml` is Codex-only). Edit one tree, copy
to the other.

## Shared source of truth

Both agents read the same `docs/` tree without modification:

- `docs/specs/core-app.md` — what core must do
- `ROADMAP.md` — task queue and completion record (✅ entries go here)
- `docs/epics/` — full task detail
- `docs/development-workflow.md` — branch/PR/commit mechanics
- `docs/architecture-rules.md` — full detail behind every hard rule; where a
  reusable lesson is recorded
- Everything else in `docs/` and `spec/`

Neither agent writes anything to these files that the other would need to
undo. Completion is recorded once, in `ROADMAP.md`, in the PR that delivers the
work.

## Commit trailers

Commit trailers identify which agent authored the work:

- **Claude Code**: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **Codex**: `Co-Authored-By: Codex <noreply@openai.com>`

The Claude trailer is deliberately model-agnostic. Some Claude Code harnesses
suggest a model-specific trailer; use the model-agnostic form regardless. PR
footers follow the same split:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)` or
`🤖 Generated with [Codex](https://developers.openai.com/codex)`.

## What does NOT go in `AGENTS.md` or `CLAUDE.md`

- Task completion entries — use `ROADMAP.md` and the epic heading
- Release narrative — the PR body and the task's `docs/epics/` note
- A "next task" pointer — the developer assigns this at session start
- Git history or recent changes — `git log` is authoritative
- Incident stories — the fix is in the code and the PR body. If the incident
  yields a **reusable rule**, the rule goes in `docs/architecture-rules.md` with
  the full story, and `AGENTS.md` gets a one- or two-sentence summary pointing
  there
