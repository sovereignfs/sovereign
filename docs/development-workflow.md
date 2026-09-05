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
    └─▶ ROADMAP.md    ← chronological index; one row per PR; canonical status
            │
            └─▶ docs/epics/<epic>.md   ← full task detail: Goal, Deliverables,
                                           SRS reference, Review checklist
```

Each layer has a single job:

| File                         | Job                             | What agents read it for                                         |
| ---------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `CLAUDE.md` / `AGENTS.md`    | Agent-specific conventions      | How to work; architectural rules; commit/PR conventions         |
| `ROADMAP.md`                 | Version-ordered task index      | Which tasks exist, their status, which epic file has the detail |
| `docs/epics/<file>.md`       | Full task spec                  | Goal, deliverables, checklist for the active task               |
| `CURRENT_TASK.md`            | Active task scratch (transient) | Everything needed mid-task without re-navigating                |
| `docs/workstreams/<file>.md` | Goal-ordered task sequence      | Dependency order across epics, decisions already locked, gates  |

> **Multi-agent note:** The `⏳ Next` pointer previously in `CLAUDE.md` has been removed. The developer assigns the next task explicitly at session start. See `docs/multi-agent.md` for the full model.

---

## Epic structure

Work is organized into domain epics. Each task has a **stable epic task ID** (`<epic>.<seq>`) that can be cited in PRs, RFCs, and commits independently of roadmap version numbers.

| ID  | Epic file                | Domain                                                                                              |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 0   | `infrastructure.md`      | Monorepo, Docker, CI, testing pipeline, deployment                                                  |
| 1   | `users-auth.md`          | Auth server, sessions, MFA, roles, capabilities                                                     |
| 2   | `platform-shell.md`      | Runtime host, middleware, shell modes, SDK bridge                                                   |
| 3   | `plugins-runtime.md`     | Manifest, generate script, SDK contract, plugin lifecycle                                           |
| 4   | `notification-center.md` | In-app inbox, toasts, web push, pub/sub                                                             |
| 5   | `activity-logs.md`       | Audit trail for user and admin actions                                                              |
| 6   | `analytics.md`           | Self-hosted privacy-first usage analytics                                                           |
| 7   | `monetization.md`        | Ed25519 entitlement tokens, billing, payments                                                       |
| 8   | `data-sovereignty.md`    | Backup/restore, portability, per-plugin DB, deletion                                                |
| 9   | `design-system.md`       | Design system, white-labeling, instance identity, i18n                                              |
| 10  | `accessibility.md`       | WCAG 2.1 AA, a11y lint, plugin a11y contract                                                        |
| 11  | `i18n.md`                | Internationalization infrastructure and translations                                                |
| 12  | `example-plugins.md`     | Starter templates and capability-demo plugins                                                       |
| 13  | `plugin-console.md`      | Admin console plugin                                                                                |
| 14  | `plugin-accounts.md`     | Account plugin                                                                                      |
| 15  | `plugin-launcher.md`     | Launcher plugin                                                                                     |
| 16  | `docs.md`                | Docs site content and project landing page (VitePress build now lives in `sovereignfs/sovereignfs`) |
| 17  | `desktop.md`             | Native desktop shell                                                                                |
| 18  | `sovereign-harness.md`   | AI assistant and orchestration layer                                                                |
| 19  | `sovereign-council.md`   | Multi-model deliberation workspace                                                                  |
| 20  | `mobile.md`              | Native mobile shell                                                                                 |
| 21  | `sovereign-wallet.md`    | Encrypted wallet platform plugin                                                                    |
| 22  | `core-assistant.md`      | Runtime assistant and local inference                                                               |
| 23  | `p2p-chat.md`            | Companion P2P chat, identity, transport, and E2EE                                                   |
| 24  | `plugin-guide.md`        | First-run orientation and operator guidance plugin                                                  |

The epic index is `docs/epics/README.md` in the repository planning docs.

### Stable IDs vs volatile slots

**Epic task IDs are permanent.** Once an ID like `9.9` is assigned it never changes —
it is the stable identifier for that unit of work. Use epic task IDs in doc
cross-references, RFC `incorporated_into_plan` fields, and task dependency lists.

**Roadmap slot versions are volatile.** A slot like `0.9.2` reflects current priority
ordering and may shift when tasks are reprioritized (e.g. `0.9.5 → 0.9.1`). Always
look up the live slot from `ROADMAP.md` rather than copying it from another doc;
include roadmap slots only where the shipping order matters (upgrade notes, version
maps).

---

## Workstreams and the leg contract

Epics group tasks by **domain**; a **workstream**
(`docs/workstreams/`) groups them by **goal** and orders them across epics. A
workstream exists so the developer can point at a feature and have it executed
end to end without re-briefing at every step.

A workstream is divided into **legs**, and the leg is what makes that compatible
with one-task-at-a-time review:

```
leg = one branch = one PR = one review gate
```

- **Within a leg**, the agent implements every task in order, committing per
  task, without stopping for review between them.
- **At the end of a leg**, it verifies, opens a **draft** PR, and stops. It does
  not merge and does not start the next leg.
- **Across legs**, the existing rule is unchanged: the previous leg's PR must be
  merged before the next leg's branch is cut.

So "do not start a task on an unmerged PR" is scoped to **leg** boundaries
rather than task boundaries. That is the only workflow rule a workstream changes.
**Never merge a PR automatically** is unaffected and not negotiable by a
workstream.

Consequences:

- **One version bump per leg**, not per task, since a leg is one PR. Semver
  follows the largest change in the leg.
- **Branch name follows the leg**, e.g. `feat/<workstream-slug>-leg-<n>`.
- **A leg must be independently reviewable.** If its PR is too large to review
  honestly, the leg was drawn too wide — split it. Legs are a reviewability unit
  first and an autonomy unit second.
- A leg marked a **gate** determines whether later legs proceed at all; a
  negative result stops the workstream rather than being worked around.

> **Wired into the skills.** `/sv-task-start` accepts a leg assignment
> ("workstream 0023 leg 5") and writes `CURRENT_TASK.md` in **leg mode** — the
> leg's detail block plus every task block in it. `/sv-task-complete` and
> `/sv-update-task-docs` read that mode: one verification pass, one version
> bump, every task's roadmap row and epic heading marked ✅, the workstream
> doc's changelog updated, and a stop at the draft PR.

Full definition, required sections, and the authoring template:
[`docs/workstreams/README.md`](workstreams/README.md).

---

## Task lifecycle

### Starting a task

Run `/sv-task-start`. The skill:

1. The developer specifies the task (epic task ID or description) or the workstream leg ("workstream 0023 leg 5") — there is no `⏳ Next` pointer. See `docs/multi-agent.md`.
2. Confirms `main` is clean and pulls latest; for a leg, confirms the previous leg's PR is merged and the leg's "Do not proceed if" clause doesn't hold.
3. Looks up the epic file via `docs/epics/README.md`, then greps for the task heading to extract the full task block (Goal → Deliverables → SRS reference → Review checklist) — for every task in the leg.
4. Writes **`CURRENT_TASK.md`** in the repo root — the full spec in one file (`**Mode:** task` or `**Mode:** leg`), no further navigation needed.
5. Reads the relevant RFC(s) if referenced.
6. Prints a summary and creates the branch (`feat/<workstream-slug>-leg-<n>` for a leg).

### During implementation

Read `CURRENT_TASK.md` for task context at any point. It contains everything: goal, deliverables, and the review checklist. No need to re-open the epic file or roadmap mid-task.

### Completing a task

Run `/sv-task-complete`. Verification runs first, followed by any security review
and required version bumps; task-document updates run only after the final root
version is known:

```
/sv-verify          — runs all checks, returns structured pass/fail summary
/sv-security-check  — only if diff touches auth/middleware/CSP/SDK paths
main agent          — applies required version bumps
/sv-update-task-docs— records version, relocates/completes roadmap row,
                      updates epic heading, deletes CURRENT_TASK.md
main agent          — prepares PR description
/sv-create-pr       — creates the GitHub PR as a draft when requested
```

**`/sv-verify`** reads `CURRENT_TASK.md`, runs `format:check`, `lint`, `typecheck`, `design:tokens:check`, `docs:check-links`, `test`, and `build` (plus docs-parity, UI typecheck, and `registry:check` when relevant), checks the version-bearing docs agree with `package.json`, and returns a summary table — not raw output. Failures block the PR draft.

**`/sv-update-task-docs`** reads `CURRENT_TASK.md` for metadata, records the
final root platform version when one was bumped, moves completed rows out of
Non-prioritised Tasks into the correct client phase, marks the roadmap row(s)
and matching epic heading(s) ✅, updates the `Status:` line of any RFC the work
advances (and its row in `docs/rfcs/README.md`), appends a workstream changelog
row in leg mode, and deletes `CURRENT_TASK.md`. It does not append completion
entries to `CLAUDE.md` or `AGENTS.md` — `ROADMAP.md`, the task's epic heading,
and the PR body are the canonical record.

**`/sv-security-check`** (conditional) reviews the diff against the security-relevant hard rules (`docs/architecture-rules.md`) — server-action authorization, `/api/admin` trust, middleware redirects/matcher/CSP, secrets, spawned processes, SDK permission checks. Violations block the PR draft.

**`/sv-create-pr`** creates the GitHub pull request. Agent-created PRs are
always opened as **draft** PRs first with `gh pr create --draft`, even when the
human simply says "create the PR". Mark a PR ready for review only after
explicit human instruction.

---

## Status tracking

Status lives in exactly two places:

| Location                     | What it tracks                               |
| ---------------------------- | -------------------------------------------- |
| `ROADMAP.md` row Status cell | ✅ / ⏳ / 📋 per task — the canonical record |
| Open PRs                     | Which tasks are currently in flight          |

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
| `packages/sdk`                   | `sdk-vX.Y.Z`         |
| Any other package/app/plugin tag | `<slug>-vX.Y.Z`      |

Use the package slug from the workspace path unless a public release workflow
defines a more specific slug.

---

## Role agents

Focused skills cover the non-implementation phases of a task. Each needs only `CURRENT_TASK.md` plus its own skill file — no full project orientation required. The skills live in `.agents/skills/` (Codex) and `.claude/skills/` (Claude Code) as byte-identical copies; `scripts/__tests__/agent-skills-sync.test.ts` fails CI if they diverge, so edit one and copy to the other.

| Skill                  | Trigger                                                 | What it does                                                          |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `/sv-verify`           | Parallel with `/sv-update-task-docs` at task-complete   | Runs all checks, returns structured pass/fail table                   |
| `/sv-update-task-docs` | Parallel with `/sv-verify` at task-complete             | Marks roadmap and epic heading ✅, deletes CURRENT_TASK.md            |
| `/sv-security-check`   | Conditional — when diff touches auth/middleware/CSP/SDK | Reviews diff against hard architectural rules, blocks PR on violation |
| `/sv-task-start`       | Session start                                           | Writes CURRENT_TASK.md, creates branch                                |

Each agent is briefed with `CURRENT_TASK.md` (~50 lines) rather than the full project context. The Verifier and Docs Updater run in parallel, so the task-complete wall-clock is bounded by whichever takes longer (verification, ~30–60s) rather than their sum.

---

## Quick reference for agents

| I need to know…                      | Read…                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| What task is next                    | Ask the developer; check `ROADMAP.md` for pending tasks |
| Full spec for the current task       | `CURRENT_TASK.md`                                       |
| Full spec for any task by epic ID    | `docs/epics/<file>.md` — grep for `^#### .*<id>`        |
| All tasks in a domain                | `docs/epics/<file>.md`                                  |
| Roadmap version number for a task    | `ROADMAP.md`                                            |
| Which epic a roadmap task belongs to | `ROADMAP.md` → Epic task column                         |
| Epic file for a given epic ID        | `docs/epics/README.md`                                  |
| Project conventions and hard rules   | `CLAUDE.md`                                             |
| Security rules to check against      | `CLAUDE.md` → "Hard architectural rules" section        |
