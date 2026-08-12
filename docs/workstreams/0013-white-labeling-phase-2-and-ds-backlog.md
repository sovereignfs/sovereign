# Workstream 0013 — White-labeling Phase 2 and design-system backlog

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0027](../rfcs/0027-white-labeling.md) (leg 3 — Phase 2 only; Phase 1
shipped as Task 1.0.03/`ROADMAP.md` 0.8.4, Phase 3 shipped as 0.77.0),
[0031](../rfcs/0031-email-templates.md) (leg 3, prerequisite for RFC 0027
Phase 2), [0059](../rfcs/0059-local-visual-regression-testing.md) (leg 2).
Leg 1 (Task 9.15) has no governing RFC — an API-gap fix discovered while
executing Task 9.12, not a new design.\
**Epics touched:** 9 (Design System)

> **Naming note:** the developer asked for a "White-labeling Phase 1"
> workstream. RFC 0027's actual Phase 1 (instance-identity DB + shell
> injection + Console form + SDK) already shipped — Task 1.0.03,
> `ROADMAP.md` row 0.8.4. Task 9.9, the remaining unshipped RFC 0027 work,
> is Phase 2 (branded emails + the auth server's branded login page). Titled
> and scoped against the RFC's own phase numbers rather than literally
> "Phase 1" — flag if a different scope was intended.

---

## Goal

Ship RFC 0027's remaining phase (branded transactional email + branded auth
login/registration page, gated on RFC 0031's email template infrastructure),
and close out the two other items from the design-system backlog that aren't
white-labeling but had no workstream either: local visual regression testing,
and the `NavTabs`/`PageHeader` API gap blocking Console's own remaining
primitive migration. At the end: instance operators can brand outbound email
and the auth login page the same way they can already brand the shell; a
local Playwright visual-diff suite exists for the stabilized `packages/ui`
contract; and `NavTabs`/`PageHeader` support the props Console needs, unblocking
workstream 0012's leg 7 follow-up.

## Definition of done

- [ ] `9.15` — `NavTabs` accepts a consumer-supplied link renderer (or `as`
      prop) so overlay-shell plugins can use it without a full-page
      navigation; `PageHeader` accepts a `headingLevel` prop, defaulting to
      `1`.
- [ ] `9.14` — `pnpm test:visual`/`pnpm test:visual:update` exist; Storybook-driven
      component visual tests cover the curated `packages/ui` baseline set
      across light/dark and key viewports; a root visual smoke suite covers
      auth, shell, Launcher, Account, Console, overlays, and mobile nav; CI
      uploads expected/actual/diff artifacts on failure.
- [ ] `9.9` — `packages/mailer` ships React Email templates
      (`PasswordResetEmail`, `InviteEmail`) with locale support
      (`en`/`de`/`si`/`ta`); Console gains an Email Templates settings
      section with live preview and test-send; `apps/auth`'s login/registration
      page renders branded per-instance identity via
      `/api/admin/instance-config` with a documented fallback to Sovereign
      defaults.

## Decisions locked

| Decision                   | Choice                                                                                                                                                       | Rejected alternative and why                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                      | Exactly 9.9, 9.14, 9.15                                                                                                                                      | Including **9.13** (subtle Sovereign attribution) — rejected outright by the developer during this workstream's planning pass; marked ❌ in `ROADMAP.md` and `docs/epics/design-system.md`, retired rather than carried into any workstream                                            |
| Workstream title/phase     | "Phase 2 and design-system backlog," matching RFC 0027's own phase numbering                                                                                 | Literal "Phase 1" as requested — rejected because that phase is already shipped (Task 1.0.03); reusing the name for different, unshipped work would make `ROADMAP.md`/RFC cross-references ambiguous, the exact class of bug the four sibling-repo doc audits this session were fixing |
| 9.9/9.13 dependency        | Not a blocker, since 9.13 is retired                                                                                                                         | 9.13 depended on 9.9 completing first; with 9.13 out of scope entirely, this workstream has no obligation to sequence around it                                                                                                                                                        |
| Leg order                  | 9.15 → 9.14 → 9.9 (smallest/most isolated first)                                                                                                             | 9.9 first — rejected; it's the largest, highest-file-count leg (mailer, db, sdk, runtime, apps/auth all move) and has no dependency forcing it early, so it's sequenced last per this index's own smallest-first convention (see workstream 0006)                                      |
| Cross-workstream follow-up | Once leg 1 (9.15) ships, workstream 0012's leg 7 (Console primitive migration) may be re-opened to add the nav/header migration items it explicitly deferred | Extending workstream 0012 directly instead — rejected; 0012 is already drafted and its leg 7 explicitly scoped 9.15's items out. Cleaner to note the unblock here than reopen a sibling workstream doc                                                                                 |
| Workstream execution       | Legs — one branch, one draft PR, one review gate per leg                                                                                                     | A single combined PR — rejected for the standard reviewability reason; leg 3 alone touches five packages/apps and would be unreviewable bundled with the other two                                                                                                                     |

## Prerequisites

None blocking leg 1 or leg 2. Leg 3 (Task 9.9) depends only on Task 9.8 (RFC
0032 rename), already ✅.

## Legs

| Leg | Name                                                          | Epic tasks | Epics | Gate? | Done when                                                                                                                                              |
| --- | ------------------------------------------------------------- | ---------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `NavTabs`/`PageHeader` API gap                                | 9.15       | 9     | No    | Both components support the props Console's own migration needs; unblocks workstream 0012 leg 7's deferred items                                       |
| 2   | Local visual regression testing                               | 9.14       | 9     | No    | `pnpm test:visual` fails on intentional diffs; curated component + root smoke coverage exists; CI uploads diff artifacts                               |
| 3   | White-labeling Phase 2 — email templates + branded auth login | 9.9        | 9     | No    | Branded transactional email and a branded, per-instance auth login/registration page both work end to end, gated on RFC 0031's template infrastructure |

Legs are mutually independent — none blocks another — but leg 1 is worth
landing first since it unblocks a deferred item in a sibling workstream
(0012 leg 7), and leg 3 is largest/highest-risk so it's sequenced last.

## Leg detail

### Leg 1 — `NavTabs`/`PageHeader` API gap

**Epic tasks:** 9.15

**Why this leg is first:** smallest leg here, and the only one with a
downstream consumer already waiting — workstream 0012's leg 7 explicitly
deferred Console's nav/header migration on exactly this gap.

**Technical notes:**

- `NavTabs` currently renders plain `<a href>` — breaks the overlay-shell
  navigation contract (`<Link replace>`) inside plugins like Account. Add a
  consumer-supplied link renderer (`renderLink?: (item: NavTabItem) =>
ReactNode`) or an `as` prop shaped like Next's `Link`.
- `PageHeader` always renders `<h1>` — a second `<h1>` under Console's own
  shell `<h1>Console</h1>` is an accessibility regression. Add
  `headingLevel?: 2 | 3`, defaulting to `1` for standalone use.
- Once both land, this is the trigger to revisit workstream 0012 leg 7 and
  add the nav/header items it deferred — not part of this leg's own done
  condition, just the unblock.

**Do not proceed if:** N/A — this is an additive API surface with no
existing consumer to regress.

### Leg 2 — Local visual regression testing

**Epic tasks:** 9.14

**Technical notes:**

- Add `pnpm test:visual` / `pnpm test:visual:update`; Playwright
  configuration for deterministic screenshot comparisons (fixed viewport,
  disabled animations, deterministic fonts).
- Storybook-driven visual tests for the curated `packages/ui` baseline set,
  light/dark themes, key responsive viewports.
- A root visual smoke suite: auth, shell, Launcher, Account, Console,
  overlays, mobile navigation.
- CI artifact upload for expected/actual/diff images on failure.
- Document the baseline-update workflow explicitly — `pnpm
test:visual:update` should only ever run intentionally, never as a side
  effect of a normal test run.
- Snapshot policy: no broad React DOM snapshots; only stable serialized
  output. Defer Chromatic/Percy/Loki — local review only, per the RFC.

**Do not proceed if:** deterministic screenshots can't be achieved in CI
(font rendering or animation timing flakiness) without disproportionate
infra work — ship the Storybook component suite (usually easier to
stabilize) and document the root smoke suite as a follow-up rather than
blocking this leg entirely on flaky coverage.

### Leg 3 — White-labeling Phase 2 — email templates + branded auth login

**Epic tasks:** 9.9

**Why this leg is last:** largest and highest-file-count leg in this
workstream — touches `packages/mailer`, `packages/db`, `packages/sdk`,
`runtime`, and `apps/auth` — with no dependency forcing it earlier.

**Technical notes:**

- RFC 0031 (email templates) is the prerequisite and ships in this same
  task: `packages/mailer` gains `@react-email/components` +
  `@react-email/render`, a `templates/` subtree
  (`EmailLayout`/`EmailHeader`/`EmailFooter`, `locales/{en,de,si,ta}.json`,
  `PasswordResetEmail.tsx`, `InviteEmail.tsx`), and
  `renderPasswordResetEmail()`/`renderInviteEmail()`/`renderSubject()`.
- `packages/db` gains `getEmailCopy()`/`setEmailCopy()` using the
  `platform_settings` key pattern `email_copy_<templateId>_<locale>_<field>`.
- `packages/sdk`'s `PlatformConfig` gains `emailFromName?`, `emailLogo?`,
  `instanceUrl`.
- New `GET /api/admin/instance-config` route (admin-key-gated) feeds both
  the Console Email Templates section and `apps/auth`'s branded login page.
- Console → Settings → Email Templates: template/locale selectors, subject +
  body override fields, live `<iframe>` preview, test-send button.
- `apps/auth` root layout fetches `/api/admin/instance-config` with a 60s
  in-process cache and a graceful fallback to Sovereign defaults if the
  fetch fails — the auth server must never hard-fail on a branding lookup.
  `InstanceProvider` is duplicated into `apps/auth/src/instance-provider.tsx`,
  matching the existing `security.ts` duplication pattern rather than adding
  a new cross-app import.

**Do not proceed if:** the `apps/auth` branding fetch introduces a hard
dependency on `runtime` being reachable at auth-server boot/request time —
the documented fallback-to-defaults behavior is load-bearing; verify it
actually degrades gracefully (real request against a stopped `runtime`)
before treating this leg as done, not just code-reviewed.

## Risks

- **Leg 3 touches the auth server's request path** (`apps/auth`'s login
  page). A regression here affects every login attempt, not just branded
  instances — treat the fallback-to-defaults behavior as load-bearing and
  test it directly, not just the happy path.
- **Leg 2's CI stability** is the classic visual-regression-testing risk —
  font rendering and animation timing differ across CI runners. Budget time
  for stabilization, not just initial authoring.
- Leg 1 is low risk — additive API surface, no existing consumer to
  regress.

## Kill criteria

Legs are independent; if leg 3 (the highest-risk, highest-effort leg) has to
stop per its "Do not proceed if" condition, legs 1 and 2 still ship and stand
on their own value — a working `NavTabs`/`PageHeader` API and a local visual
regression suite are useful with or without white-labeling Phase 2. If leg 2
can't stabilize in CI within reasonable effort, ship its Storybook coverage
and document the root smoke suite as a follow-up rather than reverting the
whole leg.

## Changelog

| Version | Date        | Change                                                                               |
| ------- | ----------- | ------------------------------------------------------------------------------------ |
| 0.1     | August 2026 | Initial draft — 3 tasks (9.9, 9.14, 9.15); excludes Task 9.13 (rejected and retired) |
