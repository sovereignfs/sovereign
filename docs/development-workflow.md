# Sovereign — Development Workflow

How tasks are planned, started, implemented, and closed out. Designed for agentic execution with human oversight.

---

## Three-layer information architecture

```
CLAUDE.md                  ← session entry point; ⏳ Next pointer; conventions
    │
    └─▶ docs/roadmap.md    ← chronological index; one row per PR; canonical status
            │
            └─▶ docs/epics/<epic>.md   ← full task detail: Goal, Deliverables,
                                           SRS reference, Review checklist
```

Each layer has a single job:

| File                   | Job                             | What agents read it for                                         |
| ---------------------- | ------------------------------- | --------------------------------------------------------------- |
| `CLAUDE.md`            | Conventions + `⏳ Next` pointer | What task is next; how to work                                  |
| `docs/roadmap.md`      | Version-ordered task index      | Which tasks exist, their status, which epic file has the detail |
| `docs/epics/<file>.md` | Full task spec                  | Goal, deliverables, checklist for the active task               |
| `CURRENT_TASK.md`      | Active task scratch (transient) | Everything needed mid-task without re-navigating                |

---

## Epic structure

Work is organized into 16 domain epics. Each task has a **stable epic task ID** (`<epic>.<seq>`) that can be cited in PRs, RFCs, and commits independently of roadmap version numbers.

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
| 9   | `theming.md`             | Design system, white-labeling, instance identity, i18n    |
| 10  | `accessibility.md`       | WCAG 2.1 AA, a11y lint, plugin a11y contract              |
| 11  | `i18n.md`                | Internationalization infrastructure and translations      |
| 12  | `example-plugins.md`     | Starter templates and capability-demo plugins             |
| 13  | `plugin-console.md`      | Admin console plugin                                      |
| 14  | `plugin-accounts.md`     | Account plugin                                            |
| 15  | `plugin-launcher.md`     | Launcher plugin                                           |

The epic index is at [`docs/epics/README.md`](epics/README.md).

---

## Task lifecycle

### Starting a task

Run `/task-start`. The skill:

1. Reads the `⏳ Next` pointer in `CLAUDE.md` to identify the task.
2. Confirms `main` is clean and pulls latest.
3. Looks up the epic file via [`docs/epics/README.md`](epics/README.md), then greps for the task heading to extract the full task block (Goal → Deliverables → SRS reference → Review checklist).
4. Writes **`CURRENT_TASK.md`** in the repo root — the full task spec in one file, no further navigation needed.
5. Reads the relevant RFC if one is referenced.
6. Prints a summary and creates the feature branch.

### During implementation

Read `CURRENT_TASK.md` for task context at any point. It contains everything: goal, deliverables, and the review checklist. No need to re-open the epic file or roadmap mid-task.

### Completing a task

Run `/task-complete`. The skill:

1. Runs the verification checklist (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
2. Checks docs parity if manifest/SDK/env vars changed.
3. Updates `docs/roadmap.md` — changes the task row's Status cell to ✅.
4. Updates `CLAUDE.md` — appends a one-line ✅ completion entry and updates the `⏳ Next` pointer to include the epic file path (e.g. `⏳ Next: Task 0.9.2 — Title → epic task [9.10](docs/epics/theming.md)`).
5. Deletes `CURRENT_TASK.md`.
6. Bumps versions per semver policy.
7. Drafts the PR description.

---

## Status tracking

Status lives in exactly two places:

| Location                          | What it tracks                               |
| --------------------------------- | -------------------------------------------- |
| `docs/roadmap.md` row Status cell | ✅ / ⏳ / 📋 per task — the canonical record |
| `CLAUDE.md` `⏳ Next` pointer     | Which task is up next                        |

**Epic file headings (`#### ✅ X.Y — …`) are set once when the task is written and not updated thereafter.** They show the state at the time of authoring. To know the current status of a task, check the roadmap row.

---

## `CURRENT_TASK.md` — the active task file

`CURRENT_TASK.md` is a transient file written by `/task-start` and deleted by `/task-complete`. It is never committed.

```markdown
# Current Task

**Epic task:** 9.9
**Roadmap version:** 0.9.1
**Branch:** feat/email-templates
**Epic file:** docs/epics/theming.md

---

#### ⏳ 9.9 — Email template system + White-labeling Phase 2 …

**Goal:** …

**Deliverables:** …

**SRS reference:** …

**Review checklist:** …
```

Any agent or sub-agent working on the current task should read this file first. It is the single source of truth for what is being built right now.

If `CURRENT_TASK.md` does not exist, no task is in progress — run `/task-start` to begin one.

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

## Quick reference for agents

| I need to know…                      | Read…                                            |
| ------------------------------------ | ------------------------------------------------ |
| What task is next                    | `CLAUDE.md` → `⏳ Next` line                     |
| Full spec for the current task       | `CURRENT_TASK.md`                                |
| Full spec for any task by epic ID    | `docs/epics/<file>.md` — grep for `^#### .*<id>` |
| All tasks in a domain                | `docs/epics/<file>.md`                           |
| Roadmap version number for a task    | `docs/roadmap.md`                                |
| Which epic a roadmap task belongs to | `docs/roadmap.md` → Epic task column             |
| Epic file for a given epic ID        | `docs/epics/README.md`                           |
| Project conventions and hard rules   | `CLAUDE.md`                                      |
