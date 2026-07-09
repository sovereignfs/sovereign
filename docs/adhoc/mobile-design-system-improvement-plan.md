# Mobile & cross-platform design system improvement plan

> **Status:** proposed — not yet started. No roadmap slot assigned; the developer
> assigns tasks at session start (see `docs/development-workflow.md`).
> **Written:** 2026-07-09, from a full read-through of `packages/ui`, the runtime
> shell/PWA layer, and the sovereign-tasks plugin. Findings were verified by code
> inspection only (not runtime-tested); re-verify line references before editing —
> files may have drifted since.

## Goal

Polish the design system so every component gives a smooth experience on Web,
Desktop, and Mobile — with particular focus on the mobile PWA, which should feel
like a native app. Keep the existing monochrome theming direction (see
`docs/design-system.md` and `packages/ui/src/tokens/semantic.css`). Streamline
modals, dialogs, buttons, and the touch-interaction layer.

Trigger: the developer reports that **tap and long-tap actions on the mobile PWA
have side effects that disrupt the user experience**. Part 1 diagnoses those
exactly; they are real defects, not vague polish.

## Guiding principle — fix at the platform level, not in plugins

**The tasks plugin is just a consumer.** Every improvement lands as far down the
stack as it can: design system (`packages/ui`) first, runtime shell second,
plugin last — and only for what is genuinely plugin-specific (its own layouts,
dnd-kit wiring, business logic). Interaction primitives, overlay surfaces,
headers, motion, and controls all ship from `@sovereignfs/ui` so tasks _and
every future plugin_ get them for free. Where Part 1 diagnoses a defect inside
the tasks plugin, the fix is a DS primitive that the plugin adopts — not a
patch that stays in the plugin.

## Repo split — read this first

Work lands in **two different repositories**:

| Location                         | Repo                                                                         | Conventions                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/ui`, `runtime/`        | this monorepo (`claude-sv`)                                                  | root `CLAUDE.md` — branch-per-task, version bumps, Storybook hygiene, docs parity |
| `plugins/sovereign-tasks.local/` | **separate repo** (`sovereign-tasks`), cloned locally with a `.local` suffix | its own `CLAUDE.md` inside that directory — own semver, own branches/PRs          |

Never mix changes across the two in one PR. The `.local` directory is gitignored
from the platform monorepo.

---

## Part 1 — Diagnosis: the tap / long-tap side effects

All in the sovereign-tasks plugin's interaction layer. These compound each other.

### 1.1 Long-press (bulk select) is flaky and leaky

`plugins/sovereign-tasks.local/app/_components/TaskItem.tsx` (~lines 19–21,
86–87, 192–224, 294–301):

- The 500ms long-press timer (`LONG_PRESS_MS`) is cleared by `onPointerMove` on
  **any** movement. Real fingers jitter 1–3px during a press, so the long-press
  fires inconsistently. There is **no movement-slop threshold** (should be ~10px
  of accumulated movement before cancelling).
- `onPointerCancel` is **not handled** on the long-press `<Link>` (it clears on
  `pointerup`/`pointerleave`/`pointermove` only). When the browser converts the
  touch into a scroll, `pointercancel` fires, the timer survives, and
  `onBulkToggle` fires mid-scroll → bulk-select mode appears "randomly".

### 1.2 A swallowed next tap

`TaskItem.tsx` — `suppressNextClick` ref (line ~87, consumed in
`handleMainClick` ~214–219): set when a long-press fires, cleared only by the
_next click_. iOS often delivers **no click at all** after a 500ms hold, so the
flag stays armed and silently eats the user's next legitimate tap on that row.
Fix: time-box the suppression (clear it after ~700ms or on the next
`pointerdown`), don't leave it armed indefinitely.

### 1.3 The OS fights the long-press

The long-press target is an `<a href>` (`<Link>`), and nothing suppresses native
behaviour:

- no `-webkit-touch-callout: none` → iOS shows the link-preview sheet;
- no `user-select: none` / `-webkit-user-select: none` → Android starts text
  selection;
- no `onContextMenu={e => e.preventDefault()}` → Android opens the link context
  menu.

So a long-press can trigger bulk-select **and** an OS menu simultaneously.
Check `TaskItem.module.css` — `.row`/`.main` have none of these properties.

### 1.4 Double-tap and the 350ms tax

- `plugins/sovereign-tasks.local/app/_lib/doubleTap.ts` —
  `useSingleOrDoubleTap` necessarily delays **every** single tap on a mobile
  list title by `DOUBLE_TAP_MS` (350ms) before navigating (used in
  `ListSidebar.tsx` `handleMobileTitleTap`, ~line 471). The sidebar feels laggy.
- No `touch-action: manipulation` anywhere → in browser-tab Safari (non-PWA),
  native double-tap-zoom races the double-tap-rename gesture. (`user-scalable`
  is deliberately _not_ disabled for a11y — correct; `manipulation` removes
  double-tap zoom without disabling pinch.)

### 1.5 dnd-kit sensors have no activation constraint

`ListSidebar.tsx` ~line 85–88 and `app/[listId]/TasksPane.tsx` ~line 161–164:
`useSensor(PointerSensor)` bare. Pointerdown on a drag handle instantly starts a
drag; on touch, an accidental hit eats the scroll. Fix: `activationConstraint:
{ distance: 8 }` (or delay+tolerance for touch), plus `touch-action: none` on
the `.dragHandle` elements (both components' CSS modules lack it).

### 1.6 Sub-44px touch targets and sticky hover

- Checkbox box ~18px (`packages/ui/src/components/Checkbox/`), subtask
  `.ringBtn` has 2px padding, `.dragHandle` is 12px — all below the 44px
  guideline. Mis-taps read as "side effects".
- Every `:hover` rule in `packages/ui` and the plugin CSS is unguarded — on
  touch, tap-generated hover **sticks** until the next tap elsewhere (buttons
  stay grey). Needs `@media (hover: hover)` guards.
- Nothing sets `-webkit-tap-highlight-color` → iOS flashes its grey rectangle
  on every tap.

---

## Part 2 — Design system gaps (why mobile feels unpolished)

### Already good — do not regress

- Token architecture (primitives → semantic, `--sv-*`), complete dark mode.
- Shell handles: safe-area insets, iOS input-zoom clamp, overscroll bounce
  suppression, per-device splash screens, theme-color script, offline banner,
  `--sv-dialog-inset-top` iOS fix (`runtime/app/globals.css`).
- `Dialog` becomes a full-screen sheet on mobile (≤768px) with a title bar
  (`packages/ui/src/components/Dialog/Dialog.module.css`).
- Ref-counted body scroll lock (`packages/ui/src/scroll-lock.ts`).

### Gaps

| Gap                           | Evidence                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No motion system**          | `Dialog.tsx` / `Drawer.tsx` mount/unmount instantly (`if (!open) return null`) — no enter/exit animation, no motion tokens, no `prefers-reduced-motion` handling. The plugin hand-rolled `MobileFullPageOverlay.tsx` with a two-phase mount (entering → open → closing) just to get a slide transition. That pattern is the proven reference. |
| **Missing components**        | Full-page mobile sheet (hand-rolled in plugin); content-sized confirm dialog (native `<dialog>` pattern copy-pasted between the account plugin and tasks plugin because `Dialog` is a fixed-size box _by design_); adaptive menu (tasks' `⋯` menu manually forks Popover-on-desktop / sheet-on-mobile).                                       |
| **No interaction primitives** | Long-press, double-tap, swipe-to-reveal, `useIsMobile` all live in the plugin (`app/_lib/`). Every third-party plugin dev will re-make the same mistakes.                                                                                                                                                                                     |
| **Button not touch-ready**    | `packages/ui/src/components/Button/Button.module.css`: no `:active` pressed state (hover-only feedback), `sm` size well under 44px, no loading state, unguarded hover, no `touch-action: manipulation`.                                                                                                                                       |
| **Drawer is bare**            | Grab handle is bolted on by the consumer (`runtime/app/(platform)/_components/MobileNav.tsx` renders its own `.handle` div); no swipe-down-to-dismiss; no animation.                                                                                                                                                                          |
| **Breakpoint drift**          | Plugin: mobile = 640px (`app/_lib/useIsMobile.ts`); shell + Dialog: 768px. Nothing exports a canonical value.                                                                                                                                                                                                                                 |
| **No global touch hygiene**   | `runtime/app/globals.css` lacks `-webkit-tap-highlight-color: transparent`, `text-size-adjust: 100%`, and `touch-action: manipulation` on interactive elements.                                                                                                                                                                               |

---

## Part 2.5 — Target surface taxonomy (agreed with developer, 2026-07-09)

One API per surface; presentation adapts per platform. On mobile the shell
chrome (header + footer nav) **stays visible and interactive** — overlays fill
the space between, never cover it.

| DS component             | Desktop presentation                                        | Mobile presentation                                                                                                                                         | Use for                                                                            |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Dialog` (sm/md/lg/full) | centred fixed-size modal                                    | full-page modal page between shell header and footer, slide transition, topped by `OverlayHeader`                                                           | overlay-shell plugins (Account, Console), any modal workflow                       |
| `ConfirmDialog`          | small content-sized centred card                            | same centred card (see D4)                                                                                                                                  | destructive / confirm prompts                                                      |
| `Drawer`                 | bottom sheet (rare on desktop)                              | partial-height bottom sheet (half screen or less), grab handle, swipe-down dismiss, snap heights                                                            | menus, options, sort/filter, controllers (Calendar/date picker), the Apps launcher |
| `Sheet`                  | n/a — desktop shows the same content inline (columns/panes) | full-page slide-up/slide-in page replacement with page-transition feel                                                                                      | detail views inside a plugin (task detail, list edit)                              |
| `Menu` (adaptive)        | `Popover`                                                   | `Drawer`                                                                                                                                                    | context / `⋯` action menus                                                         |
| `OverlayHeader`          | optional                                                    | **fixed** secondary header — title + close (+ optional back arrow / action slot / tab strip slot); everything below scrolls                                 | the one shared header for Dialog-on-mobile, Sheet, and Drawer                      |
| Page slides              | n/a (multi-column layouts)                                  | horizontal scroll-snap carousel with transitions (the tasks pattern) — documented plugin pattern; optionally route-level View Transitions in the shell (D7) | intra-plugin navigation between sibling pages                                      |

**Component inventory additions:** `Calendar`, plus a `DatePicker` field that
wraps it (renders in a `Popover` on desktop, a `Drawer` on mobile). Controllers
like this must come from the design system so platform and plugins share one
implementation — no more per-plugin pickers.

Verified current state this taxonomy corrects:

- The overlay slot (`runtime/app/(platform)/(plugins)/@modal/layout.tsx`)
  already wraps Account/Console in `Dialog` with a `title`, so mobile gets
  Dialog's `.mobileBar` (title + ×) — but the Account overlay layout
  (`@modal/(.)account/layout.tsx`) renders its **own** `<h1>Account</h1>` + tab
  nav _inside the scrollable content_: two stacked headers on mobile, tab strip
  scrolling under the fixed bar. Console's overlay layout mirrors this.
- `Dialog`'s mobile sheet handles the top inset (`--sv-dialog-inset-top`) but
  its scrim runs to `bottom: 0` — the panel extends under the footer nav and
  only content padding compensates. It should stop above the footer the way
  `Drawer` already does (`bottom: var(--sv-shell-footer-height, 0)`).
- Three hand-rolled secondary headers exist today (Dialog's `.mobileBar`,
  MobileNav's drawer header, the tasks plugin's rename-sheet and task-detail
  headers). `OverlayHeader` replaces all of them.

---

## Part 3 — The plan

Sequenced tasks; each = one branch = one PR, per repo conventions. Ordering:
A1 → A3 (the plugin fix consumes the DS hooks); A2 is independent; within B the
order matters (motion tokens before animated components); C depends on B.
Per the guiding principle, plugin-repo tasks (A3, C1) contain only consumption
and genuinely plugin-specific code — everything reusable ships in A1/B.

### Phase A — stop the bleeding (DS primitives + shell hygiene + thin plugin adoption)

**A1. `feat/` in platform monorepo — interaction primitives in `@sovereignfs/ui`** _(recommended first)_

- **`useLongPress`**: slop threshold ~10px, `pointercancel` handling,
  time-boxed click suppression, `contextmenu` preventDefault, optional
  `navigator.vibrate(10)` cue. Returns a spreadable props object (pointer
  handlers + `onContextMenu` + an inline `style` carrying
  `-webkit-touch-callout: none`, `user-select: none`, `touch-action:
manipulation`) so consumers get the _whole_ recipe from one hook — no CSS
  knowledge required in the plugin.
- **`useDoubleTap` / `useSingleOrDoubleTap`**: generalised from the tasks
  plugin's `doubleTap.ts`, with its documented caveats.
- **`useIsMobile`**: canonical breakpoint (decision D3) exported once.
- Storybook interaction stories + `docs/design-system.md` section; minor
  `@sovereignfs/ui` bump. These hooks are the foundation the rest of the plan
  consumes — hence first.

**A2. `fix/` in platform monorepo — global touch hygiene (shell level)**

- `runtime/app/globals.css`: `-webkit-tap-highlight-color: transparent`,
  `-webkit-text-size-adjust/text-size-adjust: 100%`, `touch-action:
manipulation` on `a, button, input, select, textarea, [role="button"]`
  (NOT on body — keep pinch-zoom for content, a11y). Benefits every plugin
  with zero plugin changes.
- Hover-guard + 44px tap-target audit of shell chrome (`MobileNav`,
  `AccountMenu`, `NotificationBell`, Dialog/Drawer close buttons).
- Patch bump of root `package.json`.

**A3. `fix/` in sovereign-tasks repo — consume the primitives**

- Replace the hand-rolled long-press timer in `TaskItem.tsx` with
  `useLongPress`; delete `app/_lib/doubleTap.ts` and `app/_lib/useIsMobile.ts`
  in favour of the `@sovereignfs/ui` exports.
- Genuinely plugin-specific remainder (the only code that stays local):
  dnd-kit `activationConstraint` on both `PointerSensor` usages,
  `touch-action: none` on the drag handles, and any row CSS not covered by the
  hook's style props.
- Patch version bump (plugin's own semver). Depends on A1.

### Phase B — design system foundation (platform monorepo, `feat/`, minor `@sovereignfs/ui` bumps)

Per root `CLAUDE.md`: every `packages/ui` change needs Storybook stories
(component + `DesignSystemOverview`/`TokenGallery` updates), a
`pnpm --filter @sovereignfs/ui typecheck`, `docs/design-system.md` updates, and
NFR-04 discipline (additive only in minors — never rename existing tokens or
change component props incompatibly).

**B1. Motion foundation**

- New primitive tokens: `--sv-motion-duration-fast|base|slow`,
  `--sv-motion-ease-out|in-out|spring` (in `tokens/primitives.css`; motion is
  theme-stable like the scale tokens — no semantic tier needed, but confirm
  against the token-architecture doc).
- Animate `Dialog` (fade/scale on desktop, slide-up on mobile) and `Drawer`
  (slide-up + exit phase) using the two-phase mount pattern proven in the
  plugin's `MobileFullPageOverlay.tsx`.
- `prefers-reduced-motion: reduce` → transitions collapse to instant.
- Keep the `open`/`onClose` API unchanged (exit animation happens internally
  before unmount).

**B2. New components (the taxonomy in Part 2.5)**

- **`OverlayHeader`** — the shared fixed secondary header: title, close button,
  optional back arrow, optional trailing-action slot, optional second-row slot
  (for tab strips like Account's). Used by Dialog's mobile mode (replacing
  `.mobileBar`), `Sheet`, and `Drawer` headers. Fixed at the top; sibling
  content region scrolls.
- **`Sheet`** — full-page mobile overlay; promote/generalise the plugin's
  `MobileFullPageOverlay` (props: `open`, `onClose`, `slideFrom`, aria-label;
  focus trap + Esc). Optional built-in `OverlayHeader` via `title` prop;
  headerless escape hatch stays for content that owns its header.
- **`ConfirmDialog`** — content-sized confirm (title, message, confirm/cancel
  labels, destructive variant). Replaces the native `<dialog>` pattern
  duplicated in `plugins/account` (`RevokeSessionButton`) and the tasks plugin
  (`ListSidebar` delete-list, `TasksPane` delete-completed).
- **Adaptive `Menu`** — Popover on desktop, bottom sheet on mobile (the fork
  the tasks `⋯` menu does manually).
- `Drawer` gains a built-in grab-handle affordance, swipe-down-to-dismiss, and
  snap heights (content-sized vs. half-screen), staying at "half or less" per
  the taxonomy.
- `Dialog` mobile mode: adopt `OverlayHeader`; stop the panel above the footer
  nav (`--sv-shell-footer-height`, matching Drawer) so shell chrome stays
  visible per Part 2.5.

**B2b. `Calendar` / `DatePicker`**

- New DS `Calendar` component (month grid, keyboard navigable, `--sv-*` tokens
  only) and a `DatePicker` field wrapping it: `Popover` on desktop, `Drawer`
  bottom sheet on mobile.
- Scope decision D6: date-only first (covers tasks due dates); time and range
  selection later. Recurrence UI stays plugin-side.
- Separate PR from B2 — it is the largest single component and shouldn't block
  the overlay work.

**B3. Touch ergonomics + shared primitives**

- `Button`: `:active` pressed state, `min-height: 44px` under
  `@media (pointer: coarse)`, loading state, hover behind `@media (hover:
hover)`.
- `Checkbox`: padded hit area to ≥44px without growing the visual box.
- `@media (hover: hover)` sweep across ALL components in `packages/ui`.
- (Interaction hooks ship earlier, in A1 — resolved: they live in
  `@sovereignfs/ui`, per the guiding principle.)
- Canonicalise breakpoints and document them (see decision D3).

### Phase C — adoption + docs

**C1. `feat/` in sovereign-tasks repo — adopt the new primitives**

- Replace `MobileFullPageOverlay` with `ui`'s `Sheet`; native `<dialog>`
  confirms with `ConfirmDialog`; the `⋯` menu fork with `Menu`. Delete the
  local implementations (interaction hooks were already swapped in A3).
- Resolve decisions D1/D2 (below) in this task.
- Requires a platform version bump of the plugin's `minPlatform` if it starts
  depending on new `ui` APIs — pin the `@sovereignfs/ui` minimum accordingly.

**C1b. `feat/` in platform monorepo — Account & Console overlay adoption**

- Replace the double-header mobile presentation: the overlay layouts
  (`@modal/(.)account/layout.tsx`, `@modal/(.)console/layout.tsx`) and the
  plugins' own headers converge on `OverlayHeader` (title + close fixed; tab
  strip in its second-row slot; body scrolls). Desktop presentation unchanged.
- Also sweep the Account/Console inner dialogs (`InviteDialog`,
  `PluginInstallPanel`, passkey/session confirms) onto `ConfirmDialog`/`Menu`
  where they fit.
- Depends on B2. Remember the intra-overlay `<Link replace>` rule (root
  `CLAUDE.md`) when touching overlay navigation.

**C2. `docs/` in platform monorepo — "Building for mobile" guide**

- New section in `docs/plugin-development.md` (+ cross-link from
  `docs/design-system.md`): touch-target rules, hover guards, the long-press
  recipe, PWA-feel checklist, breakpoint guidance. Mind the docs-parity test
  (`runtime/src/docs-parity.test.ts`) if any enumerable surface changes.

### Open UX decisions (developer to decide; needed by C1)

- **D1 — Double-tap rename on mobile.** Recommendation: drop it; single tap
  navigates instantly (removes the 350ms delay), rename moves behind long-press
  on the list row or an explicit `⋯` affordance. Keeping double-tap means
  keeping the delay.
- **D2 — Swipe-to-reveal edge zone.** The invisible ~20px right-edge strip
  (`.swipeEdgeZone`) is undiscoverable vs. iOS-native full-row swipe. Options:
  (a) full-row swipe with direction-lock arbitration against the carousel
  (real gesture-engineering work); (b) keep the edge zone but widen it and add
  a first-run hint (cheap).
- **D3 — Canonical mobile breakpoint.** Shell/Dialog use 768px; plugin uses
  640px. Recommendation: standardise the _platform_ definition at 768px and
  export it; a plugin may still document a narrower local threshold if its
  layout genuinely differs.
- **D4 — ConfirmDialog on mobile.** Recommendation: keep it a small centred
  card on all platforms (matches the native `<dialog>` pattern users already
  see and iOS/Android alert conventions) rather than a bottom sheet.
- **D5 — Component naming.** `Drawer`, `Dialog` are published API (NFR-04) —
  never rename them. New surfaces are additive: `Sheet`, `OverlayHeader`,
  `Menu`, `ConfirmDialog`, `Calendar`, `DatePicker`.
- **D6 — Calendar scope.** Date-only picker first (covers tasks due dates);
  time and range selection later; recurrence UI stays plugin-side.
- **D7 — Route-level page transitions.** The tasks carousel stays a documented
  plugin pattern (scroll-snap). Whether the shell additionally adopts the View
  Transitions API for route changes (native-app page-slide feel in the PWA) is
  a separate, optional task — progressive enhancement only, gated on
  `prefers-reduced-motion`, and needs testing against the iOS-Safari versions
  the PWA supports.

## Part 4 — Desktop/web non-regression (do not overlook)

The plan is mobile-focused but ships through shared components. Most changes
are desktop-safe by construction — mobile presentation lives behind
`@media (max-width: …)` / `pointer: coarse` gates, new components are additive
(NFR-04), and Dialog/Drawer desktop presentation is explicitly unchanged. The
following are the places where a mobile improvement CAN regress desktop; each
task must treat these as acceptance criteria:

1. **`useLongPress` must not leak `user-select: none` to desktop (A1).** The
   hook's style props suppress text selection and callouts — necessary for
   touch, hostile on desktop (users can no longer select a task title with the
   mouse). Gate: only fire the long-press machinery for `pointerType ===
'touch'` (mouse keeps ctrl/cmd-click for bulk select) and only include the
   suppression styles when the device matches `(pointer: coarse)` — not
   unconditionally.
2. **Exit animations vs. route-driven overlays (B1).** The `@modal` slot
   unmounts the overlay when `router.back()` changes the segment — a CSS exit
   transition inside Dialog never gets a chance to play, and naive "delay
   unmount" logic can't hold route content that no longer exists. Accept
   enter-animation-only for route-driven overlays (Account/Console), full
   enter+exit for state-driven ones (Drawer, Sheet, ConfirmDialog). Also:
   existing component tests may assert immediate unmount on close — update
   deliberately, don't loosen assertions blindly.
3. **`ConfirmDialog` replaces a native `<dialog>` (B2).** The native element
   gives top-layer rendering, `::backdrop`, and free focus containment. The
   replacement must match: correct stacking against Dialog/Drawer/Popover
   (z-index 100 today — a confirm opened _from inside_ an overlay must layer
   above it), focus trap + restore, Esc, backdrop click. Verify specifically
   inside the Account/Console overlay context, not just standalone.
4. **Checkbox hit-area expansion must not shift desktop layout (B3).** The
   tasks rows align the 18px checkbox with header icons to the pixel (see the
   alignment comments in `TaskItem.module.css`). Expand the hit target with a
   pseudo-element / negative-margin overlay so the visual box and layout
   footprint stay identical, and gate the expansion to `(pointer: coarse)`.
5. **Hybrid devices (touchscreen laptops) (A2/B3).** Gate size increases on
   `(pointer: coarse)` (primary pointer), not `(any-pointer: coarse)` — a
   touchscreen laptop with a mouse/trackpad as primary must keep desktop
   density. The new Button `:active` state shows on mouse clicks too — that's
   desired feedback, but design-review it on desktop rather than letting it
   ship as a side effect.
6. **Breakpoint unification can change tablet behaviour (D3).** If the tasks
   plugin moved from 640px to a canonical 768px, viewports 641–768px (small
   tablets, split-screen) would flip from the three-column web layout to the
   mobile carousel — a functional regression for those users. Default: the
   platform standardises 768px, tasks keeps 640px as its documented local
   threshold; only change it as a conscious decision with tablet testing.

And one structural guarantee to maintain: **desktop presentation of `Dialog`
(centred sm/md/lg), `Popover`, `Tooltip`, and the three-column tasks layout is
out of scope for changes** — any diff touching their non-mobile CSS paths needs
an explicit reason in the PR description.

## Verification checklist (applies to every task above)

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` green.
- For `packages/ui` tasks: Storybook stories updated + `pnpm --filter
@sovereignfs/ui typecheck`; `docs/design-system.md` updated in the same PR.
- Manual device pass for touch changes: iOS Safari **PWA standalone** AND
  browser tab (behaviours differ), plus Android Chrome. Test: long-press on a
  task row (enters bulk select, no OS menu, no swallowed next tap), scroll
  starting on a row (no accidental bulk select), list-title tap latency,
  swipe-to-reveal vs carousel swipe, drag reorder, sticky hover after tap.
- **Desktop non-regression pass** (Part 4) for every task touching shared
  components: mouse text selection on rows still works; hover states intact;
  keyboard nav / focus trap / Esc on Dialog, Drawer, ConfirmDialog, Menu;
  ctrl/cmd-click bulk select; drag reorder with mouse; Account/Console overlay
  open → tab-switch (`<Link replace>`) → single `router.back()` dismissal;
  Storybook visual review of changed components at desktop viewport; existing
  Vitest suites pass without weakened assertions.
- Tablet band check when breakpoints are involved: 641–768px must not
  accidentally switch layouts (Part 4, item 6).
- PRs are drafts (`gh pr create --draft`); no task numbers in branch/commit/PR
  text; rebase-and-merge only; version bumps per change type (see root
  `CLAUDE.md` and the plugin's own `CLAUDE.md`).
