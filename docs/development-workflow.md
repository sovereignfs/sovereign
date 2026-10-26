# Sovereign Core — Development Workflow

How tasks are planned, started, implemented, and closed out. Designed for
agentic execution with human oversight.

---

## Three-layer information architecture

```
AGENTS.md (CLAUDE.md imports it)   ← conventions only (no task pointer)
    │
    └─▶ ROADMAP.md    ← chronological index; one row per PR; canonical status
            │
            └─▶ docs/epics/<epic>.md   ← full task detail: Goal, Deliverables,
                                           Spec reference, Review checklist
```

What the core app must do is defined separately, in
[`docs/specs/core-app.md`](specs/core-app.md); every task cites the spec
sections it implements.

Each layer has a single job:

| File                         | Job                             | What agents read it for                                         |
| ---------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `AGENTS.md` / `CLAUDE.md`    | Conventions                     | How to work; architectural rules; commit/PR conventions         |
| `ROADMAP.md`                 | Ordered task index              | Which tasks exist, their status, which epic file has the detail |
| `docs/epics/<file>.md`       | Full task spec                  | Goal, deliverables, checklist for the active task               |
| `docs/specs/core-app.md`     | What core must do               | The behaviour a task implements                                 |
| `CURRENT_TASK.md`            | Active task scratch (transient) | Everything needed mid-task without re-navigating                |
| `docs/workstreams/<file>.md` | Goal-ordered task sequence      | Dependency order across epics, decisions already locked, gates  |

> **Multi-agent note:** there is no "next task" pointer anywhere. The developer
> assigns the next task explicitly at session start. See
> [`docs/multi-agent.md`](multi-agent.md).

---

## Epic structure

Work is organized into domain epics. Each task has a **stable epic task ID**
(`<epic>.<seq>`) that can be cited in PRs, RFCs, and docs independently of
roadmap versions.

The epic index — every epic's ID, file, status, and summary — is
[`docs/epics/README.md`](epics/README.md). It is the only copy; look IDs up
there rather than in a table here that would drift.

### Stable IDs vs volatile versions

**Epic task IDs are permanent.** Once an ID like `4.3` is assigned it never
changes — it is the stable identifier for that unit of work. Use epic task IDs
in doc cross-references, RFC `incorporated_into_plan` fields, and task
dependency lists.

**Roadmap versions are volatile.** The order of pending rows reflects current
priority and may change. Always look up a task's version in `ROADMAP.md` rather
than copying it into another doc; include versions only where the shipping
order matters (upgrade notes, version maps).

---

## Workstreams and the leg contract

A **workstream** (`docs/workstreams/<NNNN>-<slug>.md`) groups tasks from several
epics into a goal-ordered sequence when a feature cuts across domains and its
tasks must land in dependency order. It is divided into **legs**:

- **One leg = one branch = one PR = one review gate.** Every task in a leg is
  implemented uninterrupted, verified together, and opened as one draft PR.
- A leg bumps the root version **once**, by its largest change.
- A leg may name a **Do not proceed if** condition, checked before it starts,
  and may be a **gate**: the next leg waits for an explicit decision.
- The workstream document records legs, decisions already locked, and a
  changelog row per completed leg.

There are no workstreams yet; `docs/workstreams/README.md` is created with the
first one.

---

## Task lifecycle

### Starting a task

Run `/sv-task-start`. The skill:

1. Takes the task the developer specifies (epic task ID or description) or the
   workstream leg ("workstream 0001 leg 2") — there is no "next" pointer.
2. Confirms `main` is clean and pulls latest; for a leg, confirms the previous
   leg's PR is merged and the leg's "Do not proceed if" clause doesn't hold.
3. Looks up the epic file via `docs/epics/README.md`, then extracts the full
   task block (Goal → Deliverables → Spec reference → Review checklist) — for
   every task in the leg.
4. Writes **`CURRENT_TASK.md`** in the repo root — the full task in one file
   (`**Mode:** task` or `**Mode:** leg`), no further navigation needed.
5. Reads the spec sections and any RFC the task references.
6. Prints a summary and creates the branch (`feat/<workstream-slug>-leg-<n>` for
   a leg).

### During implementation

Read `CURRENT_TASK.md` for task context at any point. It contains everything:
goal, deliverables, spec references and the review checklist. No need to
re-open the epic file or roadmap mid-task.

### Completing a task

Run `/sv-task-complete`. Verification runs first, followed by any security
review and required version bumps; task-document updates run only after the
final root version is known:

```
/sv-verify          — runs all checks, returns structured pass/fail summary
/sv-security-check  — only if the diff touches auth, the proxy, API routes,
                      server actions, OIDC, secrets, scripts, Docker, or env
main agent          — applies required version bumps
/sv-update-task-docs— records version, completes roadmap row,
                      updates epic heading, deletes CURRENT_TASK.md
main agent          — prepares PR description
/sv-create-pr       — creates the GitHub PR as a draft when requested
```

**`/sv-verify`** reads `CURRENT_TASK.md`, runs `format:check`, `lint`,
`typecheck`, `design:tokens:check`, `docs:check-links`, `test`, and `build`
(plus the contract tests and the UI typecheck when relevant), checks the
version-bearing docs agree with `package.json`, and returns a summary table —
not raw output. Failures block the PR draft.

**`/sv-update-task-docs`** reads `CURRENT_TASK.md` for metadata, records the
final root version when one was bumped, marks the roadmap row(s) and matching
epic heading(s) ✅, updates the `Status:` line of any RFC the work advances (and
its row in `docs/rfcs/README.md`), appends a workstream changelog row in leg
mode, and deletes `CURRENT_TASK.md`. It does not append completion entries to
`AGENTS.md` or `CLAUDE.md` — `ROADMAP.md`, the task's epic heading, and the PR
body are the canonical record.

**`/sv-security-check`** (conditional) reviews the diff against the
security-relevant hard rules (`docs/architecture-rules.md`) — server-action
authorization, proxy redirects and CSP, OIDC and token handling, secrets,
spawned processes. Violations block the PR draft.

**`/sv-create-pr`** creates the GitHub pull request. Agent-created PRs are
always opened as **draft** PRs first with `gh pr create --draft`, even when the
human simply says "create the PR". Mark a PR ready for review only after
explicit human instruction.

---

## Status tracking

Status lives in exactly two places:

| Location                     | What it tracks                      |
| ---------------------------- | ----------------------------------- |
| `ROADMAP.md` row Status cell | per task — the canonical record     |
| Open PRs                     | Which tasks are currently in flight |

Status values, used identically in `ROADMAP.md` rows and epic headings:

| Status | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| 📋     | Planned — not started                                                                |
| ⏳     | In progress — a branch/PR is open for it                                             |
| ✅     | Complete — merged to `main`                                                          |
| 🚧     | Parked — deliberately paused; the heading names what must be re-read before resuming |
| ❌     | Rejected — decided against, kept for the record; never delete the row or heading     |

**Epic file headings (`#### ✅ X.Y — …`) are updated when a task completes.** To
close a task, mark both the roadmap row and the matching `docs/epics/<file>.md`
task heading ✅ in the same PR.

---

## `CURRENT_TASK.md` — the active task file

`CURRENT_TASK.md` is a transient, gitignored file written by `/sv-task-start`
and deleted by `/sv-update-task-docs` (the last step `/sv-task-complete` runs).
It is never committed. It has two modes: **task** (one epic task) and **leg**
(one workstream leg — the leg's detail block plus every task block in it).

```markdown
# Current Task

**Mode:** task
**Epic task:** 4.3
**Roadmap version:** —
**Branch:** feat/email-verification-reset
**Epic file:** docs/epics/identity-auth.md
**Spec:** core-app §3.3.3, §3.3.4
**RFCs:** none

---

#### ⏳ 4.3 — Email verification and password reset

**Goal:** …

**Deliverables:** …

**Dependencies:** …

**Spec reference:** …

**Review checklist:** …
```

Leg mode uses `**Mode:** leg`, `**Workstream:**`, `**Leg:**`, `**Epic tasks:**`,
and `**Epic files:**` instead, followed by a `## Leg detail` block and one
`## Task <id>` block per task — the exact shape is in the `sv-task-start`
skill.

Any agent or sub-agent working on the current task should read this file first.
It is the single source of truth for what is being built right now.

If `CURRENT_TASK.md` does not exist, no task is in progress — run
`/sv-task-start` to begin one.

---

## Cross-references between epics

Some tasks belong primarily to one epic but are relevant to another. The
secondary epic contains a short cross-reference block instead of duplicating the
full entry:

```markdown
#### 📋 8.6 — Apps

> Full entry: **[7.1]** in [apps-launcher.md](apps-launcher.md) — Client registry.
> The Console pages register and manage the clients that task defines.

---
```

The `**[7.1]**` notation is the stable epic task ID. It survives task renames
because it references the ID, not a markdown anchor.

---

## Version identifiers

When a PR bumps a version, use the release identifier as the version-bump
commit subject and as the release tag:

| Versioned target    | Commit subject / tag |
| ------------------- | -------------------- |
| Root `package.json` | `vX.Y.Z`             |
| `packages/ui`       | `ui-vX.Y.Z`          |
| `packages/bridge`   | `bridge-vX.Y.Z`      |
| `apps/core`         | `core-vX.Y.Z`        |
| Any other package   | `<slug>-vX.Y.Z`      |

Use the package slug from the workspace path unless a release workflow defines a
more specific slug. The bump rules themselves are in `AGENTS.md`.

---

## Role agents

Focused skills cover the non-implementation phases of a task. Each needs only
`CURRENT_TASK.md` plus its own skill file — no full project orientation
required. The skills live in `.agents/skills/` (Codex) and `.claude/skills/`
(Claude Code) as byte-identical copies; a test fails CI if they diverge, so edit
one and copy to the other.

| Skill                  | Trigger                                                              | What it does                                                                                      |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/sv-task-start`       | Session start, with a task or leg assignment                         | Writes CURRENT_TASK.md (task or leg mode), creates the branch                                     |
| `/sv-ui-design`        | Any change a person sees                                             | DS-first rules, plain-language copy, error UX, wireframe-before-build, pre-merge checklist        |
| `/sv-task-complete`    | Implementation done                                                  | Orchestrates the four steps below in order, then drafts the PR description                        |
| `/sv-verify`           | Step 1 of task-complete, or standalone                               | Runs all checks, returns a structured pass/fail table                                             |
| `/sv-security-check`   | Step 2, conditional — auth, proxy, API, server actions, OIDC, Docker | Reviews the diff against the security-relevant hard rules, blocks the PR on a violation           |
| `/sv-update-task-docs` | Step 4, after the version bump                                       | Marks roadmap row(s) and epic heading(s) ✅, syncs RFC/workstream status, deletes CURRENT_TASK.md |
| `/sv-create-pr`        | Only when the developer asks                                         | Opens the GitHub PR as a draft                                                                    |

Each agent is briefed with `CURRENT_TASK.md` rather than the full project
context. The steps run **sequentially**, not in parallel: verification must pass
before anything else, and the docs updater needs the final root version from
the bump step, so it runs last.

---

## Quick reference for agents

| I need to know…                      | Read…                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| What task is next                    | Ask the developer; check `ROADMAP.md` for pending tasks |
| Full spec for the current task       | `CURRENT_TASK.md`                                       |
| Full spec for any task by epic ID    | `docs/epics/<file>.md` — grep for `^#### .*<id>`        |
| What core must do                    | `docs/specs/core-app.md`                                |
| All tasks in a domain                | `docs/epics/<file>.md`                                  |
| Roadmap version for a task           | `ROADMAP.md`                                            |
| Which epic a roadmap task belongs to | `ROADMAP.md` → Epic task column                         |
| Epic file for a given epic ID        | `docs/epics/README.md`                                  |
| Project conventions and hard rules   | `AGENTS.md` (Claude Code loads it via `CLAUDE.md`)      |
| Full detail behind any hard rule     | `docs/architecture-rules.md`                            |
| Security rules to check against      | `docs/architecture-rules.md` via `/sv-security-check`   |
| How a task or leg is run end to end  | `.agents/skills/sv-*/SKILL.md` (mirrored in `.claude/`) |
