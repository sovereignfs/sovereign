# RFC 0001 — Overlay shell variant

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Platform shell, manifest schema, generate script, `packages/ui`\
**Incorporated into plan:** Yes — the design is recorded in SRS §3.8 (shell modes), §3.9 (dual composition), §5 (manifest `shell` enum), and CON-11 (root-plugin eligibility), with a decision-log row. The implementation is scheduled as Task 0.5.10 (overlay shell mode); the code changes in the "Impact when accepted" table land in that task.

---

## Summary

Add a third `shell` mode to the plugin manifest — `overlay` — for plugins that
should render as a dialog **over** the current page instead of navigating to a
full page. Console and Account are the motivating cases: opening platform
settings or your own profile should feel like a quick, dismissable layer on top
of whatever you were doing, not a context-destroying navigation away from it.

```json
{ "shell": "default" | "minimal" | "overlay" }
```

## Motivation

The shell currently supports two modes (SRS §3.8):

- `default` — full chrome; the plugin composes under the `(platform)/(plugins)`
  route group and inherits the sidebar.
- `minimal` — chrome-free full viewport (declared, not yet wired).

Both are **full-page** modes. But some plugins are _interruptions_, not
_destinations_. A user adjusting their timezone in Account, or an admin
toggling a plugin in Console, is mid-task somewhere else — in Tasks, in
Plainwrite's editor — and wants to return to exactly where they were. Today
that round-trip costs two full navigations and loses scroll/UI state in the
underlying plugin.

The same pattern recurs beyond chrome plugins: quick-capture tools, pickers,
and settings-like third-party plugins all want "open over the current view,
do one thing, dismiss." Making `overlay` a manifest-level mode keeps the
principle that **Console and Account are plugins, not special cases** — any
plugin can opt in, and the shell treats them all identically.

## Current state (what this builds on)

- Plugins compose at their `routePrefix` under a `shell`-selected route group;
  the composed segments are copies written by the generate script (CLAUDE.md
  hard rules, SRS §3.9). `shell: minimal` fails loudly in the generate script.
- Console and Account live in the sidebar **bottom section** as hardcoded shell
  chrome (PLT-11); clicking them currently navigates to `/console` / `/account`
  as full pages.
- `adminOnly` routes are gated in the runtime middleware by URL prefix
  (PLT-03) — gating is independent of how the route is presented.

## Proposed design

### 1. Manifest

The `shell` enum gains a value:

```typescript
// Shell layout preference
// "default" — full shell chrome (sidebar on desktop, header + footer on mobile).
// "minimal" — shell chrome hidden entirely, content fills the viewport.
// "overlay" — renders as a dismissable dialog over the current page;
//             full-page fallback on direct/hard navigation.
shell?: 'default' | 'minimal' | 'overlay';
```

This stays a single mutually-exclusive field rather than a separate
`presentation` field — a plugin is exactly one of page-with-chrome,
page-without-chrome, or overlay (see Alternatives).

### 2. Routing — parallel + intercepting routes

Next.js App Router has a first-class pattern for "modal over the current
page": a **parallel route slot** rendered by the layout, populated via
**intercepting routes** on soft navigation, with the real route as a full-page
fallback on hard navigation. The proposal maps the existing copy-composition
model onto it:

```
runtime/app/(platform)/
├── layout.tsx                      # renders {children} and the {modal} slot
├── @modal/
│   ├── default.tsx                 # slot empty when no overlay is open
│   ├── layout.tsx                  # wraps slot content in the Dialog chrome
│   └── (.)console/…                # ← generate script: interception copy
└── (plugins)/
    └── console/…                   # ← generate script: full-page fallback copy
```

For a `shell: overlay` plugin, the generate script composes the plugin's
`app/` tree **twice**:

1. **Interception copy** → `(platform)/@modal/(.)<routePrefix>/` — an in-app
   (soft) navigation to the plugin renders inside the `@modal` slot, layered
   over whatever page is currently mounted. Navigation _between the plugin's
   own sub-routes_ (e.g. `/console/users` → `/console/settings`) stays inside
   the slot, so multi-page plugins work as multi-page dialogs.
2. **Full-page fallback** → `(platform)/(plugins)/<routePrefix>/` — exactly
   what `shell: default` produces today. A hard load (deep link, refresh,
   bookmark, middleware redirect after login) renders the plugin as a normal
   full page with the sidebar.

Properties that fall out of this design for free:

- **URLs are real and unchanged.** `/console/users` is the same URL whether it
  renders as an overlay or a page. Deep links, the middleware's `adminOnly`
  gating (PLT-03), and the login redirect all keep working with zero changes —
  gating happens by URL prefix before rendering mode is ever considered.
- **The underlying page stays mounted.** Closing the overlay (`router.back()`)
  returns to the exact prior state — no refetch, no lost scroll position.
- **No plugin code changes.** The plugin's `app/` tree is identical in both
  copies; a plugin author writes ordinary pages and flips one manifest field.

The runtime owns the dialog chrome: `@modal/layout.tsx` wraps slot content in
a `Dialog` (scrim, close affordance, Esc/scrim-click dismiss via
`router.back()`, focus trap). Plugin content never implements its own modal
shell.

### 3. Shell chrome behaviour

- Sidebar bottom section (Console icon, Account avatar) keeps rendering plain
  `<Link>`s — interception turns those clicks into overlays automatically.
  No special-casing in the chrome.
- **Mobile:** the overlay renders as a full-screen sheet (same slot, responsive
  styling) — standard mobile modal behaviour. Header/footer chrome stays
  beneath it.
- **Root plugin eligibility:** the root plugin serves the platform root `/` as
  a full page, so `shell: overlay` plugins are **not eligible** as root plugin.
  CON-11's eligibility rule ("installed, enabled, non-adminOnly") gains
  "non-overlay".

### 4. `packages/ui`

New primitives (also independently useful):

- **`Dialog`** — scrim + panel, sizes (`sm` / `md` / `lg` / `full`), Esc and
  scrim-click dismissal, focus trap, `--sv-*` tokens only.
- **`Sheet`** — the mobile full-screen variant (may be a `Dialog` responsive
  mode rather than a separate component — implementation detail).

### 5. Generate script

- `shell: overlay` → compose the two copies described above and emit the
  registry entry with the mode (the shell may want it for chrome hints).
- `shell: minimal` remains unwired and keeps failing loudly — this RFC does
  not implement it, but the route-group mapping it implies
  (`default` / `minimal` / `overlay` → three compose targets) should be kept
  coherent when either lands.

## Impact (accepted — SRS/tasks incorporated; code lands in Task 0.5.10)

| Where                                                | Change                                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/manifest`                                  | `shell` enum gains `'overlay'`; tests; **minor** version bump.                                                                                       |
| SRS §3.8 / §5                                        | Document the third mode; update the shell-layout prose and manifest reference; decision-log entry.                                                   |
| SRS §4                                               | Extend CON-11 root-plugin eligibility with "non-overlay".                                                                                            |
| `scripts/generate-registry.ts`                       | Dual composition for overlay plugins (interception + fallback copies).                                                                               |
| `runtime/app/(platform)/`                            | `@modal` slot: `default.tsx`, dialog `layout.tsx`; layout renders the slot.                                                                          |
| `packages/ui`                                        | `Dialog` (and mobile sheet behaviour).                                                                                                               |
| `docs/plugins/console.md`, `docs/plugins/account.md` | Manifests flip to `shell: "overlay"`; UI sections updated.                                                                                           |
| `ROADMAP.md`                                         | A wiring task (suggested: land with or just before the Account plugin task, so Account ships overlay-first and Console migrates in the same change). |
| `CLAUDE.md`                                          | Hard-rule note: the shell route-group mapping gains the overlay compose target.                                                                      |

## Alternatives considered

1. **Client-side modal rendering** (portal/iframe that fetches the plugin
   route): loses RSC rendering and layout nesting, double-fetches, and
   reimplements routing the App Router already provides. Rejected.
2. **Hardcode Console/Account as chrome dialogs** (not manifest-driven):
   violates the "Console is a plugin, not a special case" decision (SRS
   decision log) and gives third-party plugins no path to the same behaviour.
   Rejected.
3. **A separate `presentation` manifest field** (`page` | `overlay`) alongside
   `shell`: creates an invalid combination surface (`minimal` + `overlay`?)
   for no benefit — the three modes are mutually exclusive presentations of
   one plugin. Rejected in favour of extending the existing enum.

## Open questions

1. **Deep-link rendering choice.** A hard load of `/console` renders the
   full-page fallback (proposed). Alternative: render the root plugin with the
   overlay already open on top. The fallback is simpler and ships first;
   "overlay restored over root" can be revisited later without breaking URLs.
2. **Per-plugin size hint.** ~~Should the manifest carry a dialog size or does
   the runtime pick one size for all overlays in v1?~~ **Resolved (post-0.5.09):**
   the manifest carries an optional `shellConfig.overlaySize` (`sm` | `md` |
   `lg`, default `lg`); the `@modal` slot resolves it from the selected
   interception segment.
3. **Unsaved-state dismissal.** Esc/scrim-click closes the dialog; a plugin
   mid-form may want to confirm. Does v1 accept close-loses-state (plugins
   should save eagerly, as Account does), or do we need an SDK hook to block
   dismissal? Recommendation: accept in v1; revisit with evidence.
4. **History stacking.** ~~Navigating between several sub-routes inside an
   overlay builds history entries; closing via `router.back()` then steps
   through them.~~ **Resolved (post-0.5.09):** intra-overlay tab/section links
   use `<Link replace>`, so the overlay occupies a single history entry and one
   `router.back()` dismisses straight to the pre-overlay page. Documented as a
   convention for third-party overlay plugins in `docs/plugin-development.md`.
5. **Interception edge cases.** Confirm interception behaves correctly across
   the `(plugins)` route-group boundary and with the composed-copies model on
   the current Next.js version (prototype before accepting).

## Adoption path

1. Accept RFC → apply the "Impact when accepted" table top to bottom
   (manifest first, then runtime wiring, then spec/doc updates — one task).
2. Account ships with `shell: "overlay"`; Console migrates from `default` in
   the same change.
3. `overlay` becomes available to third-party plugins as part of the public
   manifest contract from the next `@sovereignfs/manifest` minor release.

## Changelog

| Version | Date     | Change                                                                                                                                                                                              |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft.                                                                                                                                                                                      |
| 1.0     | Jun 2026 | Accepted; incorporated into SRS (§3.8/§3.9/§5/CON-11 + decision log) and Task 0.5.10.                                                                                                               |
| 1.1     | Jun 2026 | Post-implementation: resolved open questions 2 (manifest `shellConfig.overlaySize`) and 4 (`router.replace` for intra-overlay navigation).                                                          |
| 1.2     | Jun 2026 | Post-implementation: the `Dialog` scrim insets its left edge past the platform sidebar (`--sv-dialog-inset-left`), so overlay dialogs start at the sidebar's right edge and leave the rail visible. |
