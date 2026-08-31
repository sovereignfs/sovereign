# Workstream 0021 — Dialog dismissal correctness and composition

**Status:** ⏳ In Progress — all five legs (`9.28`–`9.38`) implemented and
verified (unit tests + live-browser checks where applicable), not yet
committed/PR'd; see each leg's own detail for what changed and any
deviations from plan\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** None. Legs 1–2 are bug fixes following patterns already established
elsewhere in this codebase (mirrors the no-RFC precedent set by workstreams
[0006](0006-rfc-0071-incident-followups.md), [0012](0012-engineering-hygiene.md),
and [0020](0020-codebase-audit-remediation.md)). Leg 3's header/body/footer
composition is an additive, backward-compatible `packages/ui` prop addition,
consistent with how prior design-system component work shipped without an RFC
(epic tasks 9.11, 9.16, 9.18). Leg 4 is pure cleanup.\
**Epics touched:** 9 (Design System)

---

## Goal

Close three correctness bugs in the shared overlay dismissal system
(`Dialog`, `Drawer`, `ConfirmDialog`) found during a live-verified design
system review, and extend `Dialog` with two developer-requested
improvements: a single, consistent close icon, and an explicit
header/body/footer composition API with a pinned header and footer and a
scrollable-only body. At the end: Escape dismisses exactly once, a nested
modal reliably owns Escape ahead of its ancestor overlay, `ConfirmDialog`
calls `onClose` exactly once per dismissal, `Dialog`'s close affordance is
visually identical on desktop and mobile, and `Dialog` supports three
explicit, consumer-selected shapes (Body only / Header + Body / Header +
Body + Footer) without changing behavior for consumers that don't opt in.

## Definition of done

**Required:**

- [x] `9.28` — `Dialog`: remove duplicate Escape-dismissal
- [x] `9.29` — `Drawer`: remove duplicate Escape-dismissal
- [x] `9.30` — `ConfirmDialog`: stop double-firing `onClose`
- [x] `9.31` — Overlay Escape precedence for nested modals
- [x] `9.32` — `Dialog`: unify the close icon
- [x] `9.33` — `Dialog` header/body/footer composition

**Optional — lower priority, discovered incidentally during the same review,
not independently prioritized (see Leg 4):**

- [x] `9.34` — Retire or redefine `Dialog`'s dead `full` size (resolved differently than planned — see Leg 4 detail)
- [x] `9.35` — Reconcile `Dialog`'s `xl`/`full` sizes with the manifest `overlaySize` schema
- [x] `9.36` — De-duplicate `MOTION_DURATION_MS`
- [x] `9.37` — Fallback accessible name in `@modal/layout.tsx`

**Added mid-workstream, developer-requested breaking change (see Leg 5):**

- [x] `9.38` — Revamp `Dialog`'s size scale: drop `xl`/`full`, add `auto`

## Decisions locked

| Decision                                           | Choice                                                                                                                   | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Governing design doc                               | None — Legs 1–2 are remediation, Leg 3 is an additive component-API change                                               | Writing an RFC first — rejected; every Leg 1–2 fix follows a pattern already established in this codebase (the shared `overlay-shell.ts` hooks already exist and already do this correctly for `Sheet`), and Leg 3 is additive/backward-compatible, not a new design question                                                                                      |
| Header/footer API shape                            | Optional `header`/`footer` props (`ReactNode`) alongside the existing `children`-as-body                                 | A compound-component API (`<Dialog.Header>`/`<Dialog.Body>`/`<Dialog.Footer>`) — rejected; bigger API surface change, inconsistent with how every other prop on `Dialog` (and every other component in this design system) is shaped                                                                                                                               |
| Header visibility                                  | Renders on **both** breakpoints when provided — not mobile-only as today                                                 | Leaving the new `header` prop mobile-only, matching today's `title` behavior — rejected; would make "Header + Body" a misleading variant name on desktop, where it would render identically to "Body only"                                                                                                                                                         |
| Footer pinning technique                           | Non-scrolling flex sibling after `.content`, mirroring `OverlayHeader`'s existing technique                              | `position: sticky` — rejected; this codebase has a documented WebKit momentum-scroll staleness bug with sticky elements inside touch-scrollable content (see `docs/architecture-rules.md`), and the flex-sibling technique already used for the header sidesteps it entirely with no new risk                                                                      |
| Existing `Dialog` consumer migration onto `footer` | Deferred as follow-up work, out of this workstream                                                                       | Migrating the ~20 existing `Dialog` consumers onto the new `footer` prop inside Leg 3 — rejected; would make an already-large leg unreviewable, and the capability should ship before any consumer is forced onto it                                                                                                                                               |
| Escape-precedence fix scope                        | `Dialog`/`Drawer`/`Sheet` + `ConfirmDialog` only, via one shared registry in `overlay-shell.ts`                          | Also auditing `Popover` for the same bug class inside this workstream — rejected; flagged instead as an open design decision inside `9.31` to check for during implementation, so a live-verified 3-bug leg doesn't grow scope on a suspicion                                                                                                                      |
| Close icon                                         | Desktop close button swaps `circle-x` → lucide `x`, matching what `OverlayHeader` already uses on mobile                 | Keeping `circle-x` — rejected; explicitly what the developer asked to change. Recorded here because it reverses a previously deliberate decision documented in `Dialog.tsx`'s own comment — captured so the reversal is intentional, not an accidental regression a future reviewer flags                                                                          |
| Task ID assignment                                 | New epic task IDs `9.28`–`9.37` appended sequentially in `docs/epics/design-system.md`, past its prior highest (`9.27`)  | Reusing/renumbering an existing task — rejected; no existing task in epic 9 matches any of these findings, mirrors workstream 0020's stated convention                                                                                                                                                                                                             |
| Leg 4 scope                                        | Included as an explicitly optional, lower-priority leg                                                                   | Leaving the four cleanup findings (`9.34`–`9.37`) undocumented — rejected; they were fully diagnosed during the same review with exact `file:line` references, so writing them down costs little and they may as well be available if the developer wants them; they are **not** required for this workstream's Definition of done to be considered met if skipped |
| `Dialog` size scale (`9.38`)                       | `sm` \| `md` \| `lg` \| `auto` — `xl`/`full` removed outright, `auto` added (content-driven on both width and height)    | Keeping `full` as a documented alias, `9.34`'s own original resolution — superseded once the developer explicitly asked for the breaking revamp and explicitly accepted the plugin-migration cost ("we can address them separately before do a prod release") rather than optimizing for zero breakage the way `9.34` did on its own initiative                    |
| `auto` size's caps                                 | `min-width: min(24rem, 100%)`, `max-width`/`max-height: min(48rem, 100%)` — matching where `sm` and the removed `xl` sat | An unbounded `width: fit-content` with no min/max — rejected; a very short message would read as an oddly narrow sliver with no floor, and very long/wide content would have no ceiling either                                                                                                                                                                     |
| `sovereign-plugin-kanban.local` migration          | Not performed here — flagged in `docs/upgrade.md` as a follow-up for that plugin's own maintainers                       | Editing it directly — rejected for the same repo-boundary reason `9.34` already established (gitignored `.local` clone, confirmed via `git check-ignore`, outside this repo's ownership)                                                                                                                                                                           |

## Prerequisites

None. Fully self-contained to `packages/ui` (Legs 1–4, 5) plus one `runtime`
file (`9.37`, and `9.38`'s doc-comment update, both in `runtime/src/overlay.ts`
for `9.38`). No dependency on any other workstream's output, and no
prerequisite owned outside this repo.

## Legs

| Leg          | Name                           | Epic tasks                     | Epics | Gate? | Done when                                                                      |
| ------------ | ------------------------------ | ------------------------------ | ----- | ----- | ------------------------------------------------------------------------------ |
| 1            | Overlay dismissal correctness  | `9.28`, `9.29`, `9.30`, `9.31` | 9     | No    | All four marked ✅ in the epic doc, reviewed and merged                        |
| 2            | Close icon unification         | `9.32`                         | 9     | No    | `9.32` marked ✅, reviewed and merged                                          |
| 3            | Header/body/footer composition | `9.33`                         | 9     | No    | `9.33` marked ✅, reviewed and merged                                          |
| 4 (optional) | Design-system cleanup backlog  | `9.34`, `9.35`, `9.36`, `9.37` | 9     | No    | All four marked ✅ or explicitly dropped by the developer, reviewed and merged |
| 5            | `Dialog` size scale revamp     | `9.38`                         | 9     | No    | `9.38` marked ✅, reviewed and merged                                          |

Sequencing reflects priority, not a hard dependency chain: Leg 1 first
because it's the highest-impact finding (a confirmed live bug that can eject
an admin from Console entirely on a stray Escape press). Leg 2 is sequenced
before Leg 3 purely to avoid two legs touching `Dialog`'s header row with
overlapping diffs — there is no technical dependency between them. Leg 4 is
independent of Legs 1–3 and may be skipped entirely without affecting them.
**Leg 5 was added mid-workstream**, after Leg 4 shipped, when the developer
reviewed the finished size scale and asked for a breaking revamp — it
directly revises `9.34`/`9.35`'s own resolutions (see those tasks' epic-doc
entries for the pointer notes) rather than sitting fully independent of
Leg 4 the way Leg 4's own items sit independent of Legs 1–3.

## Leg detail

### Leg 1 — Overlay dismissal correctness

**Status: implemented and verified on branch `fix/dialog-dismissal-leg-1`,
not yet committed or opened as a PR** (holding per explicit developer
instruction this session — commit/push only on request). All four fixes
pass their new regression tests (each independently confirmed to fail
against the pre-fix code first), the full `packages/ui` suite (529 tests),
typecheck, and lint — and were additionally verified live in a real browser
via temporary Storybook stories (deleted after use, never committed): Dialog
and Drawer each closed exactly once per Escape press with focus inside the
panel; the nested-precedence scenario (`Dialog` containing an open
`ConfirmDialog`, matching `CardDetailOverlay`'s real structure) showed the
outer `onClose` count staying at 0 while the confirm was open, then firing
once a second Escape was pressed after the confirm was dismissed — end to
end, not just at the unit level. `packages/ui` bumped `0.74.0` → `0.74.1`
(patch — internal bug fixes, no public API change). See each task's own
epic-doc entry (`docs/epics/design-system.md`) for the exact verification
detail, including one live-browser caveat found in `9.31` (unrelated to
this task's own fix — noted there, not a blocker).

**Epic tasks:** `9.28`, `9.29`, `9.30`, `9.31` (in this order)

**Why this leg is first:** these are confirmed, live-verified bugs with the
largest real-world blast radius of anything in this workstream — `9.31` in
particular means pressing Escape to cancel a destructive confirmation inside
Console or Account (e.g. "Delete user permanently?") can eject the admin
from the entire admin surface instead of just canceling the confirmation.
All four fixes are fully self-contained to `packages/ui/src/{overlay-shell.ts,components/{Dialog,Drawer,ConfirmDialog}}`,
with no dependency on any other leg.

**Technical notes:**

`9.28` and `9.29` are the same one-line fix applied to sibling files
(`Dialog.tsx`, `Drawer.tsx`) — do them first and together; `Sheet.tsx` does
**not** have this bug (no scrim, so no redundant handler to remove) and
needs no change, which is itself useful confirmation of the fix's
correctness (compare against `Sheet`'s existing, correct pattern before
editing `Dialog`/`Drawer`).

`9.30` is unrelated to nesting — reproduced standalone, with no `Dialog`
involved at all. Can be done independently of `9.28`/`9.29`, but keep it in
this leg since all three share the same "overlay dismissal correctness"
review and test-writing pattern (write a failing regression test against
the current code first, confirm it fails, then fix).

`9.31` depends on `9.28`/`9.29` landing first in the same leg (same file,
same mechanism — the registry replaces what the redundant handler used to
half-do). This is the least mechanically simple of the four — see Risks and
Kill criteria below before starting it.

Every fix in this leg should ship with a regression test that is confirmed
to fail against the pre-fix code before being accepted — this repo's own
stated verification convention (see `CLAUDE.md`'s Status log for repeated
precedent of this exact practice) and the reason the original bugs were
missed: the existing `Dialog.test.tsx` Escape test technically passes today
despite the bug, because it dispatches the keydown in a way that doesn't
exercise the real bubble path.

**Do not proceed if:** `9.31`'s registry approach needs changes outside
`packages/ui/src/overlay-shell.ts` (e.g. `Popover` turns out to have the
same bug and a fix requires touching it too) — stop and re-scope `9.31` as
its own follow-up rather than expanding this leg. `9.28`–`9.30` ship
independently of `9.31`'s resolution either way.

### Leg 2 — Close icon unification

**Status: implemented and verified, sitting uncommitted alongside Leg 1's
changes** (no separate branch was cut — see the note at the top of this
session's work: with Leg 1 uncommitted, a new branch wouldn't isolate
anything). `packages/ui` bumped `0.74.1` → `0.74.2` (patch). Verified live in
Storybook at both desktop and mobile viewports — confirmed via computed
styles that Dialog's own `.close` (`display:none` on mobile) and
`OverlayHeader`'s close button (`display:flex` on mobile) are genuinely the
same icon now, not just visually similar. `pnpm design:tokens:check` and
`pnpm --filter @sovereignfs/ui build-storybook` both pass.

**Epic tasks:** `9.32`

**Why this leg runs here:** small, isolated, no interaction with Leg 1's
fixes. Sequenced before Leg 3 only so Leg 3's header-row work doesn't also
carry an unrelated icon diff.

**Technical notes:** single-line icon swap plus a comment update
(`Dialog.tsx:158-166`). Visually verify the new icon's centering inside
`.close`'s fixed box (`Dialog.module.css:191-192`) — `circle-x` and plain
`x` are not guaranteed to have identical intrinsic proportions at the same
declared size.

**Do not proceed if:** nothing expected here — this is the smallest, lowest-risk leg in the workstream.

### Leg 3 — Header/body/footer composition

**Status: implemented and verified, sitting uncommitted alongside Legs 1–2**
(same branch, no separate PR — see Leg 1's note on why). `packages/ui`
bumped `0.74.2` → `0.75.0` (minor, additive public props). The `title`/
`header` relationship was resolved as: `header` supersedes `title` for
visible content, `title` stays the `aria-label` fallback either way — by
widening `OverlayHeader`'s own `title` prop to `ReactNode` and reusing it
directly for `header` (confirmed `OverlayHeader.module.css` has no internal
breakpoint gating before relying on that, so simply omitting the
Dialog-level display-toggling `className` is what makes it show on both
breakpoints — no new CSS needed for the header row itself, only for the new
`.footer`). Neither `Drawer`/`Sheet` nor any of the ~20 existing `Dialog`
consumers were touched, matching this leg's own scope boundary. 6 new tests
added (5 in `Dialog.test.tsx`, 1 in `OverlayHeader.test.tsx`); full
`packages/ui` suite (535 tests), typecheck, lint, `design:tokens:check`, and
`build-storybook` all pass. Verified live in a real browser at both desktop
and ≤768px viewports: scrolled the Header+Body+Footer story's body several
screens deep and confirmed the header/footer never moved; confirmed the
Header+Body story shows a real header row on desktop, which didn't exist
before this task.

**Epic tasks:** `9.33`

**Why this leg runs here:** the largest, most design-involved change in this
workstream — kept isolated from the correctness fixes (Leg 1) and the icon
change (Leg 2) so it can be reviewed purely on its own merits.

**Technical notes:** the open design decision that most needs settling
_before_ writing code, not during review, is the relationship between the
existing `title` string prop and the new `header` node prop — see `9.33`'s
own "Open design decisions." Getting this wrong (e.g. shipping both with
silently overlapping behavior) is the most likely way this leg needs a
second review round. `docs/architecture-rules.md`'s `PageContainer`/
`--sv-page-gutter` convention (`Dialog.module.css:106-110`) is unrelated to
this change and must keep working unmodified — the new `footer` region is
additive to the existing flex-column layout, not a replacement for it.

**Do not proceed if:** the `title`/`header` relationship can't be resolved
without a breaking change to the existing `title` prop's behavior for
current consumers (i.e. every existing `Dialog` that passes `title` would
need to change its visible rendering). If so, stop and confirm the
direction with the developer before implementing — this workstream's
Decisions locked table assumes an additive change, not a breaking one.

### Leg 4 (optional) — Design-system cleanup backlog

**Status: implemented and verified, sitting uncommitted alongside Legs 1–3.**
`packages/ui` bumped `0.75.0` → `0.75.1` (patch — internal-only: a doc
comment and a constant de-duplication, no public API change). `runtime`
bumped `0.91.10` → `0.91.11` (patch — a real, if edge-case, `aria-label`
fix). Two notable deviations from the plan, both driven by things only
discovered while implementing:

- **`9.34` did not remove `full`, contrary to the task's own default
  recommendation.** Removing it turned out to be a real breaking type
  change — `CardDetailOverlay.tsx`'s `size={isMobile ? 'full' : 'xl'}` call
  site lives in `sovereign-plugin-kanban.local`, confirmed via
  `git check-ignore`/`git ls-files` to be a gitignored `.local` plugin
  clone outside this repo's ownership (the same category workstream 0020's
  Decisions locked table excluded from direct edits). Removing `full` would
  have silently broken that plugin's own separate build for zero runtime
  benefit (it was already visually identical to `lg`). Kept `full` in
  `DialogSize`, documented why it's a deliberate alias rather than dead
  code — satisfies the review checklist's actual bar ("no remaining `full`
  size that behaves identically to `lg` **without explanation**") without
  the breaking change.
- **`9.37`'s review checklist ("a new or existing test covers the
  plugin-not-found case") could not be met as written** — not for lack of
  trying, but because `@modal/layout.tsx` (and its committed siblings
  `default.tsx`/`error.tsx`) turned out to have no path to automated
  verification at all: `vitest.config.ts`'s include globs never cover
  `runtime/app/**`, `runtime/tsconfig.json` explicitly excludes
  `app/(platform)/(plugins)/**`, and `@modal/.gitignore`'s own pattern
  would gitignore a new `@modal/__tests__/` directory before it could even
  be committed. This is a real, pre-existing gap in this repo's test
  infrastructure for these three specific hand-written files sitting inside
  an otherwise fully-generated directory — worth its own future task
  (a `.gitignore` exception plus a precisely-scoped vitest include, narrow
  enough to keep excluding the generated `@modal/(.)*` copies), but
  disproportionate scope for this one low-priority prop fix to carry.
  Verified instead via an isolated one-off `tsc` run (temporary tsconfig
  overriding just this file's exclusion, discarded after) showing zero
  errors attributed to the file, plus manual review of the (simple,
  well-typed) change.

**Epic tasks:** `9.34`, `9.35`, `9.36`, `9.37`

**Why this leg runs here:** these four findings were discovered incidentally
while investigating Legs 1–3, not independently prioritized. None is a bug;
all are small, independent, low-risk cleanups. Confirm with the developer
that they're still worth doing before starting — nothing else in this
workstream depends on them.

**Technical notes:** `9.35` should follow `9.34` (resolving `full`'s fate
first avoids documenting a manifest/component split for a size this
workstream may also remove). `9.36` and `9.37` are fully independent of
everything else in this leg and this workstream.

**Do not proceed if:** the developer decides Leg 4 isn't worth doing — drop
it. The workstream's Definition of done treats these four as optional, so
dropping the leg does not leave the workstream incomplete.

### Leg 5 — `Dialog` size scale revamp

**Status: implemented and verified, sitting uncommitted alongside Legs 1–4.**
`packages/ui` bumped `0.75.1` → `0.76.0` (minor — breaking `DialogSize`
change, per NFR-04's floor). `DialogSize` is now `sm | md | lg | auto`.
Full detail — exact CSS caps, migration guidance, the known affected
consumer — is in `9.38`'s own epic-doc entry and the new `@sovereignfs/ui`
section of `docs/upgrade.md`; not duplicated here.

**Epic tasks:** `9.38`

**Why this leg runs here:** requested by the developer after reviewing the
finished Leg 1–4 work and asking "how many sizes... seems not consistent" —
a design decision only the developer could make (which names survive, what
the new variant is called), not something to infer. Directly revises `9.34`'s
"keep `full`, don't break anyone" resolution now that the developer has
explicitly authorized the opposite tradeoff.

**Technical notes:** touches the same files as Legs 2/3 (`Dialog.tsx`,
`Dialog.module.css`, `Dialog.stories.tsx`, `Dialog.test.tsx`) — sequenced
last specifically so it revises the size scale once, after `header`/`footer`
and the icon are already settled, rather than needing another pass once
those land. Also touches `9.35`/`9.37`'s own doc changes (`runtime/src/overlay.ts`,
`docs/plugin-development.md`) to keep them accurate rather than stale.

**Do not proceed if:** a second, unrelated consumer of `xl`/`full` turns up
beyond `CardDetailOverlay.tsx` (the only one confirmed via repo-wide grep) —
that would change the blast-radius assessment the developer's "we can
address them separately" framing was based on, and is worth surfacing before
proceeding rather than silently absorbing.

## Risks

- `9.31` (overlay Escape precedence) is a real architectural gap, not a
  one-line fix like its three leg-mates — the shared registry needs to
  correctly generalize to arbitrary nesting depth, not just the two-level
  case that was live-tested (`Dialog` containing `ConfirmDialog`). If the
  registry approach turns out to be fragile or under-tested, don't ship it
  alongside the two simple fixes in the same leg — split it out.
- `9.33` changes `Dialog`'s visual header presentation on desktop for the
  first time in the component's history (today, desktop never shows a
  header row at all). Verify live against every real overlay-shell plugin
  (Account, Console) before merging, not just in Storybook — those are the
  two production consumers most likely to be visually affected by any
  change to how `title`/`header` renders.
- Leg 4's four findings carry no urgency and were not independently
  requested — treat them as genuinely optional rather than assuming they
  should ship just because they're written up.

## Kill criteria

- If `9.31`'s registry approach requires changes outside
  `packages/ui/src/overlay-shell.ts` (e.g. `Popover` also needs it, or a
  third overlay type not yet identified turns out to have the same bug),
  stop `9.31` and re-scope it as its own follow-up task rather than
  expanding Leg 1. `9.28`, `9.29`, and `9.30` are already complete,
  independently reviewable, and ship regardless of `9.31`'s outcome.
- If `9.33`'s desktop header change turns out to visually break an existing
  overlay-shell plugin in a way that can't be resolved within this leg,
  revert to shipping the new `header`/`footer` props as fully opt-in with
  the header not rendering unless a consumer explicitly requests it — and
  note the "header should show consistently across breakpoints" goal as an
  unresolved follow-up rather than blocking the whole leg.
- Leg 4 dying or being dropped entirely leaves Legs 1–3 fully shipped and
  the workstream's required Definition of done met — see Decisions locked.

## Changelog

| Version | Date        | Change                                                                                        |
| ------- | ----------- | --------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft, from a live-verified design-system review of `Dialog`/`Drawer`/`ConfirmDialog` |
