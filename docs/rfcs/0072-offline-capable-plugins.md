# RFC 0072 — Offline-capable plugin routes

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (new `offline` manifest field), `packages/sdk`
(new client-side `sdk.offline.*` surface), `runtime` (route composition, service
worker generation in `next.config.ts` / `scripts/`, logout purge), Console
(offline-plugin surfacing), `docs/plugin-development.md`; builds on RFC 0013
(mobile responsiveness & PWA), RFC 0042 (public plugin routes — manifest
route-list precedent), and the per-user SSR caching rule in CLAUDE.md\
**Incorporated into plan:** No — documentation-first. This RFC commits to the
_design_ of read-only offline access for opt-in plugin routes. Roadmap slot and
epic task IDs are deferred; offline **writes** (outbox + sync) are explicitly out
of scope and left to a future RFC.

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
  client (`packages/sdk/src/e2ee-device.ts`), establishing the pattern and the
  device-id/per-user keying approach an offline data store needs.
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

Add a **client-side** SDK surface (new file `packages/sdk/src/offline.ts`) backed
by IndexedDB, scoped per plugin **and per user**. Unlike `sdk.db`/`sdk.storage`
(server-only, `next/headers`-based), this runs in the browser:

```ts
// Client component on an offline-enabled route.
import { offline } from '@sovereignfs/sdk';

// Read cached data (works with no network).
const cards = await offline.get<Card[]>('cards');

// After a successful online fetch, mirror it for offline use.
await offline.set('cards', cards);
```

Shape (v1, read/write to the _local_ store only — no server sync):

- `offline.get<T>(key): Promise<T | null>` — read the current user's cached value.
- `offline.set<T>(key, value): Promise<void>` — write/replace it.
- `offline.remove(key): Promise<void>` / `offline.keys(): Promise<string[]>`.
- Namespaced internally by `(pluginId, userId)`; a plugin cannot read another
  plugin's or another user's store. `pluginId` is known at bundle/compose time;
  `userId` comes from a small client-readable session hint (non-sensitive stable
  id), consistent with how the e2ee device layer keys per-user state.

This is a **published-package (`@sovereignfs/sdk`) addition ⇒ minor bump**, and per
NFR-04 it must be additive (it is). It must be documented in
`docs/plugin-development.md` for the parity test.

Rationale for putting **data in IndexedDB rather than SW-caching API responses:**
SW response caches are origin-global and would re-introduce the exact per-user
leak the `pages` rule guards against. A client-owned, per-user-keyed IndexedDB
store that logout wipes keeps user data isolation explicit and auditable. The SW
therefore caches only **user-neutral assets** (§4), never per-user API responses.

### 4. Service-worker precaching — scoped allowlist

The compose/generate step already enumerates plugins. Extend it to emit the set of
offline-declared route prefixes and feed the SW config:

- **Precache the user-neutral shell + assets** for each offline route so the
  document and its JS/CSS load with no network. These entries are safe to
  cache-first because they contain no per-user content (§2).
- **Everything else stays `NetworkFirst` → `/offline`.** Non-offline routes are
  unchanged; offline, they hit the existing fallback ("no internet connection").
- **No per-user API GET is added to the SW runtime cache.** Data comes from
  IndexedDB (§3), not a replayed API response.
- Generation is build-time and deterministic; the offline route list becomes part
  of the generated SW manifest, so the allowlist is auditable in the build output.

### 5. Logout purge — the shared-device safeguard

On logout (and on user switch), the runtime must:

1. Clear the per-user IndexedDB offline stores for the outgoing user.
2. Leave the user-neutral shell/asset precache intact (it is not per-user).

This mirrors the existing discipline of clearing both `session_data` cookie
variants on profile self-mutation (CLAUDE.md) — offline data gets the same
"nothing per-user survives a session boundary" treatment. Without this, a shared
device is exactly the leak the per-user-SSR rule was written to prevent.

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
eviction on logout across the SW is far more error-prone than a per-user IndexedDB
store the client owns and clears. One mistake leaks another user's shell.

**SW-cache the plugins' read API GET responses.** Rejected for the same reason —
SW response caches are origin-global; a cached `/api/wallet/cards` response would
be replayable for the wrong user. Keeping data in a per-user IndexedDB store makes
isolation explicit.

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
   which may warrant the extra signal.
2. How is the client-readable `userId` for store keying exposed without leaking
   anything sensitive? Reuse the e2ee device/session-hint pattern, or add a minimal
   `sdk.session` client getter?
3. Should the runtime **enforce** the user-neutral-shell rule (e.g. a dev-time
   check that an offline route's SSR output carries no session headers / no
   per-user markers), or is it documentation + review only?
4. Eviction policy and quota: per-plugin IndexedDB size caps? LRU across offline
   plugins when the browser signals storage pressure?
5. Should Console show which plugins declare offline routes and let an operator
   **disable** offline for a plugin instance-wide (parallel to plugin enable/disable)?
6. Does the paywall gate interact with offline routes — can a cached offline route
   render after an entitlement lapses? (Default: treat like disabled — stop serving
   offline once access is revoked, purge on next online check.)

## Adoption path

Documentation-first now. When scheduled, phase as:

1. **Manifest + validation.** Add `offline` to `packages/manifest` (reuse the
   `publicRoutes` prefix refinement); update `docs/plugin-development.md`; parity
   test passes.
2. **Client SDK surface.** Add `packages/sdk/src/offline.ts` (`get`/`set`/`remove`/
   `keys`), per-`(pluginId, userId)` IndexedDB store; document it; **minor** bump of
   `@sovereignfs/sdk`.
3. **SW generation + precache.** Extend the compose/generate step to emit offline
   route prefixes; precache user-neutral shells/assets; keep everything else
   `NetworkFirst → /offline`.
4. **Logout purge.** Clear per-user offline stores on logout/user-switch.
5. **First adopters.** Convert one route each in Wallet (Cards), Tasks (current
   list), and Shopper (current list) to the app-shell + `sdk.offline` pattern as
   reference implementations. (These are community plugins; adoption is opt-in and
   lands in their own repos.)
6. **Console surfacing** (optional, per open question 5).

Offline **writes** (outbox, background sync, conflict resolution) are a separate
future RFC that builds on the `sdk.offline` store defined here.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
