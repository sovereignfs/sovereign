# RFC 0072 — Offline-capable plugin routes

**Status:** Partially implemented — platform plumbing (manifest field, SDK
surface, SW precaching, logout purge) is in place; no plugin has adopted it yet\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (new `offline` manifest field), `packages/sdk`
(new client-side `sdk.offline.*` surface), `runtime` (route composition, service
worker generation in `next.config.ts` / `scripts/`, logout purge), Console
(offline-plugin surfacing), `docs/plugin-development.md`; builds on RFC 0013
(mobile responsiveness & PWA), RFC 0042 (public plugin routes — manifest
route-list precedent), and the per-user SSR caching rule in CLAUDE.md\
**Incorporated into plan:** No roadmap slot or epic task ID assigned. Platform
plumbing shipped directly on `feat/offline-capable-plugins` (manifest field, SDK
surface, SW precaching, logout purge — §§1–4 of Proposed design, all landed).
No installed plugin declares `offline` yet, so this is a no-op in production
until a plugin opts in; adopting a route (e.g. Wallet's Cards) is separate,
plugin-repo work. Offline **writes** (outbox + sync) remain explicitly out of
scope, left to a future RFC.

---

## Summary

Let a plugin declare, in its `manifest.json`, a small set of **mission-critical
routes that must keep working with no network**. When the device is offline, the
app opens, those declared routes render from cache, and any other path shows the
existing "no internet connection" fallback. Everything is **opt-in per plugin and
per route** — nothing is cached offline unless a plugin asks for it.

The v1 scope is **read-only**: a user can open the app and _view_ cached data on
an offline-enabled route (e.g. Wallet → Cards, Tasks → today's list, Shopper →
the current list). Creating or editing while offline (queued writes, background
sync, conflict resolution) is deliberately deferred to a later RFC.

The design threads a needle that the current architecture makes narrow: Sovereign
pages are **per-user SSR** and must never be stale-served from cache (a hard rule
in CLAUDE.md — a replayed authenticated shell could show a previous user's content
after logout/login on a shared device). Offline-enabled routes therefore render a
**user-neutral shell** and hydrate their data **client-side from IndexedDB**, so
nothing per-user is ever cached as HTML.

## Motivation

Users expect an installed app to open and do _something_ useful without a
connection — glance at a boarding-pass-style card, check a shopping list in a shop
with no signal, tick off a task on the subway. Today Sovereign is installable
(RFC 0013) but is entirely online-dependent past the static `/offline` fallback:
every page is per-user SSR fetched `NetworkFirst`, and plugin data is only
reachable through server-side code. Offline, the app can show a connectivity
banner and a fallback page — and nothing else.

Caching _everything_ is the wrong answer: it bloats storage, risks staleness
across the whole app, and — most importantly — collides head-on with the per-user
SSR rule. The right answer is a **narrow, declared allowlist**: a plugin nominates
the few paths that matter offline and takes on the constraints that come with it.
This keeps offline exposure explicit and reviewable, exactly as RFC 0042 did for
public routes.

## Current state (what this builds on)

- **PWA + Workbox service worker.** `runtime/next.config.ts:52` wires
  `@ducanh2912/next-pwa`; the SW is generated into `public/` at build time and
  disabled in dev.
- **The `pages` cache is `NetworkFirst`, deliberately.**
  `runtime/next.config.ts:69-84` caches same-origin non-`/api/` GETs with a 4s
  `networkTimeoutSeconds`, falling back to `/offline`. The comment there and the
  hard rule in `CLAUDE.md` both state why it is **not** stale-while-revalidate:
  Sovereign pages are per-user SSR, and replaying a cached authenticated shell
  risks showing a stale/different user's content after logout/login. **Any
  offline design must preserve this rule.**
- **Offline fallback route.** `runtime/app/offline/page.tsx` is a self-contained,
  auth-free "You're offline" shell that next-pwa precaches and serves for failed
  navigations (`fallbacks.document: '/offline'`).
- **Connectivity banner.** `runtime/app/(platform)/_components/OfflineBanner.tsx`
  already surfaces soft-offline/reconnect state, wired into both platform and
  minimal layouts.
- **Plugin data is server-side only.** `sdk.db.getClient()`
  (`packages/sdk/src/db.ts:25`) and `sdk.storage` (`packages/sdk/src/storage.ts:7`)
  both read `next/headers` and only run in a server request context. Plugin pages
  are SSR server components that query the DB during render. **There is no
  client-side read path for plugin data today** — so caching a plugin's HTML alone
  would render an empty page offline; the data must also be on the device.
- **Manifest route-list precedent.** `publicRoutes`
  (`packages/manifest/src/schema.ts:156-186`) already validates a per-plugin array
  of route prefixes relative to `routePrefix`, with strict rules (must start with
  `/`, must not be `/`, no `..`, no route-group/interception markers, unique). The
  `offline` field mirrors this shape and validation.
- **Client IndexedDB precedent.** The e2ee SDK already uses IndexedDB from the
  client (`packages/sdk/src/e2ee-device.ts`), exposed via a dedicated
  `@sovereignfs/sdk/e2ee-device` subpath (not the main barrel) because the
  barrel also reaches server-only modules — `sdk.offline` follows the same
  subpath pattern.
- **The parity test.** `runtime/src/docs-parity.test.ts` requires every new
  manifest field and SDK key to appear in its doc; a new `offline` field and
  `sdk.offline.*` surface must be documented in `docs/plugin-development.md` in
  the same change.

## Proposed design

Four parts: a manifest opt-in, an app-shell rendering rule, a client-side data
surface, and scoped service-worker precaching — plus a logout purge that keeps the
whole thing safe on shared devices.

### 1. Manifest field — `offline`

Add an optional `offline` object to `manifest.json`, mirroring `publicRoutes`:

```jsonc
{
  "offline": {
    "routes": [
      {
        // Relative to this plugin's routePrefix. Same validation as publicRoutes:
        // must start with "/", must not be "/", no "..", no "(" / ")" markers,
        // unique within the plugin.
        "prefix": "/cards",
        "description": "View saved cards without a connection.",
      },
    ],
  },
}
```

Rules:

- `offline.routes[].prefix` is relative to the plugin `routePrefix`; resolves to
  `<routePrefix><prefix>/*` (e.g. `/wallet/cards/*`).
- Same prefix-safety validation as `publicRoutes` (reuse the refinement).
- Offline routes are **never inherited** by child plugins or API routes.
- Declaring `offline` requires **no new permission** — it grants no additional
  server capability; it only changes caching/rendering behavior for the plugin's
  own routes. (Open question 1 revisits whether an explicit `offline` permission
  is worth it for reviewability.)
- Absent field ⇒ the plugin is fully online-only (today's behavior). No plugin is
  affected until it opts in.

### 2. Rendering rule — offline routes are a **user-neutral shell**

This is the load-bearing constraint that keeps the per-user-SSR rule intact.

An offline-declared route **must not** emit per-user content in its server-rendered
HTML. Its SSR output is a **user-neutral app shell** (layout, static chrome, empty
states, skeletons); the actual user data is fetched **client-side** and rendered
after hydration. Because the cached HTML contains nothing user-specific, precaching
and replaying it offline cannot leak one user's data to another — the shell is the
same for everybody, and the data comes from a per-user client store that logout
clears (§5).

Concretely, an offline route is a `'use client'`-driven page (or a server shell
whose data region is a client component) that:

1. On load, reads from the client offline store (§3) and renders immediately
   (works with no network).
2. If online, fetches fresh data from the plugin's read API, renders it, and
   **writes it back** into the offline store for next time.
3. If offline and the store is empty (never visited online), shows a plugin-owned
   "not available offline yet" empty state — not a blank page.

The runtime enforces the shell rule at build/validation time as far as it can
(see Security requirements); the rest is plugin responsibility, documented in
`docs/plugin-development.md`, exactly as `publicRoutes` makes token validation the
plugin's job.

### 3. Client data surface — `sdk.offline.*`

Add a **client-side** SDK surface (`packages/sdk/src/offline.ts`) backed by
IndexedDB, exposed via the dedicated `@sovereignfs/sdk/offline` subpath — not
the main barrel, for the same reason as the existing `e2ee-*` modules: the
barrel also reaches server-only code (e.g. `activity.ts`'s `next/headers`
import), and Next's client/server boundary check flags the whole reachable
module graph, so a `'use client'` component importing from the barrel would
fail to build.

```ts
// Client component on an offline-enabled route.
import { offline } from '@sovereignfs/sdk/offline';

const PLUGIN_ID = 'fs.sovereign.wallet'; // your own manifest id, known statically

// Read cached data (works with no network).
const cards = await offline.get<Card[]>(PLUGIN_ID, 'cards');

// After a successful online fetch, mirror it for offline use.
await offline.set(PLUGIN_ID, 'cards', cards);
```

Shape (v1, read/write to the _local_ store only — no server sync):

- `offline.get<T>(pluginId, key): Promise<T | null>` — read this plugin's cached value.
- `offline.set<T>(pluginId, key, value): Promise<void>` — write/replace it.
- `offline.remove(pluginId, key): Promise<void>` / `offline.keys(pluginId): Promise<string[]>`.
- `offline.clear(pluginId): Promise<void>` — wipe one plugin's cache.
- `offline.clearAll(): Promise<void>` — wipe every plugin's cache (used by the
  runtime's logout purge, §5).

**Isolation is scoped by plugin id only — deliberately not by user id**, which
revises this RFC's original design (see Changelog 0.2). The original draft
called for `(pluginId, userId)` keying via a client-readable session hint
(Open question 2, below). Implementation surfaced a sharper argument against
it: an offline route's own SSR output must never carry per-user data in the
first place (§2) — that's what makes it safe to precache and replay on a
shared device. But that means there is no safe place left to _read_ a
client-side user id from either: embedding it anywhere in the offline route's
own document reintroduces exactly the leak §2 exists to prevent, and any
mechanism that fetches it out-of-band (a session-hint endpoint, a global
inline script on the shared layout) adds real complexity for a signal this
design doesn't actually need. Plugin-only scoping plus an unconditional wipe
on every logout/user-switch (§5) achieves the identical safety property —
nothing cached ever survives past the session that wrote it — without
inventing a new way to move user identity into client JS. Open question 2 is
resolved by this: no `sdk.session` client getter, no session-hint plumbing.

This is a **published-package (`@sovereignfs/sdk`) addition ⇒ minor bump**, and per
NFR-04 it must be additive (it is). It must be documented in
`docs/plugin-development.md` for the parity test.

Rationale for putting **data in IndexedDB rather than SW-caching API responses:**
SW response caches are origin-global and would re-introduce the exact per-user
leak the `pages` rule guards against. A client-owned IndexedDB store that logout
wipes keeps user data isolation explicit and auditable. The SW therefore caches
only **user-neutral assets** (§4), never per-user API responses.

### 4. Service-worker precaching — scoped allowlist

`runtime/src/registry.ts`'s `getOfflineRoutePrefixes()` resolves every
manifest-declared offline route to its full path
(`<routePrefix><offline.routes[].prefix>`) from the generated plugin registry —
`runtime/generated/registry.ts` already serializes the entire manifest
(including `offline`) via `JSON.stringify`, so no change to the generate script
itself was needed; the registry was already the single source of truth. Fed
into `next.config.ts`'s Workbox `runtimeCaching`:

- A dedicated `offline-shells` matcher, listed **before** the general `pages`
  matcher (Workbox picks the first match), catches same-origin requests under
  any declared offline prefix and caches them `CacheFirst` — safe here, and
  only here, because these documents are declared user-neutral shells (§2):
  populated on first online visit, then served with no network indefinitely.
- **Everything else stays `NetworkFirst` → `/offline`.** The general `pages`
  matcher gained one exclusion (skip paths already claimed by the offline
  matcher) but is otherwise unchanged.
- **No per-user API GET is added to the SW runtime cache.** Data comes from
  IndexedDB (§3), not a replayed API response.
- With zero plugins currently declaring `offline`, this is a verified no-op:
  a production build was run to confirm `next.config.ts` loads correctly and
  the generated service worker includes the `offline-shells` cache entry
  (currently matching nothing).

This does **not** precache the route's HTML at build time the way static
assets are precached — dynamic SSR documents aren't statically known to
Workbox's precache manifest. In practice this means the _first_ visit to an
offline route must happen online (populating the runtime cache); every visit
after that — online or offline — is served `CacheFirst`. The RFC's "precache"
language is satisfied by this runtime-populated cache, not a build-time one;
this is a scope narrowing from the original draft, not a behavior gap (a
route can't render meaningful cached data before it's ever been fetched once
anyway — see the UI flows below).

### 5. Logout purge — the shared-device safeguard

`runtime/app/(platform)/_components/AccountMenu.tsx`'s sign-out form (the sole
UI entry point to `/api/account/logout` — confirmed by a repo-wide search) now
runs an `onSubmit` handler that awaits `offline.clearAll()` before letting the
native submission proceed (`form.submit()` runs in a `finally`, so sign-out
still completes normally if IndexedDB is unavailable or clearing errors). This
wipes every plugin's offline cache, not just the outgoing user's — the
mechanism that makes §3's plugin-only (not per-user) key scoping safe on a
shared device: nothing cached survives past the session that wrote it, so the
next login starts from an empty cache regardless of who logs in.

This mirrors the existing discipline of clearing both `session_data` cookie
variants on profile self-mutation (CLAUDE.md) — offline data gets the same
"nothing survives a session boundary" treatment. Without it, a shared device
is exactly the leak the per-user-SSR rule (and, now, plugin-only cache
scoping) was written to prevent.

### Docker / config impact

None expected: no new env var, port, on-disk path, or native dep. The SW is still
generated into `public/` at build time. (Flagging per the CLAUDE.md rule — re-check
during implementation if the compose step gains a generated artifact that needs a
Dockerfile `COPY`.)

## UI flows

**First online visit to an offline route** (e.g. Wallet → Cards):

```
online → route renders shell → client fetches cards → renders + offline.set('cards')
```

**Later, offline:**

```
offline → app opens → route shell renders from precache
        → client offline.get('cards') → renders cached cards
        → OfflineBanner shows "No internet connection"
```

**Offline, navigating to a non-offline route:**

```
offline → NetworkFirst times out → /offline "no internet connection" fallback
```

**Offline route never visited online (empty store):**

```
offline → shell renders → offline.get returns null
        → plugin's "Not available offline yet — open once online" empty state
```

## Alternatives considered

**Cache the per-user SSR HTML and partition the SW cache by user.** Rejected. It
fights the hard per-user-SSR rule directly, and correct cache partitioning +
eviction on logout across the SW is far more error-prone than an IndexedDB store
the client owns and unconditionally clears on every logout. One mistake leaks
another user's shell.

**SW-cache the plugins' read API GET responses.** Rejected for the same reason —
SW response caches are origin-global; a cached `/api/wallet/cards` response would
be replayable for the wrong user. Keeping data in a client-owned IndexedDB store
that's wiped on every logout makes isolation explicit and auditable.

**Key `sdk.offline` by `(pluginId, userId)`, resolving `userId` via a
client-readable session hint.** This was the original design (see Changelog
0.1). Rejected during implementation: there is no place to source a
client-readable `userId` that doesn't either (a) get embedded in an offline
route's own precached, replayable document — the exact leak §2 exists to
prevent — or (b) require new out-of-band plumbing (a session-hint endpoint, a
global inline script) for a signal the design turns out not to need. Plugin-
only scoping plus an unconditional `clearAll()` on every logout achieves the
same safety property with less mechanism: nothing survives past the session
that wrote it, so there's nothing to key by user identity in the first place.

**A generic platform "offline everything" toggle.** Rejected. Plugins have very
different data models and freshness needs; a blanket cache bloats storage and
maximizes staleness. Per-route opt-in keeps the surface small and reviewable
(same reasoning as RFC 0042 for public routes).

**Ship read + write (outbox/sync) in v1.** Deferred. Queued mutations need a sync
engine, conflict resolution, and background sync — a much larger surface. Read-only
delivers the headline value (open the app, see your stuff) and is independently
shippable. Writes get their own RFC building on this one.

## Open questions

1. Should opting into `offline` require an explicit `offline` **permission** in
   `permissions[]` (for install-review visibility), or is the manifest field alone
   enough? `publicRoutes` chose field-only; offline exposes cached data on-device,
   which may warrant the extra signal. **Still open** — implementation shipped
   field-only, matching `publicRoutes`; revisit if reviewers want the extra signal.
2. ~~How is the client-readable `userId` for store keying exposed without leaking
   anything sensitive?~~ **Resolved** — it isn't. `sdk.offline` scopes by plugin id
   only; safety comes from an unconditional `clearAll()` on every logout (§3, §5).
   No `sdk.session` client getter was added.
3. Should the runtime **enforce** the user-neutral-shell rule (e.g. a dev-time
   check that an offline route's SSR output carries no session headers / no
   per-user markers), or is it documentation + review only? **Still open** —
   shipped as documentation + review only (`docs/plugin-development.md`'s
   `offline` section); no automated enforcement exists yet.
4. Eviction policy and quota: per-plugin IndexedDB size caps? LRU across offline
   plugins when the browser signals storage pressure? **Still open** — not
   addressed; `offline-shells` SW cache has an `expiration` bound
   (`maxEntries: 64, maxAgeSeconds: 30 days`), but `sdk.offline`'s IndexedDB store
   has no cap of its own yet.
5. Should Console show which plugins declare offline routes and let an operator
   **disable** offline for a plugin instance-wide (parallel to plugin enable/disable)?
   **Still open** — not built (adoption path step 6, below).
6. Does the paywall gate interact with offline routes — can a cached offline route
   render after an entitlement lapses? **Still open** — not addressed; no installed
   plugin combines `monetization` and `offline` yet, so this hasn't been forced.

## Adoption path

Platform plumbing (steps 1–4) shipped directly on `feat/offline-capable-plugins`,
without a roadmap slot — the developer chose to build ahead of scheduling. Status
per step:

1. **Manifest + validation.** ✅ `offline` added to `packages/manifest` (reused
   the `publicRoutes` prefix refinement); documented in
   `docs/plugin-development.md`; parity test passes; `@sovereignfs/manifest`
   minor-bumped.
2. **Client SDK surface.** ✅ `packages/sdk/src/offline.ts`
   (`get`/`set`/`remove`/`keys`/`clear`/`clearAll`), plugin-id-scoped IndexedDB
   store (not per-user — see §3's revised design), exposed via the
   `@sovereignfs/sdk/offline` subpath; documented; `@sovereignfs/sdk`
   minor-bumped.
3. **SW generation + precache.** ✅ `runtime/src/registry.ts`'s
   `getOfflineRoutePrefixes()` feeds a dedicated `offline-shells` `CacheFirst`
   matcher in `next.config.ts`, ahead of the general `pages` matcher; verified
   with a full production build. Runtime-populated (first online visit
   populates the cache), not build-time precached — see §4's narrowed scope.
4. **Logout purge.** ✅ `AccountMenu.tsx`'s sign-out form awaits
   `offline.clearAll()` before submitting.
5. **First adopters.** ⬜ Not started. Converting a route in Wallet (Cards),
   Tasks (current list), or Shopper (current list) to the app-shell +
   `sdk.offline` pattern is separate, plugin-repo work (these are community
   plugins, cloned as gitignored `.local` directories in this workspace but
   living in their own repositories) — out of scope for this branch.
6. **Console surfacing.** ⬜ Not started (optional, per open question 5).

Offline **writes** (outbox, background sync, conflict resolution) are a separate
future RFC that builds on the `sdk.offline` store defined here.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | July 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.2     | July 2026 | Steps 1–4 implemented on `feat/offline-capable-plugins`. Revised `sdk.offline` from `(pluginId, userId)` keying to plugin-id-only keying with an unconditional `clearAll()` on logout (open question 2 resolved); narrowed SW precaching from build-time to runtime-populated `CacheFirst` (§4); added `@sovereignfs/sdk/offline` as the import subpath (matching the `e2ee-*` pattern, not the main barrel as originally sketched). |
