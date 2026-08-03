---
docSection: contributors
docType: policy
audiences:
  - contributor
---

# Workstreams

A **workstream** is an ordered, cross-epic sequence of tasks that together
deliver one complete feature, plus the technical context needed to execute it
without re-deriving the design.

The developer points at a workstream and says "start this" — and the agent works
through it leg by leg without needing to be re-briefed at every step.

## Why this exists

The three existing planning layers each do one job well, and none of them do
this one:

| Layer                   | Organizes by   | Answers                                |
| ----------------------- | -------------- | -------------------------------------- |
| `ROADMAP.md`            | shipping order | "what's next, what's done"             |
| `docs/epics/<file>.md`  | domain         | "everything we'll ever do to auth"     |
| `docs/rfcs/`            | decision       | "why we chose this design"             |
| **`docs/workstreams/`** | **goal**       | **"the ordered path to this feature"** |

A real feature rarely lives in one epic. Standalone plugin apps touch Platform
Shell (epic 2), Plugins Runtime (epic 3), and Mobile (epic 20); reading any one
epic file shows a third of the picture in the wrong order, and the roadmap shows
the rows without the dependencies between them. A workstream is the missing
view: **dependency order across epics, with the design decisions already
settled so they are not re-litigated mid-execution.**

> **Terminology:** an _epic_ groups tasks by **domain**; a _workstream_ groups
> them by **goal** and cuts across domains. Epic task IDs remain the permanent
> identifiers — a workstream references them, it never replaces or renumbers
> them.

## What a workstream is not

- **Not a task spec.** Full task detail stays in `docs/epics/<file>.md`. A
  workstream references epic task IDs and adds ordering, gates, and
  cross-cutting technical context.
- **Not a design document.** Design lives in RFCs. A workstream records which
  RFCs govern it and which decisions are already locked.
- **Not a status tracker.** Status stays in `ROADMAP.md` rows and epic headings.
  A workstream's own progress is derivable from those.
- **Not a licence to skip review.** See the leg contract below.

## The leg contract

A workstream is divided into **legs**. This is what makes "don't stop until the
goal is achieved" compatible with the repository's one-task-at-a-time rule.

```
leg = one branch = one PR = one review gate
```

**Within a leg** the agent runs uninterrupted: it implements every task in the
leg in order, committing per task, without stopping for review between them.

**At the end of a leg** it runs verification, opens a **draft** PR, and
**stops**. It does not merge, and it does not start the next leg.

**Across legs** the existing rule holds unchanged: the previous leg's PR must be
merged before the next leg's branch is cut. The rule "do not start a task on an
unmerged PR" is therefore scoped to **leg** boundaries rather than task
boundaries — that scoping is the only workflow rule a workstream changes.

Consequences worth stating explicitly:

- **One version bump per leg**, not per task, because a leg is one PR. Semver
  follows the largest change in the leg (a leg containing any breaking change is
  a major, regardless of how many of its tasks were additive).
- **Branch naming follows the leg**, not the individual tasks:
  `feat/<workstream-slug>-leg-<n>` or a descriptive equivalent.
- **A leg must be independently reviewable.** If a leg's PR is too large to
  review honestly, the leg was drawn too wide — split it. Legs are a
  reviewability unit first and an autonomy unit second.
- **Never merge automatically.** Unchanged, and not negotiable by a workstream.

### Gates

A leg may be marked a **gate**: its outcome determines whether later legs
proceed at all. A spike whose negative result would send an RFC back to design
is a gate. Gates exist so an expensive leg is never started on an unverified
assumption, and they are the reason a workstream records _kill criteria_ rather
than assuming completion is inevitable.

## Required sections

Every workstream document carries these. The first two are what make autonomous
execution possible; without them an agent re-derives a design conversation it
cannot see.

| Section                | Why it is required                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Goal**               | One paragraph. What exists at the end that does not exist now.                       |
| **Definition of done** | Checkable conditions, not vibes. The workstream is over when these hold.             |
| **Decisions locked**   | Settled choices **and the rejected alternatives**, so they are not reopened mid-run. |
| **Prerequisites**      | What must be true before leg 1 starts, including work owned elsewhere.               |
| **Legs**               | Ordered table: leg → tasks → epics → gate? → review gate.                            |
| **Per-leg detail**     | Tasks in order, technical notes, and explicit "do not proceed if" conditions.        |
| **Risks**              | Known sharp edges, with the ones already discovered written down.                    |
| **Kill criteria**      | What outcome stops the workstream, and what survives if it does.                     |

## Authoring one

Copy [`TEMPLATE.md`](TEMPLATE.md) to `NNNN-short-slug.md`, fill it in, and add a
row to the index below. A workstream is normally written **after** its governing
RFCs, because it sequences their adoption paths — if the design is not settled
enough to sequence, the missing step is an RFC or a research doc, not a
workstream.

Workstreams are internal planning documents and are not published (see
[documentation-structure.md](../documentation-structure.md)).

## Index

| Workstream                                    | Goal                                                                  | Status     | RFCs             |
| --------------------------------------------- | --------------------------------------------------------------------- | ---------- | ---------------- |
| [0001](0001-standalone-plugin-apps.md)        | A single plugin installable as its own PWA and native mobile app      | 📋 Planned | 0080, 0081, 0082 |
| [0002](0002-native-mobile-app-release.md)     | The whole-instance Sovereign app published to the App and Play Stores | 📋 Planned | 0058, 0013, 0038 |
| [0003](0003-device-bridge-across-surfaces.md) | One device-capability contract serving web, Tauri, and Capacitor      | ✅ Done    | 0083, 0080       |
| [0004](0004-ui-backup-restore.md)             | UI-driven, async backup & restore for owners/admins and regular users | 📋 Planned | 0084             |
| [0005](0005-native-push-relay.md)             | Native mobile push notifications via an end-to-end-encrypted relay    | 📋 Planned | 0085             |
| [0006](0006-rfc-0071-incident-followups.md)   | Close the 4 still-open RFC 0071 incident follow-ups                   | 📋 Planned | 0071             |

Workstreams 0001 and 0002 share epic task 20.10 (the WKWebView offline spike) —
run it once and let both consume the finding. Otherwise they are independent, and
0002 is the shorter path to a shipped native app. Workstreams 0004 and 0006 are
each independent of the other workstreams.

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned · ⏸️ Paused · ❌ Stopped_

## Not yet wired into the task skills

This document defines the workstream class and its leg contract. The task
lifecycle skills (`/sv-task-start`, `/sv-task-complete`,
`/sv-update-task-docs`) are still **per-task** and have no workstream or leg
awareness — `CURRENT_TASK.md` describes one task, not a leg.

Until that wiring exists, running a workstream means starting a leg's first task
the normal way and treating the workstream document as the authority on what
else belongs in that leg and when to stop. Making the skills leg-aware is a
follow-up change to `docs/development-workflow.md` and the skills themselves.
