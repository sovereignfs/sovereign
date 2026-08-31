# Workstream 0022 — Console: default shell + ThreeColumnLayout

**Status:** ⏳ In Progress — legs 1-4 shipped (PRs #580, #582, #585, #587); leg 5 not yet started\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** None — see "Why no RFC" below.\
**Epics touched:** 13 (Plugin — Console), 9 (Design System), 16 (Docs Site & Landing Page — leg 6 only, unrelated cleanup folded in by direct request)\
**Research:** None — scoped directly from a developer conversation reviewing Console's current UI; no open design question remained after that review, so no research doc was written.

---

## Why no RFC

RFC 0001 already governs the `overlay`/`default` shell mechanism itself — this
workstream doesn't add a new shell mode or change how `shell` works, it changes
which mode one existing plugin (Console) opts into, plus that plugin's own
internal layout. Task 2.5 (RFC 0001) already made this exact move once before,
in the other direction, without its own RFC (Console started as `default`,
migrated to `overlay`). The new `packages/ui` component (leg 1) is an additive,
non-breaking DS component in the same category as `ThreeColumnLayout`,
`SwipableMobileCarousel`, etc. — none of which required their own RFC either.
Nothing here is a platform-wide design decision; it's a plugin adopting
existing platform primitives (`ThreeColumnLayout`, `ResponsiveSurface`) the way
`sovereign-tasks` and Warden already have, plus one new reusable primitive
those primitives were missing.

## Goal

Console (`plugins/console`) stops rendering as a `shell: "overlay"` dialog and
becomes a `shell: "default"` full page, restructured around
`@sovereignfs/ui`'s `ThreeColumnLayout`: a persistent vertical section nav
(replacing today's horizontal scrollable tab strip) as column 1, routed page
content as column 2, and — for Users, Groups, Plugins/Apps, and External
clients — a selection-driven detail column 3 that replaces today's
`CapabilitiesButton`/`ManageGroupDialog`/`PluginAccessDialog`/client-rotation
dialogs. Mobile gets its own drill-down tree (grouped icon+label+chevron rows,
tap → push into a section, matching a native Settings-app pattern) via a new
`packages/ui` component, `NavList`, built in leg 1 and reused for both
desktop's static sidebar and mobile's drill-down index.

## Definition of done

- [ ] `plugins/console/manifest.json` declares `shell: "default"`; no
      `shellConfig.overlaySize`. The generated `@modal/(.)console/*` route tree
      is gone after `pnpm generate`.
- [ ] `NavList` exists in `packages/ui`, is presentational (no data fetching,
      no SDK import), supports a `static` variant (active-item highlight, no
      navigation semantics beyond `<Link>`) and a `drilldown` variant
      (chevron-right, tap navigates), supports grouped and ungrouped items,
      and has Storybook coverage for both variants plus the grouped/ungrouped
      and active/inactive states.
- [ ] Desktop Console renders `ThreeColumnLayout` with `NavList
variant="static"` as the sidebar column; the old horizontal `.nav` tab
      strip is gone.
- [ ] Mobile Console has no persistent sidebar. The bare `/console` route
      renders `NavList variant="drilldown"` as a full index; every other
      `/console/*` route renders its existing content with a `‹ Console` back
      link above it.
- [ ] Console's Overview page (`/console`) is a `ResponsiveSurface` fork:
      desktop shows a dashboard (today's card grid, extended to cover all 11
      sections instead of 5); mobile shows the `NavList` drill-down index.
- [ ] Users, Groups, Plugins/Apps, and External clients each render a 3rd
      "detail" column on desktop when a row is selected, replacing the dialog
      each currently uses for that same information (`CapabilitiesButton`,
      `ManageGroupDialog`, `PluginAccessDialog`, and the OAuth client's own
      rotation UI respectively). Each page's "create new" dialog
      (`InviteDialog`, `CreateGroupDialog`) is evaluated independently per its
      own leg — not assumed to convert just because the page gained a detail
      column.
- [ ] `docs/architecture-rules.md`, `docs/plugins/console.md`,
      `docs/epics/plugin-console.md`, and `docs/epics/platform-shell.md` no
      longer describe Console as an overlay-shell plugin (the last one gets a
      forward-pointer, not a rewrite of its historical task record).
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass
      after every leg; e2e specs under `__tests__/e2e/console*.spec.ts` and
      `oauth-clients.spec.ts` pass unmodified or are updated for the new DOM
      shape (not silently skipped).
- [ ] `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and the `docs/epics/`/
      `docs/docs-site-revamp-plan.md` files no longer describe `apps/docs`
      (the retired in-repo VitePress app) or its `docs-v*`/`docs.yml` release
      mechanism as if still live in this repository (leg 6 — unrelated to the
      Console/`ThreeColumnLayout` work above; folded into this workstream by
      direct request rather than opened as its own workstream).

## Decisions locked

| Decision                                                                                                | Choice                                                                                                                    | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell mode                                                                                              | `shell: "default"`                                                                                                        | Keep `overlay` and only add `ThreeColumnLayout` inside the dialog — rejected: a `lg`/`full` overlay is already a fixed-size box (`docs/architecture-rules.md`), and a persistent 3-column admin surface reads as a real page, not a transient dialog. This is also a full reversal of Task 2.5's migration, done deliberately for Console specifically; Account is unaffected and stays `overlay`.                                                                                                                                           |
| New DS component vs. plugin-local                                                                       | Build `NavList` in `packages/ui` (leg 1)                                                                                  | Build the grouped-row list directly in `plugins/console/app/_components/` — rejected per this repo's DS-first rule ("reusable UI/UX capability... implemented in packages/ui... never implemented plugin-locally 'to be promoted later'"); Account has the identical horizontal-tab-strip pattern today and is a likely second consumer later.                                                                                                                                                                                               |
| Sequencing of the new component vs. the shell change                                                    | Same leg (leg 1)                                                                                                          | A separate preceding task/PR for `NavList` alone — considered, but the mobile redesign has no other consumer for it yet and splitting would leave a leg reviewed with no visible effect; decided against per direct developer input.                                                                                                                                                                                                                                                                                                         |
| Detail-column scope                                                                                     | Users, Groups, Plugins/Apps, External clients — one leg each                                                              | Convert all four in one leg — rejected: each conversion changes that page's interaction model (dialog → persistent pane) and is independently risky; one leg per page keeps each PR reviewable and revertable on its own. Do none at all (2-column only) — rejected per direct developer request ("let's utilize third column also").                                                                                                                                                                                                        |
| Mobile pattern                                                                                          | Drill-down index (grouped rows, tap → push, back link in each section)                                                    | A mobile fork that shows the sidebar as an always-visible top strip (just the current horizontal tab strip, vertically laid out) — rejected per the developer's explicit reference (a native Settings-app grouped list with drill-down navigation, not a persistent list alongside content). Reusing `SwipableMobileCarousel` (Tasks' pattern) — rejected: that fits a small, fixed set of peer views a user swipes between; Console has 11 sections, and "swipe past 10 siblings to reach Broadcast" is worse than a scrollable index list. |
| Overview's role                                                                                         | Stays as a dashboard on desktop, becomes the drill-down index on mobile (same route, `ResponsiveSurface` fork)            | Remove Overview now that the sidebar is the nav — rejected per direct developer preference; keeping it also gives mobile a real index page instead of only being reachable when the sidebar happens to render, and leaves room for real at-a-glance stats later.                                                                                                                                                                                                                                                                             |
| `InviteDialog`/`CreateGroupDialog` (create-new flows)                                                   | Left as dialogs, decided per-leg — **leg 2 confirmed this for `InviteDialog`: stays a plain dialog, untouched**           | Force every dialog in a converted page into the detail column — rejected: "create new" and "view/edit selected" are different interactions (nothing is selected yet when creating), and forcing both through one pane would either need a fake "draft" selection state or two different pane shapes. Each leg decides this for its own page rather than the workstream mandating one answer for all four.                                                                                                                                    |
| Scope: fold in the stale docs-server reference cleanup (leg 6)                                          | Yes, as its own independent leg in this workstream                                                                        | Open a separate workstream/task for it — rejected per direct developer request ("clean the CLAUDE.md... as a part of the workstream"); it is unrelated to Console/`ThreeColumnLayout` in substance, but small, low-risk, and already scoped during this same planning conversation, so a dedicated leg (no dependency on or from legs 1-5) was judged not worth a separate document.                                                                                                                                                         |
| RFC 0085 / epic task 9.22 (`NavRail`) conflict, discovered mid-leg-1 while rebasing PR #580 onto `main` | Keep this workstream's design for Console; RFC 0085 marked Superseded (Console only), task 9.22 marked Rejected as scoped | Adopt RFC 0085's design instead (keep Console on `shell: "overlay"`, resized to `md`, with a `NavRail` inside the dialog, mobile unchanged) — considered and rejected by the developer, since this workstream's leg 1 was already coded and its mobile drill-down redesign covers ground RFC 0085 explicitly deferred. RFC 0085's `NavRail`-in-overlay idea is not rejected outright — only its Console-bundled scope is; Account (untouched by this workstream) could still adopt it later as its own, separately-scoped task.              |

## Prerequisites

None. `ThreeColumnLayout`, `ResponsiveSurface`, `PageContainer`,
`OfflineGate`, and `Icon` already exist in `packages/ui`; `data-plugin-fullbleed`
already exists in `runtime/app/(platform)/shell.module.css`. No other
workstream must land first.

## Legs

| Leg | Name                                        | Epic tasks  | Epics | Gate? | Done when                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------- | ----------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `NavList` + Console shell/nav/mobile rework | 9.28, 13.17 | 9, 13 | No    | Console is `shell: "default"`, desktop renders `ThreeColumnLayout` + `NavList` sidebar, mobile renders the drill-down index + per-section back link, Overview forks via `ResponsiveSurface`; all DoD items above except the 4 detail-column ones.                                                                                           |
| 2   | Users → 3-column                            | 13.18       | 13    | No    | Selecting a user row shows a detail pane with role/capabilities/status actions; `CapabilitiesButton` dialog removed.                                                                                                                                                                                                                        |
| 3   | Groups → 3-column                           | 13.19       | 13    | No    | ✅ Selecting a group shows a detail pane; `ManageGroupDialog` removed (kept mobile-only).                                                                                                                                                                                                                                                   |
| 4   | Plugins/Apps → 3-column                     | 13.20       | 13    | No    | ✅ Selecting a plugin row shows a detail pane; `PluginAccessDialog` removed (kept mobile-only).                                                                                                                                                                                                                                             |
| 5   | External clients → 3-column                 | 13.21       | 13    | No    | Selecting an OAuth client shows a detail pane for rotation/revocation.                                                                                                                                                                                                                                                                      |
| 6   | Retire stale docs-server references         | 16.6        | 16    | No    | `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING.md`/`docs/epics/docs.md`/`docs/epics/README.md`/`docs/development-workflow.md`/`docs/docs-site-revamp-plan.md` no longer describe the retired `apps/docs` VitePress app or its `docs-v*`/`docs.yml` mechanism as live in this repo. Independent of legs 1-5 — can land in any order relative to them. |

Each leg is one branch, one draft PR, one review gate. The agent runs
uninterrupted within a leg and stops at its end. See
[README.md](README.md#the-leg-contract).

## Leg detail

### Leg 1 — `NavList` + Console shell/nav/mobile rework

**Epic tasks:** 9.28, 13.17

**Why this leg is first:** Every later leg's detail column is additive to the
2-column shell this leg builds; none of them can start until Console is off
`overlay` and has a working sidebar/main split to attach a 3rd column to.
Bundling the new DS component into this same leg (rather than a preceding one)
was a deliberate developer decision — see Decisions locked.

**Technical notes:**

_New component — `packages/ui/src/components/NavList/`:_

```ts
export interface NavListItem {
  id: string;
  label: string;
  href: string;
  icon: IconName; // reuse the existing Icon component's name union — no new icon system
  badge?: ReactNode; // optional trailing meta (e.g. a count) — not used by Console leg 1, but keeps the API from needing a breaking change when a later consumer wants one
}

export interface NavListGroup {
  id: string;
  label?: string; // omit for an ungrouped leading item/group, e.g. "Overview" pinned above the grouped sections
  items: NavListItem[];
}

export interface NavListProps {
  groups: NavListGroup[];
  variant: 'static' | 'drilldown';
  'aria-label': string;
}
```

- Presentational only, per `packages/ui`'s existing "no data fetching, no SDK
  import" rule (matches `ThreeColumnLayout`'s own doc comment). Active-state
  highlighting in `variant="static"` is computed internally via
  `usePathname()` + a longest-prefix match against each item's `href`,
  mirroring `ConsoleNavLink.tsx`/`ActiveNavLink.tsx`'s existing logic (both
  plugin-local today, not promoted here — only the row/group rendering moves
  to the DS, not the active-match helper itself, since that helper is tiny
  and neither plugin needs to share it beyond what `NavList` now does
  internally).
- `variant="static"`: no chevron, active row gets a background highlight +
  `aria-current="page"`, `<Link>` navigation (soft nav, standard Console
  behavior today).
- `variant="drilldown"`: trailing `Icon name="chevron-right"`, no active-state
  concept (tapping always navigates away), `<Link>` navigation.
- Group header: small uppercase muted label above a group's items, omitted
  entirely when `group.label` is unset (the "Overview" pinned item is a
  `NavListGroup` with no `label` and a single `NavListItem`).
- Storybook: `packages/ui/src/stories/NavList.stories.tsx` — both variants,
  grouped and ungrouped, active and inactive states, per this repo's
  Storybook hygiene rule; add to `DesignSystemOverview.stories.tsx`'s
  Component Gallery and bump its component-count string.
- `packages/ui` version bump: **minor** (new additive component, no breaking
  change to any existing export).

_Console section taxonomy_ (shared by desktop sidebar and mobile index — define
once, e.g. `plugins/console/app/_lib/sections.ts`, imported by both
`layout.tsx` and `page.tsx`):

- Overview (pinned, ungrouped) → `/console`
- **People** — Users (`/console/users`), Groups (`/console/groups`)
- **Apps** — Plugins/Apps (`/console/plugins`), Entitlements
  (`/console/entitlements`), External clients (`/console/oauth-clients`)
- **Configuration** — Settings (`/console/settings`), Identity
  (`/console/identity`)
- **Monitoring** — Health (`/console/health`), Activity (`/console/activity`)
- **Communication** — Broadcast (`/console/broadcast`)

_`plugins/console/manifest.json`:_ `"shell": "default"`; remove
`"shellConfig": { "overlaySize": "lg" }` entirely (no `default`-shell config
needed unless leg 1 also decides to opt out of the platform mobile
header/footer — it should not: Console keeps the platform's own mobile
header/footer chrome, since it's a real page now, not a full-screen sheet
replacing all chrome the way the overlay Dialog did).

_`plugins/console/app/layout.tsx`:_ rebuild around `ResponsiveSurface`
(`web`/`mobile` props) instead of `useOverlaySecondRow` (which becomes dead —
there is no enclosing Dialog anymore once `shell` is `default`):

```tsx
'use client';
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOverview = pathname === '/console';

  return (
    <ResponsiveSurface
      web={
        <div data-plugin-fullbleed className={styles.frame}>
          <ThreeColumnLayout sidebarWidth={240}>
            <NavList groups={SECTIONS} variant="static" aria-label="Console sections" />
            <div className={styles.main}>
              <OfflineGate surfaceName="Console">{children}</OfflineGate>
            </div>
          </ThreeColumnLayout>
        </div>
      }
      mobile={
        <div className={styles.mobileFrame}>
          {!isOverview && (
            <Link href="/console" replace className={styles.backLink}>
              <Icon name="chevron-left" size="sm" aria-hidden />
              Console
            </Link>
          )}
          <OfflineGate surfaceName="Console">{children}</OfflineGate>
        </div>
      }
    />
  );
}
```

- `data-plugin-fullbleed` opts the desktop tree into the shell's hard-locked
  viewport height + zero shell gutter (`runtime/app/(platform)/shell.module.css:166-198`)
  — required for `ThreeColumnLayout`'s columns to each scroll independently
  instead of the whole page scrolling as one unit, matching exactly how
  `plugins/sovereign-plugin-tasks.local/app/_components/DesktopTasksShell.tsx`
  and `plugins/warden/app/page.tsx` already do this. `PageContainer` is
  **dropped** from the desktop tree (the fullbleed root supplies its own
  padding per column instead — `NavList`'s own internal padding for column 1,
  a `.main` wrapper's padding for column 2); do not nest `PageContainer`
  inside a fullbleed root, or column content double-pads.
- Mobile does **not** opt into `data-plugin-fullbleed` — it keeps the normal
  auto-growing page height and the platform's own mobile header/footer
  clearance; `PageContainer` (or an equivalent gutter) still applies to
  `.mobileFrame`'s content, same as today.
- Individual section pages (`page.tsx` under `users/`, `groups/`, etc.) mostly
  keep their existing JSX (`styles.pageHeader`, `styles.tableCard`, etc.) —
  this leg does not touch them beyond what `console.module.css`'s
  restructuring requires (see below). Leg 1 is the shell/nav rework; the
  content of each section page is untouched except where a later leg adds a
  detail column to it.

_`plugins/console/app/page.tsx` (Overview):_ fork via `ResponsiveSurface` —
`web` renders the existing dashboard-card pattern, extended from today's 5
cards to all 11 sections (grouped the same way as the nav); `mobile` renders
`<NavList groups={SECTIONS} variant="drilldown" aria-label="Console sections" />`.
No data fetching either way — this page has none today and needs none for
this leg.

_`console.module.css`:_ restructure, not patch. `.nav`/`.navLink`/
`.navLinkActive`/`.header`/`.headerHiddenOnMobile` and their
`@media (max-width: 768px)` overrides are dead once the horizontal tab strip
is gone — delete rather than leave unused. New rules needed: `.frame` (the
fullbleed desktop root), `.main` (column 2's own padding/scroll),
`.mobileFrame`/`.backLink` (mobile). Every other existing class
(`.tableCard`, `.pageHeader`, `.cards`, `.section`, mobile card-list classes,
etc.) is unaffected — section page content doesn't move in this leg.

_Ripple effects to close out in this same leg (not deferred to a later leg or
a separate PR):_

- `docs/architecture-rules.md`'s overlay-size bullet ("the size overlay-shell
  plugins (Account, Console) render into") narrows to "(Account)" only.
- `docs/plugins/console.md` and `docs/epics/plugin-console.md` updated to
  describe `shell: "default"` and the new layout, not the retired overlay
  behavior.
- `docs/epics/platform-shell.md` task 2.5/2.19 review checklists assert
  Console's overlay behavior as present-tense fact — add a short forward
  pointer to this workstream rather than rewriting completed-task history.
- `docs/rfcs/0001-overlay-shell-variant.md` names Console as one of the two
  "motivating cases" for the overlay shell mode in its prose (not its Status
  line — the mechanism itself stays `Implemented`, Account still uses it). A
  light editorial note that Console has since moved off it is worth adding;
  this does **not** change RFC 0001's `Status:` line.
- `runtime/app/(platform)/(plugins)/@modal/(.)console/*` (generated,
  gitignored) disappears on the next `pnpm generate`/`pnpm dev` — no manual
  action, just don't be surprised by it in a `git status` diff (it shouldn't
  appear at all, being gitignored).
- `plugins/console/manifest.json` version bump (manifest-only, per this
  repo's plugin-versioning convention) + a platform root `package.json`
  minor bump (this leg is real user-visible behavior change, not a patch).
- e2e specs (`__tests__/e2e/console.spec.ts`, `console-auditor.spec.ts`,
  `console-settings.spec.ts`, `oauth-clients.spec.ts`) hard-navigate to
  `/console/*` URLs directly and should keep passing structurally, but must
  be run and any selector coupled to the old `.nav`/tab-strip DOM fixed, not
  skipped.

**Do not proceed if:** Storybook review of `NavList` surfaces a shape that
can't cleanly express both the desktop static sidebar and the mobile
drill-down index from the same `groups` data (e.g. if grouping needs to differ
between the two) — fix the component's API within this leg before opening its
PR, since every later leg's desktop sidebar and Overview's mobile index both
depend on it being right.

### Leg 2 — Users → 3-column

**Epic tasks:** 13.18

**Why this leg is second:** Users is Console's highest-traffic page and its
current dialog usage (`CapabilitiesButton`) is the clearest, most
self-contained candidate — a good first proof that the detail-column pattern
works before repeating it three more times.

**Technical notes:** `ThreeColumnLayout`'s 3rd child is conditionally rendered
(`{selectedUser && <DetailPane .../>}`) — omitted entirely, not hidden, when
nothing is selected, per the component's own documented API (see
`example-plugins/example-layouts/app/three-column/_components/ThreeColumnDemo.tsx`
for the reference pattern: `useState` for the selected id, filter/find against
the already-fetched row list, close button clears selection). Selection state
should live in the URL (e.g. `?user=<id>` on `/console/users`, mirroring how
`sovereign-tasks`' desktop shell drives its own detail pane off `?task=<id>`)
rather than local component state only, so a detail pane is linkable/
refreshable. `CapabilitiesButton.tsx`'s existing capability-grant logic moves
into the detail pane rather than being reimplemented. Below a "detail
collapse" breakpoint (see `DesktopTasksShell.tsx`'s
`DETAIL_COLLAPSE_BREAKPOINT_PX` precedent — a tablet-width gap narrower than
the mobile fork's own breakpoint), render 2 columns only (sidebar + list),
never squeeze all three into too little space.

**Do not proceed if:** leg 1's PR hasn't merged yet (standard cross-leg rule).

**Outcome:** Implemented via a small reusable mechanism rather than a
Users-specific one, since legs 3-5 need the identical shape: a
`ConsoleDetailPaneContext`/`useConsoleDetailPane` pair in
`_lib/detail-pane.tsx` mirrors `@sovereignfs/ui`'s `Dialog`/
`useOverlaySecondRow` pattern exactly (a descendant page registers content,
`ConsoleLayout` owns the actual `ThreeColumnLayout` 3rd-column slot and
renders whatever's currently registered) — `ConsoleDetailSlot` wraps the hook
so a Server Component page can call it without its own `'use client'`
directive. `CapabilitiesButton.tsx`'s dialog content was split into a shared
`UserCapabilitiesFields` (the actual grant/revoke list) and a thin
button+`Dialog` wrapper kept **only** for `UserCard.tsx`'s mobile card list,
which has no detail column to render into — `UserDetailPane` (desktop)
renders `UserCapabilitiesFields` directly, no dialog. The table's role
column became read-only (`RoleBadge`) on desktop; actual role assignment
moved exclusively into the detail pane. `InviteDialog` stays an untouched
plain dialog, confirming the Decisions-locked expectation. Selection lives
in `?user=<id>` (looked up against the full fetched member list, not just
the current page's slice, so it resolves regardless of which `?page=` is
showing); close uses `<Link replace>`, select uses a plain `<Link>` —
matching `sovereign-tasks`' own `?task=<id>` select/close asymmetry
documented in `docs/plugin-development.md`.

### Leg 3 — Groups → 3-column

**Epic tasks:** 13.19

**Why this leg is third:** Same pattern as leg 2, smaller surface (a card grid,
not a paginated table) — a good second rep of the pattern before the two
more complex remaining pages.

**Technical notes:** `ManageGroupDialog`'s edit logic moves into the detail
pane; `CreateGroupDialog` (create-new) is evaluated on its own — leg 2
resolved the equivalent `InviteDialog` question by leaving it untouched as a
plain dialog (see leg 2's Outcome note above); `CreateGroupDialog` likely
follows the same reasoning but confirm rather than assume, since group
creation's UX shape isn't identical to invite's. Reuse the same
`ConsoleDetailSlot`/`useConsoleDetailPane` mechanism leg 2 built — it's
already generic, not Users-specific.

**Do not proceed if:** leg 2's PR hasn't merged yet.

**Outcome:** `ManageGroupDialog`'s body split into `GroupDetailFields.tsx`
(reused by a slimmed, mobile-only `ManageGroupDialog` and a new
`GroupDetailPane.tsx`, the desktop 3rd column) — the same shape as leg 2's
`UserCapabilitiesFields`/`UserDetailPane` split. `CreateGroupDialog` confirmed
live to need no change, matching leg 2's `InviteDialog` precedent exactly.
Leg 2's `.userDetail*` CSS classes generalized to `.detail*` now that a
second consumer exists — reuse as-is for legs 4-5. Groups has no
mobile/desktop render fork (one shared card grid); the desktop selection
link/chevron and the mobile `Manage` trigger are each CSS-gated to their own
side of the existing 768/769px breakpoint (`.cardChevron`/
`.cardManageMobile`) rather than duplicating Users' separate-component
approach — simpler given Groups' smaller surface, and still fully
`?group=`-linkable. Verified live end to end: create, select, edit, empty
members state, delete (pane and card both clear), the 900px collapse
breakpoint, and the mobile dialog, all against the real dev server.

### Leg 4 — Plugins/Apps → 3-column

**Epic tasks:** 13.20

**Why this leg is fourth:** `PluginsTable.tsx` is the most complex of the four
converted pages (filter bar, examples toggle, per-row toggle/remove actions
already going through the `ActionResult`/`useActionState` convention per task
13.15) — sequenced after two smaller reps of the pattern are already proven.

**Technical notes:** `PluginAccessDialog.tsx`'s access-management UI moves
into the detail pane. Read `PluginsTable.tsx`'s existing filter-bar/examples-
toggle state management before starting — the detail column's selection state
must coexist with that page's existing filter/search state without either
resetting the other unexpectedly (e.g. changing a filter while a plugin is
selected shouldn't silently clear the selection unless the selected plugin
actually drops out of the filtered set).

**Do not proceed if:** leg 3's PR hasn't merged yet.

**Outcome:** `PluginAccessDialog`'s body split into `PluginAccessFields.tsx`
(reused by a slimmed, mobile-only `PluginAccessDialog` and a new
`PluginDetailPane.tsx`, the desktop 3rd column) — the same shape as legs
2/3. Deliberately narrower scope than legs 2/3, though: Activate/Toggle
enable-disable/Open/Remove stay row-level actions rather than moving into
the pane too — "Open" especially is a frequent, low-risk action an admin
shouldn't need a detail pane open to reach, and this leg's own technical
note names only `PluginAccessDialog`'s content as moving. A row is
selectable under exactly the condition `PluginAccessDialog` used to render
(`!row.isChrome && status is enabled/disabled`) — chrome plugins and
inactive/incompatible rows get no selection Link/chevron. Selection lives
in `?plugin=<id>`, resolved server-side against the full row list;
`PluginsTable`'s own filter/search/examples-toggle state is local,
client-only React state, never URL-synced, so it's a separate concern that
survives the parent's re-render untouched. Verified live exactly the
coexistence risk this leg was written to guard against: selected a row,
typed a search query that filtered it out of the visible table, and
confirmed the detail pane (and its live-editable access-policy fields)
stayed fully intact throughout — clearing the filter brought the row back
with its selection highlight still applied.

### Leg 5 — External clients → 3-column

**Epic tasks:** 13.21

**Why this leg is last:** `OAuthClientsClient.tsx` hasn't been read in detail
as part of this workstream's planning (unlike the other three pages' dialogs)
— sequencing it last means any surprise there doesn't block the other three,
already-scoped conversions.

**Technical notes:** Start by reading `OAuthClientsClient.tsx` in full — this
workstream only confirmed it exists and handles all client CRUD client-side
against `/api/auth/oauth2/*` (see `oauth-clients/page.tsx`'s doc comment), not
its internal selection/dialog structure. The detail pane likely covers secret
rotation/revocation for a selected client; registering a new client is a
"create new" flow like `InviteDialog`/`CreateGroupDialog` and should be
decided the same way those were, not assumed.

**Do not proceed if:** leg 4's PR hasn't merged yet, or reading
`OAuthClientsClient.tsx` reveals a structure that doesn't map cleanly onto
"select a row → show detail" (e.g. if client secrets are only ever shown
once at creation time with no later "view" state to select into) — escalate
for a design call rather than forcing a detail pane where there's nothing to
show.

### Leg 6 — Retire stale in-repo docs-server references

**Epic tasks:** 16.6

**Why this leg exists in this workstream:** Unrelated to Console or
`ThreeColumnLayout` — surfaced mid-conversation when a `docs/package.json`
version-bump rule cited during leg planning turned out to belong to a
_different_ repository (`sovereignfs/sovereignfs`'s own `AGENTS.md`, which
legitimately hosts the docs site today) rather than a stale rule in this one.
That confusion was itself caused by real drift: several files in this repo
still described the now-deleted `apps/docs` VitePress app and its `docs-v*`/
`docs.yml` release mechanism as if live. Folded into this workstream by
direct developer request rather than opened separately, since it's small and
already fully scoped.

**Technical notes:** `apps/docs` was removed in `chore: remove retired
apps/docs VitePress app` (July 2026) — the commit message is the authoritative
explanation: "The docs site now lives in sovereignfs/sovereignfs's root
`docs/`, which fetches this repo's `docs/` content at build time via
`docs/docs-sync.manifest.json` instead of building it in-repo." Confirmed via
direct file inspection which references were already correct
(`docs/repositories.md`, RFC 0037, RFC 0067 — all three already carry accurate
"the site moved" context) versus which still claimed in-repo VitePress
build/deploy: `CLAUDE.md`/`AGENTS.md` (a dead `docs-vX.Y.Z` tag-pattern
example), `CONTRIBUTING.md` (a dead `docs.yml`/`docs-v*` deploy-table row —
confirmed `.github/workflows/docs.yml` doesn't exist via `ls`),
`docs/epics/docs.md` (the whole Epic 16 file, no retirement note at all,
despite RFC 0037/0067 — which that epic's own tasks incorporate — already
having one), `docs/epics/README.md` (epic 16's index row self-contradicted
`docs.md`'s own `## Status`: "⏳ In Progress" vs. "✅ Complete"),
`docs/development-workflow.md` (a one-line epic-table description), and
`docs/docs-site-revamp-plan.md` (`Status: Proposed` was stale — the plan
shipped, via RFC 0067/task 16.4, both already `Implemented`/done). Full
before/after detail is in task 16.6's own entry in
`docs/epics/docs.md`. Left alone, confirmed correct:
`docs/architecture-rules.md`'s `scripts/check-doc-links.ts`/
`slugifyVitePressHeading()` reference (that script is still live — this
repo's `docs/` content is still rendered by VitePress, just built
externally); `docs/design-system.md`'s Storybook-deploy mention (a separate,
still-active pipeline, unrelated to `apps/docs`); `ROADMAP.md`'s historical
shipping-order rows for tasks 16.1/16.2/16.4 (correctly document what shipped
at the time — `ROADMAP.md` is a chronological record, not rewritten
retroactively).

**Do not proceed if:** N/A — this leg has no dependency on or from legs 1-5
and no discovered blocker; the investigation above already found and fixed
every instance.

## Risks

- **`ThreeColumnLayout` has no responsive behavior of its own** (its own doc
  comment) — every leg that touches it must fork explicitly via
  `ResponsiveSurface`/`useResponsiveLayout`, never rely on CSS media queries
  alone to hide it on mobile. Leg 1 establishes this fork at the shell level;
  legs 2-5 must not bypass it when adding their own detail columns.
- **`data-plugin-fullbleed` + hard-locked desktop viewport height is a real
  behavior change**, not just a class name — `runtime/app/(platform)/shell.module.css:188-198`
  sets `overflow: hidden` on `.content` at desktop widths once any descendant
  carries the attribute. If leg 1's column layout doesn't give each column its
  own `overflow-y: auto`, content can become unreachable (clipped, not just
  visually broken) rather than merely losing a scrollbar.
- **Selection state via URL search params** (legs 2-5) interacts with
  Console's existing `?page=`/`?q=` pagination/search params on Users and
  Activity — confirm a detail-column `?user=<id>`-style param doesn't collide
  with or get clobbered by the existing pagination `Link replace` calls on
  the same page.
- **E2e coupling to the old DOM.** `__tests__/e2e/console*.spec.ts` and
  `oauth-clients.spec.ts` were written against the horizontal tab strip and
  dialog-based flows; leg 1 changes the former, legs 2-5 change the latter
  per page. Treat a passing e2e run after each leg as a real gate, not a
  formality — these are the only automated check that catches a regression
  the DOM-shape change could hide from unit tests.
- **RFC 0001's prose goes stale**, not its Status — see leg 1's ripple-effects
  note. Low risk if missed (doesn't block anything), but worth doing in the
  same leg rather than as a separate forgotten follow-up.
- **Parallel-session design collisions.** RFC 0085/epic task 9.22 (`NavRail`)
  solved the same underlying problem (Console's hand-rolled tab strip) with
  an incompatible design, drafted independently and merged to `main` while
  leg 1 was in progress — discovered only when rebasing PR #580, not before
  starting. `git log <branch>..origin/main` for anything touching
  `plugins/console`/`plugins/account`/`packages/ui` (not just a plain
  `git pull`) is worth doing before starting any later leg too, since legs
  2-5 touch the same files a similarly-scoped parallel effort might.

## Kill criteria

Leg 1 is the load-bearing one: if `NavList`'s Storybook review or the
fullbleed/`ThreeColumnLayout` restructuring reveals a real blocker (e.g. the
mobile drill-down pattern doesn't actually fit Console's data cleanly, or the
hard-locked-height approach breaks something leg 1 didn't anticipate), stop
there — Console keeps working exactly as it does today (still `overlay`,
still the horizontal tab strip) until leg 1 is ready, and `packages/ui` gains
`NavList` regardless, usable by Account or another plugin even if Console's
own adoption stalls. Legs 2-5 are independently low-risk to abandon at any
point after leg 1 ships: each leg converts exactly one page's dialogs to a
detail pane, and stopping partway leaves a fully working, coherent 2-column
Console with some pages using dialogs and others using detail panes — not a
broken intermediate state. There is no scenario in this workstream where a
partial completion leaves Console in a worse state than before it started,
since every leg after leg 1 is additive to an already-shipped, working shell.
Leg 6 has no kill scenario worth naming — it's a documentation-only cleanup
with no code dependency in either direction; it can land whenever, independent
of whether legs 1-5 ship at all.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                     |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Aug 2026 | Initial draft                                                                                                                                                                                                                                              |
| 0.2     | Aug 2026 | Added leg 6 (task 16.6) — retire stale in-repo `apps/docs`/`docs-v*` references in `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and several `docs/` files, folded in by direct developer request; edits made directly in this session (not yet committed). |
