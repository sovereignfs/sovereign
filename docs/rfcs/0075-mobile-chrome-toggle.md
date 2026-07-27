# RFC 0075 — Per-plugin mobile header/footer toggle

**Status:** Implemented\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (schema), `runtime/src/registry.ts`, `runtime/src/mobile-chrome.ts`, `runtime/middleware.ts`, `runtime/app/(platform)/layout.tsx`, `runtime/app/(platform)/shell.module.css`, `runtime/app/(platform)/_components/ClientShell.tsx`, `runtime/app/(platform)/_components/MobileNav.module.css`, `docs/plugin-development.md`, `docs/architecture-rules.md`; builds on RFC 0001 (shell modes), RFC 0013 (mobile responsiveness & PWA), RFC 0014 (minimal shell mode), RFC 0074 (offline-capable plugins — the neutral-shell precedent this reuses)\
**Incorporated into plan:** No roadmap slot — unplanned/urgent work, implemented directly on `feat/mobile-chrome-toggle` rather than scheduled through the roadmap queue.

---

## Summary

Let a `shell: "default"` plugin independently hide its **mobile header** and/or
**mobile footer** via two new optional `shellConfig` booleans — `mobileHeader` and
`mobileFooter`, both defaulting to `true` (today's behavior, unchanged). The
**desktop sidebar is never affected** by these fields; this is a mobile-only,
per-piece toggle for plugins that want more of the viewport on small screens
without going all the way to `shell: "minimal"` (which also gives up the sidebar
and every other shell affordance).

## Motivation

A mobile-first plugin — a chat thread, a canvas, a media viewer opened from a
list — often wants the mobile header or footer out of the way for a specific
screen's worth of vertical space, but still wants to _be_ a normal `default`-shell
plugin everywhere else: present in the desktop sidebar, present in the mobile
Drawer, reachable the ordinary way. Today the only lever is `shell`, and it's
all-or-nothing: `default` renders sidebar + mobile header + mobile footer as one
package, `minimal` renders none of it. There's no way to keep the sidebar (a
desktop concern this plugin has no complaint with) while dropping just the
mobile footer, or just the mobile header, or both.

## Current state (what this builds on)

- **`shell` and `shellConfig` today** (`packages/manifest/src/schema.ts:159-166`):

  ```ts
  shell: z.enum(['default', 'minimal', 'overlay']).optional(),
  shellConfig: z
    .object({
      /** Dialog size for `shell: overlay` plugins (default `lg`). */
      overlaySize: z.enum(['sm', 'md', 'lg']).optional(),
    })
    .strict()
    .optional(),
  ```

  `shellConfig.overlaySize` is scoped to `shell: 'overlay'` by a top-level
  `.refine()` on `manifestSchema` (`schema.ts:611-614`):

  ```ts
  .refine((m) => m.shellConfig?.overlaySize === undefined || m.shell === 'overlay', {
    message: 'shellConfig.overlaySize is only valid when shell is "overlay"',
    path: ['shellConfig', 'overlaySize'],
  })
  ```

  This is the precedent to extend, not replace.

- **`shell` picks a build-time composition target, not a runtime branch.**
  `scripts/generate-registry.ts` decides which route group a plugin's `app/` tree
  is copied into based on `manifest.shell` (`default` → `(platform)/(plugins)/`,
  `minimal` → the sibling `(minimal)/` group, `overlay` → both a fallback and a
  `@modal/(.)…` interception copy). This happens once, at generate time — RFC 0014
  explicitly chose this model over "conditional chrome in one layout" (see
  Alternatives, below) specifically because `minimal` removes chrome _entirely_
  and can live in a structurally different, sibling route group.

- **All `default`-shell chrome lives in one shared layout.**
  `runtime/app/(platform)/layout.tsx` renders, unconditionally, for every
  `default`-shell plugin:
  - desktop sidebar — `<aside className={styles.sidebar}>` (`layout.tsx:172`)
  - mobile header — `<header className={styles.mobileHeader} data-mobile-header>`
    (`layout.tsx:203`)
  - mobile footer — `<MobileNav .../>` (`layout.tsx:236`)

  Desktop vs. mobile is decided entirely by CSS media queries
  (`runtime/app/(platform)/shell.module.css`) — there is currently **no
  JS/manifest-driven branching** between these three elements at all.

- **The one existing per-request conditional-chrome mechanism** is the RFC 0074
  offline-route "neutral shell": `runtime/middleware.ts:438-439` matches the
  request path against `getOfflineRoutePrefixes()` (`runtime/src/registry.ts:36-40`)
  and sets `x-sovereign-offline-route: '1'`; `layout.tsx:46` reads it
  (`const isOfflineRoute = h.get('x-sovereign-offline-route') === '1';`) and
  neutralizes _personalization_ (user identity, the personalized plugin list) —
  it does not add or remove chrome _elements_; the sidebar/header/footer DOM
  nodes still render either way. This RFC reuses the same header-injection
  pattern but, unlike RFC 0074, does add/remove DOM nodes.

- **The shared-layout staleness trap.** Because `(platform)/layout.tsx` is one
  layout shared by every `default`-shell plugin, Next.js doesn't always
  re-execute it (and re-read `headers()`) on a client-side navigation between
  two plugins whose header-derived state differs — only when the matched route
  segment itself changes. RFC 0074 hit this directly: a live tab that
  soft-navigated into an offline route kept rendering the _previous_ route's
  (non-neutral) shell state. The fix,
  `runtime/app/(platform)/_components/ClientShell.tsx:96-104`, diffs
  `offlineRoutePrefixes` against the previous and current pathname on every
  navigation and calls `router.refresh()` exactly when offline-ness flips:

  ```ts
  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (previousPathname === pathname) return;
    const isOffline = (p: string) => offlineRoutePrefixes.some((prefix) => underPrefix(p, prefix));
    if (isOffline(previousPathname) !== isOffline(pathname)) {
      router.refresh();
    }
  }, [pathname, router, offlineRoutePrefixes]);
  ```

  A mobile-chrome toggle that varies per plugin is exactly the same shape of bug
  waiting to happen, and needs the same class of fix (see Proposed design).

- **`underPrefix(pathname, routePrefix)`** (`runtime/src/route-guard.ts:20-22`) is
  the existing, already-shared helper for "does this path belong to this
  plugin's route" — used by both the offline-route match and
  `decidePluginRoute`. Reuse it rather than re-deriving prefix matching.

- **`ClientShell`'s `syncViewport()`** (`ClientShell.tsx:34-50`) measures
  `document.querySelector('[data-mobile-header]')` to derive
  `--sv-dialog-inset-top`. If a plugin hides its mobile header, that selector
  will find nothing — this needs a defined fallback (see Open questions).

## Proposed design

### Manifest

Extend `shellConfig` with two new optional booleans, both defaulting to `true`
(preserving current behavior when unset):

```ts
shellConfig: z
  .object({
    /** Dialog size for `shell: overlay` plugins (default `lg`). */
    overlaySize: z.enum(['sm', 'md', 'lg']).optional(),
    /** Show the mobile header for `shell: default` plugins (default `true`). */
    mobileHeader: z.boolean().optional(),
    /** Show the mobile footer for `shell: default` plugins (default `true`). */
    mobileFooter: z.boolean().optional(),
  })
  .strict()
  .optional(),
```

Scope both to `shell: 'default'` with two more top-level `.refine()`s, following
the exact `overlaySize` pattern at `schema.ts:611-614`:

```ts
.refine((m) => m.shellConfig?.mobileHeader === undefined || m.shell === 'default', {
  message: 'shellConfig.mobileHeader is only valid when shell is "default"',
  path: ['shellConfig', 'mobileHeader'],
})
.refine((m) => m.shellConfig?.mobileFooter === undefined || m.shell === 'default', {
  message: 'shellConfig.mobileFooter is only valid when shell is "default"',
  path: ['shellConfig', 'mobileFooter'],
})
```

(`minimal` already has no header/footer to toggle; `overlay` is a dialog, not a
page with its own header/footer — both combinations would be meaningless, so
reject rather than silently ignore.)

Per-plugin, not per-route: one static value per manifest, matching the existing
`shellConfig` granularity and this RFC's scope decision (a plugin that needs
per-screen variation is a `minimal`-shell candidate instead).

### Registry helper

Add `getMobileChromeConfig()` to `runtime/src/registry.ts`, mirroring
`getOfflineRoutePrefixes()`'s shape — return only the plugins that deviate from
the default (at least one of `mobileHeader`/`mobileFooter` is `false`), keyed by
`routePrefix`:

```ts
export interface MobileChromeOverride {
  routePrefix: string;
  mobileHeader: boolean;
  mobileFooter: boolean;
}

export function getMobileChromeConfig(
  plugins: SovereignManifest[] = registry,
): MobileChromeOverride[] {
  return plugins
    .filter((m) => m.shellConfig?.mobileHeader === false || m.shellConfig?.mobileFooter === false)
    .map((m) => ({
      routePrefix: m.routePrefix,
      mobileHeader: m.shellConfig?.mobileHeader ?? true,
      mobileFooter: m.shellConfig?.mobileFooter ?? true,
    }));
}
```

### Middleware

**As implemented,** this doesn't call `getMobileChromeConfig()` in the
middleware at all — `runtime/middleware.ts` already resolves `currentPlugin`
via `underPrefix` for `x-sovereign-plugin-id` injection, so the mobile-chrome
headers just read `currentPlugin?.shellConfig` directly, avoiding a second
O(n) prefix scan per request:

```ts
if (currentPlugin?.shellConfig?.mobileHeader === false) {
  headers.set('x-sovereign-mobile-header', '0');
}
if (currentPlugin?.shellConfig?.mobileFooter === false) {
  headers.set('x-sovereign-mobile-footer', '0');
}
```

`getMobileChromeConfig()` is still used — just not here; it feeds
`ClientShell`'s client-side prefix list (see below), which has no per-request
`currentPlugin` to reuse.

Absent header = shown (current behavior); `'0'` = hidden. Symmetric with the
offline flag's "absent = false" convention, just inverted since the toggle's
default is `true`.

### `(platform)/layout.tsx`

Read the two headers next to `isOfflineRoute` (`layout.tsx:46`) and skip
rendering the corresponding element **server-side** (not CSS-`display: none` —
the DOM node shouldn't exist, both to avoid a flash of chrome-then-removal and
to avoid `SidebarPluginIcons`/`MobileNav`-style hydration work for content that
will never show):

```ts
const showMobileHeader = h.get('x-sovereign-mobile-header') !== '0';
const showMobileFooter = h.get('x-sovereign-mobile-footer') !== '0';
```

Wrap the `<header data-mobile-header>` block (`:203-234`) and the `<MobileNav>`
call (`:236-239`) each in their respective flag. The `<aside className={styles.sidebar}>`
block (`:172-199`) is untouched — this feature has no desktop-facing surface at
all.

### `ClientShell` — generalize the refresh-on-navigation fix

Extend the same diffing `ClientShell.tsx:96-104` already does for
`offlineRoutePrefixes` to also cover a mobile-chrome signature change. Pass
`getMobileChromeConfig()`'s result down as a prop (same as `offlineRoutePrefixes`
is today) and compare the resolved `(mobileHeader, mobileFooter)` pair for the
previous vs. current pathname; refresh if either flips:

```ts
const chromeFor = (p: string) => {
  const override = mobileChromeConfig.find((c) => underPrefix(p, c.routePrefix));
  return `${override?.mobileHeader ?? true}:${override?.mobileFooter ?? true}`;
};
if (
  isOffline(previousPathname) !== isOffline(pathname) ||
  chromeFor(previousPathname) !== chromeFor(pathname)
) {
  router.refresh();
}
```

Without this, a live tab that soft-navigates from a normal `default` plugin into
one with `mobileFooter: false` would keep showing the old (previous plugin's)
footer state — the exact class of bug RFC 0074 hit and fixed for offline routes,
reintroduced on a new axis if not folded into the same guard.

### Docs

- `docs/plugin-development.md` — extend the `shellConfig` manifest-field-table
  row and the `### shell: default` prose with the two new fields, their default,
  and the "desktop sidebar unaffected" guarantee.
- `docs/architecture-rules.md` — a short addition alongside the existing
  shell-composition rules, cross-referencing this RFC, noting the
  `ClientShell` diffing generalization as a load-bearing detail (so a future
  editor doesn't strip it back down to offline-only).

## UI flows

**Plugin hides its mobile footer only** (e.g. a media viewer wants full-bleed
scroll space but keeps the header for a back/title affordance) — user opens the
plugin from the mobile Drawer or a deep link → `(platform)/layout.tsx` renders
sidebar (desktop-only, irrelevant here) + mobile header, omits `<MobileNav>` →
user has no footer nav while inside this plugin; navigating to any other
`default` plugin (footer shown) re-renders the footer via the `ClientShell`
refresh guard above.

**Plugin hides both** — same as `minimal`'s navigation contract (RFC 0014): the
plugin is responsible for providing its own way back (e.g. a header/in-page
"Home" affordance), since the platform doesn't inject one. Unlike `minimal`,
the plugin still appears in the desktop sidebar and mobile Drawer as a normal
`default` plugin, and desktop users are entirely unaffected.

**Hard load / deep link** — identical to any other `default`-shell route:
middleware session-gates first, then the same header-injection logic applies on
the very first request (no client-side-only special case).

## Alternatives considered

1. **New `shell` enum values** (`default-no-footer`, `default-no-header`,
   `default-no-chrome`), composed via route-group combinatorics the way
   `minimal` is. Rejected — this is 4 combinations of what is fundamentally a
   _styling_ toggle, not a structural page-tree difference. Worse, the
   **identical desktop sidebar markup** would need to be duplicated across up
   to 4 route-group-specific layouts, guaranteeing drift over time — exactly
   what RFC 0001's "one shell layout" model was chosen to avoid.
2. **Client-only CSS/JS toggle**, set by the plugin's own page component (e.g.
   a `data-*` attribute on `<body>` read in an `effect`). Rejected — takes
   effect only after hydration (a visible flash of chrome, then removal),
   conflicts with the codebase's standing rule against browser-global-derived
   render state (CLAUDE.md: never read browser globals in a client render
   path that can cause a mismatch), and replaces one declarative manifest
   source of truth with an imperative one every plugin author has to get
   right themselves.
3. **Runtime SDK call** (`sdk.shell.setMobileChrome(...)`) instead of a
   manifest field. Rejected given the per-plugin (not per-route/per-interaction)
   scope already decided — a declarative field matches `shellConfig.overlaySize`'s
   precedent, needs no new SDK surface or `provideHost()` implementation, and
   stays statically readable by the generate script/registry the way `shell`
   and `offline` already are.
4. **Rejecting `RFC 0014`'s "conditional chrome in one layout" precedent
   outright and forcing this through route-group composition too.** Considered
   seriously since 0014 explicitly rejected per-request branching for the
   `default`/`minimal` split. The cases differ in kind, though: `minimal`
   removes _all_ chrome including the sidebar, so it's a genuinely different
   page tree and belongs in a sibling route group. This feature keeps the
   sidebar identical in every case and only varies two _mobile-only_ elements
   — there's no clean route-group split that doesn't duplicate the sidebar
   markup (see alternative 1). Per-request branching, scoped narrowly to two
   booleans and reusing the offline-route mechanism's existing precedent for
   "read a header, branch," is the smaller deviation.
5. **Single enum instead of two booleans**
   (`mobileChrome: 'both' | 'header-only' | 'footer-only' | 'none'`). Considered
   — marginally more compact, but two independent optional booleans read more
   directly at call sites, default cleanly to "unset = current behavior," and
   avoid inventing a fourth small vocabulary alongside `shell`, `overlaySize`,
   and `offline.routes[]`.

## Open questions

1. **Chrome plugins** (`CHROME_PLUGIN_IDS` — launcher/console/account,
   `runtime/src/launcher-plugins.ts`) — should they be allowed to set these
   fields at all, given they largely _are_ the mobile chrome (e.g. account's
   avatar menu lives in the mobile header)? **Resolved by implementation:**
   no restriction was added — nothing in the manifest schema, middleware, or
   layout special-cases chrome plugins, so they can set these fields like any
   other `default`-shell plugin. Revisit if a chrome plugin actually tries it
   and something looks wrong in practice.
2. **`syncViewport()`'s `[data-mobile-header]` fallback**
   (`ClientShell.tsx:34-50`) — when a plugin hides its mobile header, this
   selector finds nothing and `--sv-dialog-inset-top` needs a defined value
   rather than silently staying stale. **Resolved:** the height variables
   (`--sv-shell-header-height`/`--sv-shell-footer-height`) collapse to `0px`
   via `.shell[data-mobile-header-hidden]`/`[data-mobile-footer-hidden]`
   attribute-selector overrides in `shell.module.css`, which every downstream
   consumer inherits through the CSS cascade. Separately, `ClientShell`'s
   navigation-diff effect directly sets/clears `--sv-dialog-inset-top` as an
   inline style on a header-visibility transition, since `syncViewport()`'s
   DOM measurement only runs on mount and specific resize/visibility events —
   never on a plain pathname change — and so can't be relied on to correct a
   stale inline value across a soft navigation.
3. **Root-plugin eligibility** — a `default`-shell plugin with both flags
   `false` is, on mobile, navigation-equivalent to a `minimal` root (same
   "plugin must provide its own way back" caveat, RFC 0014). **Resolved by
   implementation:** no `root-plugin.ts` change was made and no Console
   warning was added — this matches the "plugin's responsibility, documented
   only" decision made for the both-hidden case generally, kept consistent
   for the root-plugin case rather than treated as a special exception.
4. **Requirement IDs.** No PLT-/CON- SRS entries proposed yet — still
   deferred; this RFC shipped without a roadmap slot (unplanned/urgent work),
   so no SRS pass has happened.

## Adoption path

Shipped directly on `feat/mobile-chrome-toggle` rather than through the
scheduled roadmap queue (unplanned/urgent work, no epic task ID). All of the
following landed together on that branch:

1. Manifest schema — `shellConfig.mobileHeader`/`mobileFooter` plus the two
   `.refine()`s scoping them to `shell: 'default'` (accepting both an
   explicit `"default"` and an omitted `shell`, since omission is the common
   case for default-shell plugins — a deliberate widening from the
   `overlaySize` precedent's stricter literal match).
2. `getMobileChromeConfig()` in `runtime/src/registry.ts`; the middleware
   reuses its own already-resolved `currentPlugin` instead of calling it
   directly (see Middleware, above) — `getMobileChromeConfig()` still feeds
   `ClientShell`'s client-side prefix list.
3. `(platform)/layout.tsx` conditional rendering, plus the CSS load-bearing
   fixes this surfaced and that aren't optional: explicit `grid-row` on
   `.mobileHeader`/`.content`/`MobileNav`'s `.footer` (implicit DOM-order
   placement would otherwise stretch the footer over the content row when a
   sibling is omitted), and the `data-mobile-*-hidden` attribute-selector
   overrides collapsing the header/footer height variables.
4. The `ClientShell` refresh-diff generalization and `--sv-dialog-inset-top`
   handling (Open question 2). The pure resolution logic
   (`mobileHeaderVisible`/`mobileFooterVisible`) lives in
   `runtime/src/mobile-chrome.ts`, not inlined in the client component —
   `runtime/app/(platform)/_components/` isn't covered by any Vitest
   `include` pattern (only `runtime/src/**` is, deliberately, to avoid
   double-running composed plugin copies), so logic that needs direct unit
   coverage has to live in `runtime/src/` regardless of which component
   consumes it.
5. Docs (`plugin-development.md`, `architecture-rules.md`) and version bumps
   (`package.json` root, `packages/manifest`, `runtime` — all minor, `feat/`
   convention; `packages/manifest` is private/unpublished so NFR-04 doesn't
   apply).
6. Verified live in a browser (mobile + desktop viewports, both navigation
   directions) against a temporarily-modified example plugin before the
   manifest test file was reverted — see `git log`/PR description for the
   verification note rather than repeating it here.

Test coverage delivered: manifest validation (both `.refine()`s, both
directions, plus the omitted-`shell` case), a registry unit test for
`getMobileChromeConfig()`, a middleware test for header injection (including
a nested-route case), and a `runtime/src/__tests__/mobile-chrome.test.ts` unit
test for the shared resolution helpers `ClientShell` depends on.

## Changelog

| Version | Date     | Change                                                                                                                                                               |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jul 2026 | Initial draft — per-plugin `shellConfig.mobileHeader`/`mobileFooter` toggle; documentation-first.                                                                    |
| 0.2     | Jul 2026 | Implemented on `feat/mobile-chrome-toggle`, unplanned/urgent, no roadmap slot. All three open questions resolved by implementation choice; see Open questions above. |
