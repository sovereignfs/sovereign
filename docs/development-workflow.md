---
docSection: contributors
docType: guide
audiences:
  - contributor
---

# Sovereign — Development Workflow

How tasks are planned, started, implemented, and closed out. Designed for agentic execution with human oversight.

---

## Three-layer information architecture

```
CLAUDE.md / AGENTS.md      ← agent-specific adapter; conventions only (no task pointer)
    │
    └─▶ docs/roadmap.md    ← chronological index; one row per PR; canonical status
            │
            └─▶ docs/epics/<epic>.md   ← full task detail: Goal, Deliverables,
                                           SRS reference, Review checklist
```

Each layer has a single job:

| File                      | Job                             | What agents read it for                                         |
| ------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `CLAUDE.md` / `AGENTS.md` | Agent-specific conventions      | How to work; architectural rules; commit/PR conventions         |
| `docs/roadmap.md`         | Version-ordered task index      | Which tasks exist, their status, which epic file has the detail |
| `docs/epics/<file>.md`    | Full task spec                  | Goal, deliverables, checklist for the active task               |
| `CURRENT_TASK.md`         | Active task scratch (transient) | Everything needed mid-task without re-navigating                |

> **Multi-agent note:** The `⏳ Next` pointer previously in `CLAUDE.md` has been removed. The developer assigns the next task explicitly at session start. See `docs/multi-agent.md` for the full model.

---

## Epic structure

Work is organized into domain epics. Each task has a **stable epic task ID** (`<epic>.<seq>`) that can be cited in PRs, RFCs, and commits independently of roadmap version numbers.

| ID  | Epic file                | Domain                                                    |
| --- | ------------------------ | --------------------------------------------------------- |
| 0   | `infrastructure.md`      | Monorepo, Docker, CI, testing pipeline, deployment        |
| 1   | `users-auth.md`          | Auth server, sessions, MFA, roles, capabilities           |
| 2   | `platform-shell.md`      | Runtime host, middleware, shell modes, SDK bridge         |
| 3   | `plugins-runtime.md`     | Manifest, generate script, SDK contract, plugin lifecycle |
| 4   | `notification-center.md` | In-app inbox, toasts, web push, pub/sub                   |
| 5   | `activity-logs.md`       | Audit trail for user and admin actions                    |
| 6   | `analytics.md`           | Self-hosted privacy-first usage analytics                 |
| 7   | `monetization.md`        | Ed25519 entitlement tokens, billing, payments             |
| 8   | `data-sovereignty.md`    | Backup/restore, portability, per-plugin DB, deletion      |
| 9   | `design-system.md`       | Design system, white-labeling, instance identity, i18n    |
| 10  | `accessibility.md`       | WCAG 2.1 AA, a11y lint, plugin a11y contract              |
| 11  | `i18n.md`                | Internationalization infrastructure and translations      |
| 12  | `example-plugins.md`     | Starter templates and capability-demo plugins             |
| 13  | `plugin-console.md`      | Admin console plugin                                      |
| 14  | `plugin-accounts.md`     | Account plugin                                            |
| 15  | `plugin-launcher.md`     | Launcher plugin                                           |
| 16  | `docs.md`                | VitePress docs site and project landing page              |
| 17  | `desktop.md`             | Native desktop shell                                      |
| 18  | `sovereign-harness.md`   | AI assistant and orchestration layer                      |
| 19  | `sovereign-council.md`   | Multi-model deliberation workspace                        |
| 20  | `mobile.md`              | Native mobile shell                                       |
| 21  | `sovereign-wallet.md`    | Encrypted wallet platform plugin                          |
| 22  | `core-assistant.md`      | Runtime assistant and local inference                     |
| 23  | `p2p-chat.md`            | Companion P2P chat, identity, transport, and E2EE         |
| 24  | `plugin-guide.md`        | First-run orientation and operator guidance plugin        |

The epic index is `docs/epics/README.md` in the repository planning docs.

### Stable IDs vs volatile slots

**Epic task IDs are permanent.** Once an ID like `9.9` is assigned it never changes —
it is the stable identifier for that unit of work. Use epic task IDs in doc
cross-references, RFC `incorporated_into_plan` fields, and task dependency lists.

**Roadmap slot versions are volatile.** A slot like `0.9.2` reflects current priority
ordering and may shift when tasks are reprioritized (e.g. `0.9.5 → 0.9.1`). Always
look up the live slot from `docs/roadmap.md` rather than copying it from another doc;
include roadmap slots only where the shipping order matters (upgrade notes, version
maps).

---

## Task lifecycle

### Starting a task

Run `/sv-task-start`. The skill:

1. The developer specifies the task (epic task ID or description) — there is no `⏳ Next` pointer. See `docs/multi-agent.md`.
2. Confirms `main` is clean and pulls latest.
3. Looks up the epic file via `docs/epics/README.md`, then greps for the task heading to extract the full task block (Goal → Deliverables → SRS reference → Review checklist).
4. Writes **`CURRENT_TASK.md`** in the repo root — the full task spec in one file, no further navigation needed.
5. Reads the relevant RFC if one is referenced.
6. Prints a summary and creates the feature branch.

### During implementation

Read `CURRENT_TASK.md` for task context at any point. It contains everything: goal, deliverables, and the review checklist. No need to re-open the epic file or roadmap mid-task.

### Completing a task

Run `/sv-task-complete`. The skill orchestrates three role agents, two of which run in parallel:

```
[parallel]
  /sv-verify       — runs all checks, returns structured pass/fail summary
  /sv-update-task-docs— updates roadmap row + epic heading, deletes CURRENT_TASK.md
[sequential, after both complete]
  /sv-security-check— only if diff touches auth/middleware/CSP/SDK paths
  main agent       — version bumps + PR description
  /sv-create-pr    — creates the GitHub PR as a draft when requested
```

**`/sv-verify`** reads `CURRENT_TASK.md`, runs `format:check`, `lint`, `typecheck`, `test` (and docs-parity if relevant), and returns a summary table — not raw output. Failures block the PR draft.

**`/sv-update-task-docs`** reads `CURRENT_TASK.md` for metadata, marks the roadmap row ✅, updates the matching epic task heading to ✅, and deletes `CURRENT_TASK.md`. It does not append completion entries to `CLAUDE.md` or `AGENTS.md` — `docs/roadmap.md` and the task's epic heading are the canonical completion markers.

**`/sv-security-check`** (conditional) reviews the diff against the hard architectural rules in `CLAUDE.md` — redirect codes, CSP construction, cookie clearing, session config, `NEXT_PUBLIC_*` usage. Violations block the PR draft.

**`/sv-create-pr`** creates the GitHub pull request. Agent-created PRs are
always opened as **draft** PRs first with `gh pr create --draft`, even when the
human simply says "create the PR". Mark a PR ready for review only after
explicit human instruction.

---

## Status tracking

Status lives in exactly two places:

| Location                          | What it tracks                               |
| --------------------------------- | -------------------------------------------- |
| `docs/roadmap.md` row Status cell | ✅ / ⏳ / 📋 per task — the canonical record |
| Open PRs                          | Which tasks are currently in flight          |

**Epic file headings (`#### ✅ X.Y — …`) are updated when a task completes.** To close a task, mark both the roadmap row and the matching `docs/epics/<file>.md` task heading ✅ in the same PR.

---

## `CURRENT_TASK.md` — the active task file

`CURRENT_TASK.md` is a transient file written by `/sv-task-start` and deleted by `/sv-task-complete`. It is never committed.

```markdown
# Current Task

**Epic task:** 9.9
**Roadmap version:** 0.9.1
**Branch:** feat/email-templates
**Epic file:** docs/epics/design-system.md

---

#### ⏳ 9.9 — Email template system + White-labeling Phase 2 …

**Goal:** …

**Deliverables:** …

**SRS reference:** …

**Review checklist:** …
```

Any agent or sub-agent working on the current task should read this file first. It is the single source of truth for what is being built right now.

If `CURRENT_TASK.md` does not exist, no task is in progress — run `/sv-task-start` to begin one.

---

## Cross-references between epics

Some tasks belong primarily to one epic but are relevant to another (e.g. per-plugin database is in Plugins Runtime but is also a Data Sovereignty concern). The secondary epic contains a short cross-reference block instead of duplicating the full entry:

```markdown
#### ✅ 8.3 — Per-plugin database

> Full entry: **[3.13]** in [plugins-runtime.md](plugins-runtime.md) — Per-plugin database.
> This task provisions the isolated storage layer that keeps plugin data physically separate
> from the platform DB — a key component of data sovereignty.

---
```

The `**[3.13]**` notation is the stable epic task ID. It survives task renames because it references the ID, not a markdown anchor.

---

## Version identifiers

When a PR bumps a package version, use the release identifier as the version-bump
commit subject and as the release tag:

| Versioned target                 | Commit subject / tag |
| -------------------------------- | -------------------- |
| Root `package.json`              | `vX.Y.Z`             |
| `packages/ui`                    | `ui-vX.Y.Z`          |
| `apps/docs`                      | `docs-vX.Y.Z`        |
| `packages/sdk`                   | `sdk-vX.Y.Z`         |
| Any other package/app/plugin tag | `<slug>-vX.Y.Z`      |

Use the package slug from the workspace path unless a public release workflow
defines a more specific slug.

---

## Role agents

Four focused skills cover the non-implementation phases of a task. Each needs only `CURRENT_TASK.md` plus its own skill file — no full project orientation required.

| Skill                  | Trigger                                                 | What it does                                                          |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `/sv-verify`           | Parallel with `/sv-update-task-docs` at task-complete   | Runs all checks, returns structured pass/fail table                   |
| `/sv-update-task-docs` | Parallel with `/sv-verify` at task-complete             | Marks roadmap and epic heading ✅, deletes CURRENT_TASK.md            |
| `/sv-security-check`   | Conditional — when diff touches auth/middleware/CSP/SDK | Reviews diff against hard architectural rules, blocks PR on violation |
| `/sv-task-start`       | Session start                                           | Writes CURRENT_TASK.md, creates branch                                |

Each agent is briefed with `CURRENT_TASK.md` (~50 lines) rather than the full project context. The Verifier and Docs Updater run in parallel, so the task-complete wall-clock is bounded by whichever takes longer (verification, ~30–60s) rather than their sum.

---

## Quick reference for agents

| I need to know…                      | Read…                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| What task is next                    | Ask the developer; check `docs/roadmap.md` for pending tasks |
| Full spec for the current task       | `CURRENT_TASK.md`                                            |
| Full spec for any task by epic ID    | `docs/epics/<file>.md` — grep for `^#### .*<id>`             |
| All tasks in a domain                | `docs/epics/<file>.md`                                       |
| Roadmap version number for a task    | `docs/roadmap.md`                                            |
| Which epic a roadmap task belongs to | `docs/roadmap.md` → Epic task column                         |
| Epic file for a given epic ID        | `docs/epics/README.md`                                       |
| Project conventions and hard rules   | `CLAUDE.md`                                                  |
| Security rules to check against      | `CLAUDE.md` → "Hard architectural rules" section             |
