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

**Exception — a research doc may govern a workstream directly.** When a research
doc already carries a settled design, including the rejected alternatives, an
RFC that restates it adds a review cycle without adding a decision. In that case
the workstream names the research doc where it would otherwise name RFCs, its
**Decisions locked** table carries them forward, and any genuinely open decision
becomes an explicit **gate** rather than a silent gap. The full conditions are in
[documentation-structure.md](../documentation-structure.md) under
"Research-as-design (the RFC exception)". Workstream
[0008](0008-offline-first-architecture.md) is the first to use it.

Workstreams are internal planning documents and are not published (see
[documentation-structure.md](../documentation-structure.md)).

## Index

| Workstream                                            | Goal                                                                                                                                                                                                                                                                                                                           | Status                                                         | RFCs                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [0001](0001-standalone-plugin-apps.md)                | A single plugin installable as its own PWA and native mobile app                                                                                                                                                                                                                                                               | ⏳ In Progress                                                 | 0080, 0081, 0082                                                    |
| [0002](0002-native-mobile-app-release.md)             | The whole-instance Sovereign app published to the App and Play Stores                                                                                                                                                                                                                                                          | ⏳ In Progress                                                 | 0058, 0013, 0038                                                    |
| [0003](0003-device-bridge-across-surfaces.md)         | One device-capability contract serving web, Tauri, and Capacitor                                                                                                                                                                                                                                                               | ✅ Done                                                        | 0083, 0080                                                          |
| [0004](0004-ui-backup-restore.md)                     | UI-driven, async backup & restore for owners/admins and regular users                                                                                                                                                                                                                                                          | ⏳ In Progress                                                 | 0084                                                                |
| [0005](0005-native-push-relay.md)                     | Native mobile push notifications via an end-to-end-encrypted relay                                                                                                                                                                                                                                                             | ✅ Done                                                        | 0087                                                                |
| [0006](0006-rfc-0071-incident-followups.md)           | Close the 4 still-open RFC 0071 incident follow-ups                                                                                                                                                                                                                                                                            | ✅ Done                                                        | 0071                                                                |
| [0007](0007-mobile-header-footer-extraction.md)       | `MobileHeader`/`MobileFooter` as Design System components, extracted from the runtime shell                                                                                                                                                                                                                                    | ✅ Done                                                        | 0088 (builds on 0013, 0075)                                         |
| [0008](0008-offline-first-architecture.md)            | Offline-first architecture — cold-start offline, tiered plugin offline support, encrypted local storage                                                                                                                                                                                                                        | ⏳ In Progress                                                 | none — governed by research 0012 (research-as-design exception)     |
| [0009](0009-database-dialect-and-libsql-migration.md) | Single operator-chosen DB dialect platform-wide; SQLite moves to a mandatory `sqld` container                                                                                                                                                                                                                                  | ✅ Done                                                        | 0091 (Accepted)                                                     |
| [0010](0010-desktop-push-relay.md)                    | Extends workstream 0005's relay/schema to `sovereign-desktop` — macOS APNs, Windows WNS (raw-only)                                                                                                                                                                                                                             | ✅ Done                                                        | 0087 (addendum)                                                     |
| [0011](0011-app-level-field-encryption.md)            | App-level field encryption — classify in schema, enforce by operator policy, KEK→DEK, blind indexes                                                                                                                                                                                                                            | ✅ Done                                                        | 0092 (Accepted; all legs shipped)                                   |
| [0012](0012-engineering-hygiene.md)                   | Maintainability backlog — plugin workflow test coverage, middleware/generate decomposition, typecheck speed, scoped Console primitive migration, plugin dep hoisting                                                                                                                                                           | ✅ Done                                                        | 0057 (leg 8 only)                                                   |
| [0013](0013-white-labeling-phase-2-and-ds-backlog.md) | White-labeling Phase 2 (branded email + auth login) plus `NavTabs`/`PageHeader` API gap and local visual regression testing                                                                                                                                                                                                    | ✅ Done                                                        | 0027 (Phase 2), 0031, 0059                                          |
| [0014](0014-warden-harness-engine-phase-1.md)         | Warden, phase 1 — engine benchmark, `apps/harness` service scaffold, first-party plugin with basic chat only (no tools)                                                                                                                                                                                                        | ✅ Done (reactivated via workstream 0019 — see changelog v0.8) | 0063                                                                |
| [0015](0015-plugin-extensibility-surface.md)          | Plugin background jobs, realtime events, public webhooks, tool contracts, and flow handoffs                                                                                                                                                                                                                                    | ✅ Done                                                        | 0046, 0045, 0050, 0047, 0053                                        |
| [0016](0016-mobile-native-capabilities-remaining.md)  | Background capability planning (RFC 0058) — the only one of 4 requested tasks still open; other 3 corrected to ✅ (already shipped in `sovereign-mobile`)                                                                                                                                                                      | 📋 Planned                                                     | 0058                                                                |
| [0017](0017-auth-security-hardening.md)               | Progressive verification, plugin-scoped roles/grants, multi-instance-correct rate limiting                                                                                                                                                                                                                                     | ⏳ In Progress                                                 | 0035, 0054, 0086                                                    |
| [0018](0018-notification-center-messages-email.md)    | Durable Message Inbox + notification detail, then an explicit opt-in email delivery channel                                                                                                                                                                                                                                    | ✅ Complete                                                    | 0048, 0062                                                          |
| [0019](0019-warden-byo-model-providers.md)            | Per-user bring-your-own OpenAI-compatible model providers for Warden, local engine folded in as an optional entry, plus persisted chat and an incognito toggle                                                                                                                                                                 | ✅ Done                                                        | 0063 (second rewrite)                                               |
| [0020](0020-codebase-audit-remediation.md)            | Close 29 findings from a codebase audit — SDK/plugin correctness, admin-surface security, route-composition integrity, notification/storage performance, background-process reliability, DB hygiene, admin test coverage, Console/Account terminology & UX                                                                     | ✅ Complete                                                    | none — remediation, not new design                                  |
| [0021](0021-warden-multi-session-ui.md)               | Warden multi-session UI — collapsible sidebar with pinnable named sessions replacing the single conversation, consolidated Settings (General/Providers/Models), Claude-style composer redesign                                                                                                                                 | ✅ Done                                                        | 0063 (third revision)                                               |
| [0022](0022-console-shell-and-three-column-layout.md) | Console moves from `shell: "overlay"` to `shell: "default"`, adopts `ThreeColumnLayout` (sidebar nav + content + a selection-driven detail column on 4 pages), and gets a new mobile drill-down nav via a new `packages/ui` `NavList` component                                                                                | ✅ Done                                                        | none — plugin adopting existing platform primitives, not new design |
| [0023](0023-age-encrypted-git-backup-destinations.md) | Any git server as an encrypted backup destination, operator and per-user, decryptable with zero dependency on Sovereign being installed or reachable — via `age` recipient-mode encryption                                                                                                                                     | ✅ Complete                                                    | 0064, 0084 (amends 0004)                                            |
| [0024](0024-dialog-dismissal-and-composition.md)      | Fix three live-verified `Dialog`/`Drawer`/`ConfirmDialog` dismissal bugs, unify the close icon, and add an explicit header/body/footer composition API to `Dialog`                                                                                                                                                             | ✅ Done                                                        | none — bug fixes plus an additive component-API change              |
| [0025](0025-gdpr-compliance-remediation.md)           | Close 10 findings from a GDPR compliance audit — erasure/audit-trail integrity, consent UX for data grants and external connections, plugin permission disclosure, instance legal identity & source disclosure, log retention, registration acceptance record, at-rest encryption posture disclosure, breach-response template | ⏳ In Progress                                                 | none — remediation; legs 2 &amp; 5 governed by research 0007        |

Workstreams 0001 and 0002 share epic task 20.10 (the WKWebView offline spike) —
run it once and let both consume the finding. Otherwise they are independent, and
0002 is the shorter path to a shipped native app. Workstreams 0004, 0006, and
0007 are each independent of the other workstreams.

Workstream 0008 is independent of workstream 0001. Leg 3's original gate — whether
`device-only` plugins need a different thin-shell delivery model — was retired
during execution: workstream 0003's leg 4 outcome already answered it empirically
(native storage is reachable from the remote-origin page on both iOS and Android),
so leg 3 shipped as a verification item folded into epic task 20.10 rather than
a design fork. See workstream 0008's leg 3 detail for the full record.

Workstream 0009 is independent of the others. Its leg 2 gate produced
[RFC 0091](../rfcs/0091-libsql-sqld-driver.md), accepted via PR #364. All 4
legs are now done; the actual production SQLite→Postgres cutover this
workstream planned for turned out not to apply, since the single production
instance was already Postgres-dialect (epic task 8.25).

Workstream 0023 depends on workstream 0004 reaching real ✅ (not just
code-complete-and-disabled — see 0004's own task 8.16 progress note) before
its legs can start; its per-user-scope legs (2–4) only need 0004 leg 3
(task 8.18) specifically, while its operator-scope legs (5–6) additionally
need 0004 leg 2's (task 8.17) production Docker `sv`-CLI-spawn blocker
resolved first, per 0023's own Prerequisites section. It also makes one small
amendment to 0004 itself (Leg 1's encryption implementation moves to `age`'s
passphrase mode) — see 0004's own changelog.

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
