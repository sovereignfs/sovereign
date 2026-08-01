# RFC 0081 — Per-plugin installable PWA

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `runtime/app/api/manifest/` (new `[pluginId]` dynamic segment
extending the existing dynamic-manifest route), `runtime/app/(platform)/layout.tsx`
(per-plugin `generateMetadata`), `runtime/middleware.ts` (per-plugin login
rewrite), `packages/manifest` (new optional `installable` field), `scripts/`
(plugin PWA icon generation), `docs/plugin-development.md`,
`docs/architecture-rules.md`. Builds on RFC 0013 (mobile responsiveness & PWA),
RFC 0027 Phase 3 (dynamic PWA manifest — epic task 9.10), RFC 0074/0078
(offline-capable plugins), RFC 0075 (mobile chrome toggle). Prerequisite-adjacent
to RFC 0082 (focused plugin app shell); ships independently of it. Builds on
research [0006](../research/0006-standalone-plugin-apps.md).\
**Incorporated into plan:** Yes — epic tasks 2.25–2.26.

---

## Summary

Let an individual plugin be installed as its **own** home-screen app. A plugin
opting in with `installable: true` gets a dedicated web app manifest served
from `/api/manifest/<pluginId>`, scoped to its `routePrefix`, carrying its own
name and icons. The user installs "Tally" from their browser and gets a
chrome-less, offline-capable app with its own springboard icon — no app store,
no native shell, no new repository.

This is the cheapest rung of the standalone-plugin-app ladder in research 0005,
and it is deliberately shipped first: if a focused, offline, home-screen plugin
app does not feel like an app, no amount of Capacitor work fixes that. It is
also fully additive and reversible.

## Motivation

Sovereign already installs as a PWA, but only as _Sovereign_ — one manifest,
one icon, `scope: "/"`, `start_url: "/"`. A user who mainly uses one app on
their instance still installs the whole workspace and navigates into it every
time.

Meanwhile the platform has quietly acquired every ingredient a per-plugin app
needs: offline document caching for a declared plugin route (RFC 0074/0078),
client-hydrated data via `sdk.offline`, chrome-less layout via `shell:
"minimal"` or `shellConfig.mobileHeader/mobileFooter` (RFC 0075), and a dynamic
white-labeled manifest route. What is missing is the small amount of plumbing
that points a manifest at one plugin instead of the whole instance.

## Current state (what this builds on)

- **A dynamic PWA manifest route already exists** —
  `runtime/app/api/manifest/route.ts` serves the manifest with the tenant's
  brand name from `getInstanceConfig()`, falling back gracefully on DB failure.
  Its own doc comment notes it is "the authoritative one for browsers" while
  `runtime/public/manifest.json` is kept for `@ducanh2912/next-pwa`
  build-time tooling. `runtime/app/layout.tsx:29` points Next metadata at it
  (`manifest: '/api/manifest'`).

  > **Roadmap accuracy note:** epic task 9.10 ("White-labeling, Phase 3 —
  > Dynamic PWA manifest + favicon route", `docs/epics/design-system.md:353`)
  > is still marked 📋 even though the dynamic manifest half of it is clearly
  > implemented. Worth reconciling separately; this RFC assumes the route as it
  > exists today.

- **`manifest` is already a reserved, session-exempt API segment.** It is in
  `RESERVED_API_SEGMENTS` (`runtime/src/api-namespace.ts`) and explicitly
  excluded from the middleware matcher (`runtime/middleware.ts:519`) with the
  comment "browsers fetch it before login for PWA install". **This is why
  per-plugin manifests belong under `/api/manifest/` and not at
  `/<routePrefix>/manifest.webmanifest`** — the latter sits inside the
  session-gated namespace, so a logged-out visitor would be redirected to
  `/login` instead of receiving a manifest, and no install prompt would ever
  appear.
- **Build-time image generation is established.**
  `runtime/app/layout.tsx:35` references `scripts/generate-splash.ts`, which
  generates iOS startup images to avoid "a blank white flash on standalone
  launch". Plugin icon rasterization follows the same pattern rather than
  inventing one.
- **Offline is already per-plugin.** `runtime/src/registry.ts:37` resolves
  `offline === true` into the plugin's bare `routePrefix`; the `offline-shells`
  Workbox cache serves that document; `runtime/middleware.ts:474` flags it;
  `runtime/app/(platform)/layout.tsx:50` renders the user-neutral shell and
  re-hydrates personalized chrome client-side.
- **Plugin icons are a single SVG.** Manifests declare `icon` (e.g.
  `sovereign-tally.local/manifest.json` → `icon.svg`). PWA install requires
  raster PNGs at 192 and 512 plus a maskable variant, so a plugin's current
  icon field is insufficient on its own.
- **The login gate redirects out of scope.** An unauthenticated request 303s to
  `/login` (`runtime/middleware.ts:328`). `runtime/middleware.ts:320` already
  handles the analogous problem for `/`, and its comment explains why:
  iOS resolves an installed app's launch/splash image from the _direct_
  response to `start_url` and does not follow a redirect, so a cold launch with
  no session shows a blank white screen. It **rewrites** instead.
- **There is exactly one service worker**, registered at `/` by
  `@ducanh2912/next-pwa`.

## Proposed design

### 1. Manifest opt-in: `installable`

```jsonc
{
  "installable": true,
}
```

A new optional boolean in `packages/manifest/src/schema.ts`. Absent/`false`
means today's behavior — the plugin is reachable inside the Sovereign PWA and
has no manifest of its own. Purely additive; `@sovereignfs/manifest` takes a
**minor** bump.

**Deliberately separate from `offline`.** They answer different questions: a
plugin can be installable without offline support (it just needs a network),
and offline-capable without being separately installable (Launcher, today).
Deriving one from the other would couple two independent product decisions.
The docs should recommend pairing them, because an installed app that fails
on a cold launch with no signal is a poor app — but that is guidance, not a
schema constraint.

`installable: true` additionally requires a raster icon set (§3), enforced at
manifest-validation time so the failure is a build error rather than a broken
install prompt.

### 2. Per-plugin manifest route

Extend the existing route into `runtime/app/api/manifest/[pluginId]/route.ts`,
reusing its instance-config lookup and graceful-degradation behavior:

```jsonc
{
  "name": "Tally",
  "short_name": "Tally",
  "description": "Shared expense tracking and debt settlement.",
  "start_url": "/tally",
  "scope": "/tally",
  "id": "/tally",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "icons": [/* from the plugin's generated raster set */],
  "theme_color": "…",
  "background_color": "…",
}
```

- `name`/`description` come from the plugin manifest; the instance name is
  **not** prepended — the user is installing Tally, not "MyInstance Tally".
- `start_url`, `scope`, and `id` are all the plugin's `routePrefix`. An explicit
  `id` keeps the installed identity stable if `start_url` ever gains a query
  parameter.
- `theme_color`/`background_color` inherit the instance's values, so a
  white-labeled instance's apps match it.
- Unknown plugin id, plugin not installed, plugin disabled, or
  `installable !== true` → **404**. A manifest for a plugin the user cannot use
  would offer an install that leads nowhere.

The route stays session-exempt by living under the already-excluded `manifest`
segment. It leaks only what the plugin manifest already publishes (name,
description, icon) — no per-user data, so the exemption is safe. This must be
stated in the route's doc comment, since "session-exempt" deserves a written
justification wherever it appears.

### 3. Icon generation

`installable: true` requires PNG icons at 192×192 and 512×512 plus a maskable
512×512. Two supported paths:

1. **Generated** (default) — a build step rasterizes the plugin's existing
   `icon.svg` into the required set, following `scripts/generate-splash.ts`'s
   pattern. Output is gitignored generated content, like `runtime/generated/`.
2. **Author-supplied** — a plugin may ship its own raster set and declare it,
   for cases where a naive rasterization of a monochrome glyph makes a poor
   springboard icon (which is most of them, honestly — a maskable icon needs
   safe-area padding and usually a background plate that an SVG glyph does not
   have).

The implementation task must decide whether generated icons get an automatic
background plate for the maskable variant. Recommended: yes, using the
instance's `background_color`, since a transparent maskable icon renders as a
floating glyph on a platform-chosen background and looks broken on Android.

### 4. Pointing the document at the right manifest

`runtime/app/layout.tsx:29` sets `manifest: '/api/manifest'` globally. Add a
`generateMetadata` to `runtime/app/(platform)/layout.tsx` that reads the
already-injected `x-sovereign-plugin-id` header, looks the plugin up in the
registry, and overrides `manifest` with `/api/manifest/<pluginId>` when that
plugin is `installable`. Next composes nested metadata, so the plugin value
wins for plugin routes and the instance manifest remains the default
everywhere else.

**iOS needs more than the manifest.** Apple resolves the home-screen icon from
`apple-touch-icon` link tags and the launch image from
`apple-touch-startup-image` — document head tags, not manifest entries (which
is why `scripts/generate-splash.ts` exists at all). Per-plugin installs
therefore need per-plugin values for these tags in the same `generateMetadata`,
or an installed plugin app will wear the Sovereign icon and flash white on
launch. This is the single easiest part of this RFC to overlook and the most
visible when missed.

### 5. Login containment — the concrete bug this must not ship with

With `scope: "/tally"`, an installed app that navigates to `/login` leaves
scope. Depending on platform that either opens a browser tab or shows an
out-of-scope banner — in both cases login inside the installed app is broken,
and on iOS a cold launch with no session shows a blank white screen for the
reasons `runtime/middleware.ts:320` already documents for `/`.

**Resolution:** generalize the existing `/` special case. When an
unauthenticated GET targets an `installable` plugin's bare `routePrefix`,
**rewrite** to the login document instead of redirecting, so the response is a
real 200 with a full `<head>` at the in-scope URL. The existing rule that this
must be a rewrite and not a 303 applies unchanged, as does the rule that any
redirect to login must target `SOVEREIGN_AUTH_PUBLIC_URL` rather than the
internal URL.

Post-login navigation must return to the plugin's route, not `/`, or the
installed app lands outside its own scope immediately after sign-in.

### 6. Service worker — explicitly unchanged

**No second service worker, and no scope change to the existing one.** Manifest
`scope` governs the _installed app's navigation containment_; service-worker
registration is independent and per-path. The root SW continues to serve
`/tally/*`, so an installed plugin app inherits the existing offline behavior
with no new registration, no overlapping caches, and no new opportunity to
replay a cached document to the wrong user.

The hard rule that `pages`/`pages-rsc`/`pages-rsc-prefetch` stay `NetworkFirst`
(never stale-serving, because pages are per-user SSR) therefore applies
unchanged. This RFC introduces no surface-varying SSR, so RFC 0080 §5's
cache-keying question does not arise here.

### Docker / config impact

One new generated-asset directory for plugin PWA icons, which must be included
in the runtime image and served as static assets. If icon generation runs at
build time, it joins the `generate` step; the `.dockerignore` and any
served-asset path list need checking. Flagged per the repo's
Docker-impact rule; no new env var, port, or native dependency.

## UI flows

**Install:**

```
browser → user opens /tally → document links /api/manifest/fs.sovereign.tally
        → browser offers "Install Tally"
        → springboard icon: Tally's own, standalone display
```

**Cold launch, signed in, offline:**

```
tap icon → start_url /tally → SW offline-shells serves cached document
         → client hydrates from sdk.offline → cached data renders
         → OfflineBanner shows "No internet connection"
```

**Cold launch, no session:**

```
tap icon → /tally → middleware rewrites to the login document (200, in scope)
         → user signs in → returns to /tally, still in scope
```

**Plugin not installable:**

```
GET /api/manifest/<id> for a non-installable/disabled plugin → 404
```

## Alternatives considered

- **`/<routePrefix>/manifest.webmanifest`.** Rejected — inside the
  session-gated namespace, so a logged-out browser gets redirected to `/login`
  instead of a manifest and never offers an install. Would require a new
  matcher exclusion per plugin prefix, when `/api/manifest/` is already exempt
  for exactly this reason.
- **Deriving installability from `offline: true`.** Rejected — independent
  concerns; Launcher is offline-capable and should not become separately
  installable.
- **One manifest per plugin, always served.** Rejected — installability implies
  the plugin renders sensibly standalone and has a real icon set; it needs to be
  a deliberate author decision, not a default.
- **A second service worker scoped to the plugin.** Rejected — unnecessary
  (manifest scope is not SW scope) and actively harmful: two SWs on one origin
  with overlapping caches, both eligible to handle `/tally/*` navigations.
- **Prepending the instance name to the app name.** Rejected — the user is
  installing Tally. The instance is the backend, not the brand of the app.
- **Redirecting rather than rewriting for the unauthenticated case.** Rejected
  for the reason already recorded at `runtime/middleware.ts:320`.

## Open questions

1. Does the maskable icon get an automatic background plate from the instance's
   `background_color`? Recommended yes; needs a visual check on Android.
2. Should `installable` imply anything about `shell`? An installed app arguably
   wants `shellConfig.mobileHeader: false` by default, but overriding a
   plugin's declared chrome from a different field is surprising. Leaning
   toward documenting the pairing and changing nothing.
3. Do PWA shortcuts (`shortcuts[]`, as the instance manifest uses for Launcher
   and Account) make sense per plugin, and if so where does a plugin declare
   them?
4. Where post-login return-to-plugin state lives so it survives the auth
   round-trip without a query parameter that would perturb `start_url` matching.

## Adoption path

1. **Epic task 2.25** — `installable` manifest field, `/api/manifest/[pluginId]`
   route, per-plugin `generateMetadata` including the Apple tags, the
   unauthenticated login rewrite, docs. `@sovereignfs/manifest` minor bump.
2. **Epic task 2.26** — plugin PWA icon generation, validation that
   `installable: true` has a usable icon set, Docker asset-path wiring.
3. First adopters: two plugins, per research 0005's de-risking
   recommendation — one platform plugin and one real app (Tally) — before any
   of this is generalized further or RFC 0082 begins.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
