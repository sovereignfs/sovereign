# RFC 0078 — Generic offline read+write for plugins

> **Superseded by [Research 0012 — Offline-first architecture](../research/0012-offline-first-architecture.md)
> and [workstream 0008](../workstreams/0008-offline-first-architecture.md).**
> The flat boolean `offline` field this RFC shipped, and the `offline:write`
> permission it added, have both been replaced — `offline` is now a two-tier
> enum (`'offline-first' | 'device-only'`), and `offline:write` is removed
> outright: both tiers imply local mutation, so the enum alone is now the
> install-review signal (epic task 3.36). `@sovereignfs/sdk/offline-queue`
> itself is superseded by a unified storage surface still in progress (epic
> task 3.37). Kept as the decision trail for the read/write isolation model
> and the "cannot be centrally enforced" permission caveat, both still
> relevant. Not deleted; see `docs/research/README.md`'s lifecycle convention.

**Status:** Implemented — platform plumbing (manifest breaking change,
`offline:write` permission validation, `@sovereignfs/sdk/offline-queue`
client module, runtime simplification, logout+login purge) is in place.
`offline:write` permission enforcement against the queue module itself is
not yet wired (see `docs/plugin-development.md`'s `permissions` section).
Shopper's own read+write adoption happens in its own repository, outside
this monorepo.\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (breaking change to the `offline` field —
removes `offline.routes[]`, flattens `offline.root` to a plain `offline`
boolean, adds a new `offline:write` permission), `packages/sdk` (new
`@sovereignfs/sdk/offline-queue` client surface), `plugins/launcher` (manifest
migration to the flattened field), `plugins/sovereign-shopper` (first adopter
of the generic model, prototyping read+write), `runtime` (simplification of
route-prefix resolution, service worker precaching, and the offline-route
neutral-shell mechanism — fewer cases, not new ones), `docs/plugin-development.md`,
`docs/upgrade.md`; amends RFC 0074 (offline-capable plugin routes) and builds
on RFC 0062's `mailer:send` permission-enforcement precedent.\
**Incorporated into plan:** No epic task ID assigned — platform plumbing
(manifest change, SDK module, runtime simplification, logout/login purge)
shipped directly ahead of any roadmap slot. Retroactively recorded in
`ROADMAP.md` at `0.50.1`.

---

## Summary

RFC 0074 shipped a **read-only** offline-plugin-routes system: a plugin
enumerates specific route prefixes in its manifest (`offline.routes[]`), each
one individually validated and neutrality-scanned, and reads cached data
client-side from `sdk.offline` (a plugin-scoped IndexedDB store). This RFC
does two things:

1. **Adds writes.** A new client-side mutation queue,
   `@sovereignfs/sdk/offline-queue`, lets a plugin enqueue writes made while
   offline, apply them optimistically to its own local view, and drain them
   against its own sync endpoint once connectivity returns — with
   last-write-wins conflict resolution and an idempotent apply contract that
   makes retries safe.
2. **Eliminates route-based declaration.** `offline.routes[]` is removed.
   Launcher's already-shipped `offline.root: true` — one bare-`routePrefix`
   entry page, entirely client-rendered past that, no per-route enumeration
   at all — becomes the _only_ offline model, flattened to a plain
   `offline: boolean`. A plugin declares itself offline-capable once; which
   screens, lists, or records it actually supports offline is the plugin's
   own client-side decision, invisible to the manifest schema and to the
   platform's route-neutrality tooling.

Both changes are deliberately **generic, plugin-agnostic capabilities** —
`sdk.offline` and `sdk.offline-queue` take a `pluginId` and plugin-chosen
key/payload strings, never anything Shopper-specific. Shopper is this RFC's
worked example and first adopter (view lists, add/edit/delete items, mark
items bought — all offline, all synced back on reconnect), not a
special-cased target.

## Motivation

RFC 0074 delivered "open the app offline, see your stuff" and explicitly,
repeatedly deferred writes to a future RFC — a shopping list you can only
_look at_ offline is close to useless; the value is crossing an item off in
a shop with no signal, or adding one you thought of on the walk there. This
RFC closes that gap.

Separately, building the read+write prototype surfaced a problem with RFC
0074's declaration model itself: enumerating Next.js route prefixes in the
manifest (`offline.routes[]`) forces a 1:1 mapping between "what's
offline-capable" and "which server-rendered pages exist," which:

- couples an offline/data-layer concern to routing structure, so every new
  offline-capable screen is also a manifest change and a new neutrality-scan
  target;
- doesn't match how the one plugin that has actually shipped offline support
  today (Launcher) works — Launcher never used `routes[]`, it used
  `offline.root: true`, a single client-rendered entry point, from the
  start; and
- doesn't generalize cleanly to writes: a mutation queue is keyed by plugin +
  operation, not by which URL rendered the button that enqueued it.

Generalizing Launcher's pattern into the only model removes an entire class
of manifest surface (route-prefix validation, per-route neutrality scanning)
and lets "what's offline-capable" be answered entirely in application code —
exactly where a plugin author already decides what their app supports.

## Current state (what this builds on)

- **RFC 0074's read-only mechanism**, still the foundation: manifest field
  `offline` (`packages/manifest/src/schema.ts:227-263` today — object shape
  `{ routes?: [{prefix, description}], root?: boolean }`), the user-neutral
  shell rendering rule enforced by
  `runtime/src/__tests__/offline-route-neutrality.test.ts` (a static scanner
  for `headers()`/`cookies()`/session helpers in declared offline routes'
  server-component source), a dedicated `offline-shells` Workbox matcher in
  `runtime/next.config.ts` (`StaleWhileRevalidate`, listed ahead of the
  general `pages` `NetworkFirst` matcher), `runtime/src/registry.ts`'s
  `getOfflineRoutePrefixes()` resolving manifest declarations into concrete
  path prefixes, `runtime/middleware.ts`'s `x-sovereign-offline-route`
  header (read by `runtime/app/(platform)/layout.tsx` to render a fixed,
  identical-for-everyone shell — no name/email/avatar, no personalized
  sidebar — for offline-declared requests), and an unconditional
  `offline.clearAll()` purge on both sign-out
  (`runtime/app/(platform)/_components/AccountMenu.tsx:155`) and sign-in
  (`runtime/src/complete-sign-in.ts:22`), which is what makes plugin-only
  (not per-user) IndexedDB key scoping safe on a shared device.
- **`sdk.offline`** (`packages/sdk/src/offline.ts`), exposed via the
  dedicated subpath `@sovereignfs/sdk/offline` rather than the main
  `@sovereignfs/sdk` barrel — the barrel transitively reaches server-only
  `next/headers` code, and Next's client/server boundary check flags the
  whole reachable module graph, so a `'use client'` component importing from
  the barrel would fail to build. `sdk.offline` is a plugin-scoped (not
  user-scoped) IndexedDB key/value cache — `get`/`set`/`remove`/`keys`/
  `clear`/`clearAll` — backed by a single `sovereign-offline` database, with
  a write-epoch guard plus a `BroadcastChannel('sovereign-offline-clear')`
  to stop a cross-tab write racing a `clearAll()`, and a `5 MB` soft
  per-entry cap throwing a typed `OfflineQuotaExceededError`. It has **no
  server round-trip at all** — no `SdkHost` entry, no `provideHost()`
  wiring — architecturally unlike every other SDK namespace, which are thin
  RPC wrappers calling `requireHost()` (wired in `runtime/src/sdk-host.ts`
  via `provideHost()` from `runtime/instrumentation.ts`).
- **Launcher — the one existing adopter, and the pattern this RFC
  generalizes.** `plugins/launcher/manifest.json` declares
  `offline: { root: true }`; `plugins/launcher/app/page.tsx` renders nothing
  per-user; all data-fetching happens in
  `plugins/launcher/app/_components/LauncherOfflineView.tsx`, a `'use
client'` component that reads `offline.get(pluginId, 'plugins')` on mount
  and renders immediately if cached, then always attempts a live
  `fetch('/api/plugins')` in parallel, re-rendering and `offline.set()`-ing
  on success, falling back to an "unavailable offline" empty state if
  there's truly nothing cached. Launcher never used `routes[]` — it has
  exactly one page, and `root: true` was already sufficient. This is the
  proof that the enumerated-route-array shape was never load-bearing for the
  simplest, and so far _only_, real adopter.
- **The `mailer:send`/`mailer:sendExternal` permission-enforcement
  precedent** (RFC 0062): `runtime/src/plugin-mailer.ts`'s
  `requireMailerPluginContext()` is called from inside
  `runtime/src/sdk-host.ts`'s `provideHost({...})` — a shared host boundary
  every plugin's `sdk.mailer.send()` call passes through, which is what
  makes that gate centrally enforceable. No equivalent shared boundary
  exists (or can exist) for a plugin's own offline sync endpoint — see
  "Permission enforcement" below.
- **Plugins may add their own Route Handlers**, not just Server Actions,
  under their own `routePrefix`, gated by the ordinary session middleware —
  e.g. `plugins/sovereign-tritext/app/export/[projectId]/route.ts` calls
  `sdk.auth.requireSession()` directly inside a `GET` handler, because
  Server Actions aren't fetchable from arbitrary client code the way a plain
  Route Handler is. The same reasoning applies to a plugin's sync endpoint.
- **Zero prior art in this repo for a mutation queue, outbox, or background
  sync** — confirmed by a repo-wide search. This RFC has no existing pattern
  to reuse beyond `offline.ts`'s IndexedDB plumbing style (epoch guard,
  `BroadcastChannel`, pending-purge retry).
- **The Background Sync API has no iOS Safari support.** The only reliable
  trigger for "sync when connectivity returns" on the platform that matters
  most for a PWA is the app being foregrounded — a mount, or a live `online`
  event while the tab is open. `runtime/app/(platform)/_components/OfflineBanner.tsx`
  already listens to `window.addEventListener('online'/'offline', ...)` —
  the same signal this RFC's drain trigger uses.
- **A known, adjacent wrinkle in the neutral-shell mechanism**, surfaced
  while building toward this RFC but not itself in scope here: the
  neutral-shell rule (RFC 0074 §2) is only strictly required for the
  document a service worker might _precache and later replay to a different
  user_ — a **live, currently-online** tab sitting on an offline-declared
  route doesn't need degraded chrome, only the cached copy does. Any future
  implementation of this RFC's shell simplification (below) should restore
  personalized chrome for a live tab via client-side hydration (fetching the
  real sidebar/plugin list once mounted, the same way `AccountMenu.tsx`
  hydrates the authoritative session for its own self-mutation flows) rather
  than leaving a live, online visit permanently degraded. This RFC does not
  specify the exact mechanism — it is called out here as a requirement the
  implementation must satisfy, not a design this document commits to.

## Proposed design

### 1. Manifest — one flag, no route enumeration

Replace the current object shape

```jsonc
{
  "offline": {
    "routes": [{ "prefix": "/lists/[listId]", "description": "…" }],
    "root": true,
  },
}
```

with a plain boolean:

```jsonc
{
  "offline": true,
}
```

`true` means: this plugin's bare `routePrefix` page is its one
offline-capable entry point. It renders a user-neutral shell server-side and
hydrates everything else — which screens, which data, which records — from
client-side code the plugin owns entirely. The manifest schema no longer
knows or validates anything about "paths"; that is 100% application logic,
exactly where a plugin author already decides what their app supports
offline.

`packages/manifest/src/schema.ts:227-263`'s `offline.routes[]` array — the
prefix-safety refinement (must start with `/`, must not be `/`, no `..`, no
route-group markers) and the uniqueness check — is deleted outright, not
deprecated. `offline.root` is renamed/flattened into the top-level `offline`
boolean.

Add `'offline:write'` to `permissionSchema`
(`packages/manifest/src/schema.ts:19-36`, alongside `mailer:send`/
`mailer:sendExternal`). A new cross-field `.refine()` requires
`offline === true` whenever `'offline:write'` is declared — write capability
only exists on top of the generic single-shell model; there's no narrower
"just this route can write" option, because there's only one entry point per
plugin now.

**This is a breaking manifest-schema change**, accepted deliberately rather
than deprecate-and-coexist: `docs/upgrade.md` gets a new entry describing the
removal of `offline.routes[]`/`offline.root` and the migration path
("restructure your offline experience as one client-rendered shell at your
bare `routePrefix`, following `plugins/launcher/app/_components/LauncherOfflineView.tsx`
as the reference pattern — there is no field-for-field migration for
`routes[]` entries; each becomes a client-side view inside the one shell").
`@sovereignfs/manifest` takes a **major** version bump. `plugins/launcher/manifest.json`
updates in the same implementation task
(`offline: { root: true }` → `offline: true`) so the one plugin that already
relies on the field doesn't break.

### 2. Runtime — simpler, not more complex

Because there is now exactly one possible offline path per plugin (its bare
`routePrefix`), several existing mechanisms shrink:

- `runtime/src/registry.ts`'s `getOfflineRoutePrefixes()` returns just
  `routePrefix` for every plugin declaring `offline === true` — no more
  per-route array resolution.
- `runtime/next.config.ts`'s `offline-shells` Workbox matcher matches those
  single bare paths — functionally what it already did for `root: true`
  plugins; the array-handling branch for `routes[]` is deleted, not
  extended.
- `runtime/middleware.ts`'s `x-sovereign-offline-route` header logic
  simplifies the same way.
- `offline-route-neutrality.test.ts` scans each offline-enabled plugin's
  root `page.tsx` and `layout.tsx` (both are part of the one precached
  document) instead of an enumerated, arbitrary route list — a smaller,
  more mechanical scanner.

**Named, accepted tradeoff**: while offline, only a plugin's bare
`routePrefix` is reachable via the service worker. A stale bookmark or link
to a nested path (what would have been e.g. `/shopper/lists/42` under the
old model) is not SW-served offline — it falls through to the generic
`/offline` fallback. This matches the actual described usage (open the app,
tap the Shopper tile from Launcher, land at `/shopper`) and matches how
Launcher itself already behaves (only reachable via `/` when offline) — a
consistent consequence of the one-entry-point model, not a regression
against anything that worked before.

### 3. SDK — `@sovereignfs/sdk/offline-queue`, a generic mutation queue

`sdk.offline` was already scoped by **plugin id + a plugin-chosen key
string**, never by route — eliminating route-based declaration requires
_zero_ changes to the read-cache primitive. The new mutation-queue module
inherits the same property by design: this is the validation that the data
layer was already built the right way, and only the manifest/shell-rendering
layer needed to change.

New module `packages/sdk/src/offline-queue.ts`, its own dedicated subpath
`@sovereignfs/sdk/offline-queue` (matches the `offline`/`e2ee-*` pattern —
browser-only, excluded from the main barrel). **A separate IndexedDB
database** (`sovereign-offline-queue`), not a bolted-on object store inside
`offline.ts`'s `sovereign-offline` — `offline.ts`'s own doc comment scopes
it to "no server sync," and reusing it risks the already-shipped read cache.
The epoch + `BroadcastChannel` cross-tab write-vs-clear guard from
`offline.ts` is duplicated (not extracted/shared) under a new channel name —
a deliberate lower-risk-over-DRY tradeoff for a first pass; a follow-up
cleanup once both modules are stable is a reasonable future task, not this
one.

```ts
export interface QueuedMutation<TPayload = unknown> {
  id: string; // client-generated ULID — the idempotency key
  op: string; // plugin-defined operation name, e.g. 'addItem'
  payload: TPayload;
  clientTimestamp: number; // epoch SECONDS — match whatever convention the plugin's own DB uses
  attempts: number;
  lastError?: string;
}

export class OfflineQueueFullError extends Error {}

export const offlineQueue = {
  enqueue<TPayload>(
    pluginId: string,
    op: string,
    payload: TPayload,
  ): Promise<QueuedMutation<TPayload>>,
  list<TPayload = unknown>(pluginId: string): Promise<QueuedMutation<TPayload>[]>, // enqueue order (ULID-sortable)
  remove(pluginId: string, mutationId: string): Promise<void>,
  markFailed(pluginId: string, mutationId: string, error: string): Promise<void>,
  clear(pluginId: string): Promise<void>,
  clearAll(): Promise<void>, // wired into the same purge sites as offline.clearAll() — see §6
};

export interface SyncOutcome {
  id: string;
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
}

export async function drainQueue<TPayload>(
  pluginId: string,
  applyBatch: (batch: QueuedMutation<TPayload>[]) => Promise<SyncOutcome[]>,
): Promise<{ applied: string[]; skipped: string[]; failed: { id: string; error: string }[] }>;
```

`enqueue()` enforces a **count-based** cap (proposed 500 entries per
plugin — queue entries are small, numerous operations, unlike the read
cache's large blobs) and throws `OfflineQueueFullError` past it. There is
**no eviction**: silently dropping a queued write is data loss, not
inconvenience, so it must be a hard, visible error — stricter than the read
cache's soft-cap-with-silent-effect precedent.

`drainQueue` lists the plugin's full pending batch, calls the
plugin-supplied `applyBatch` once with it, then removes every
`applied`/`skipped` id locally and leaves `failed` and never-attempted ids
untouched. It is a pure on-demand primitive — no listener, no timer, no
auto-retry; the plugin decides when to call it.

**Sync trigger is plugin-driven, not platform-orchestrated — stated
explicitly, not left implicit.** A generic auto-scheduling helper in the SDK
would be a false promise on iOS Safari (no Background Sync support), so the
plugin calls `drainQueue()` itself: on mount of its offline shell, on a
`window.addEventListener('online', ...)` handler, and via an explicit
"Retry" affordance for the stuck case. If the app isn't foregrounded when
connectivity returns, sync doesn't happen until it is — a real, user-visible
limitation of this design, not a hidden implementation detail.

**Documented as a generic platform capability.** `docs/plugin-development.md`
describes `sdk.offline-queue` the same way `sdk.notifications`/`sdk.mailer`
are documented — a generic API with one worked example (Shopper) — not a
Shopper-specific feature. `@sovereignfs/sdk` takes a **minor** version bump
(purely additive, no `docs/upgrade.md` entry needed per NFR-04).

### 4. Idempotent, absolute apply contract

Every operation a plugin enqueues must be idempotent and describe an
absolute end state, not a delta — so a retried request (the client got no
response and doesn't know whether the server actually applied it) is always
safe to resend verbatim, and no separate server-side "have I seen this
mutation id" dedup table is needed:

- **`addItem`** — the client mints the **permanent** row id (a ULID) at
  enqueue time, not a temporary one. The server applies with
  `INSERT ... ON CONFLICT (id) DO NOTHING`. This removes the temp-id →
  real-id reconciliation problem structurally — there is no "swap the ID
  later" step, because the ID was real from the moment of the optimistic
  action. Fields the client can't compute offline (server-derived sort
  order, auto-suggested category/icon) are reconciled by a **full live
  re-fetch + cache overwrite** immediately after a successful drain, not by
  patching individual fields into the cached blob.
- **`updateItem`** — absolute field values, naturally idempotent as a pure
  overwrite, gated by the last-write-wins timestamp check on **every**
  apply attempt (not just the first), so a retried request can never
  clobber an edit that landed in between.
- **`deleteItem`** — `DELETE WHERE id = X`, naturally idempotent (a no-op if
  already gone).
- **A toggle-style operation (e.g. "mark bought") must not be queued as a
  toggle.** A retried toggle whose first attempt actually succeeded, but
  whose response was lost, would flip the value back to the wrong state on
  retry. The queued mutation must carry the **absolute intended state**
  (e.g. `{ itemId, bought: boolean, at: number }`) — the client already
  knows this at the moment of the optimistic action, since it's flipping its
  own local copy from one known state to the other. Apply logic no-ops if
  the target row already reflects the intended state.

### 5. Conflict resolution — last-write-wins by timestamp

The simplest option, chosen deliberately for this scale of workload (small,
low-concurrency plugin data, not heavy simultaneous editing). Every mutable
row a plugin wants offline-writable needs a timestamp column reflecting when
it was last touched, compared against the queued mutation's
`clientTimestamp` on every apply attempt. **Every existing online write path
that mutates that row must also update the same timestamp column on every
write** — not just the new sync path — or an online edit's stale timestamp
would wrongly lose to a later-synced offline mutation that shouldn't have
won. This is a required change to already-shipped online code paths, easy to
miss, and should be called out explicitly in any implementation that adopts
this design.

- **Delete-vs-edit conflicts.** A queued `updateItem`/mark-bought whose
  target row was deleted elsewhere before sync: return `skipped` — nothing
  to reconcile, the client's next full re-fetch removes it from the view.
  A queued `addItem` whose parent collection (e.g. the list itself) was
  deleted/archived in the meantime: return `failed` with a clear reason —
  silently dropping a user's added item is worse than surfacing it, unlike
  an edit-to-a-gone-item where "it's fine, nothing to show" is a legitimate
  resolution.
- **Named, accepted limitation: LWW trusts the device clock.** A device
  with a skewed clock could make a genuinely newer edit lose to a stale one.
  A hybrid logical clock is explicitly out of scope — over-engineering for
  this use case — but the tradeoff is named here rather than silently
  absorbed.

### 6. Permission enforcement — honest about its limits

`offline:write` **cannot** be centrally enforced the way `mailer:send` is.
`requireMailerPluginContext()` works because every plugin's
`sdk.mailer.send()` call funnels through one shared function inside
`runtime/src/sdk-host.ts` — a boundary the platform controls. A plugin's
offline sync endpoint is the plugin's **own** Route Handler, code the
platform does not intercept. This RFC recommends a small, documented,
copy-pasteable `requirePluginPermission(pluginId, manifest, permission)`
helper (generalizing `plugin-mailer.ts`'s pattern) that a plugin's sync route
is expected to call itself — real, useful signal, but not a closed
enforcement boundary the way `mailer:send` is. State this plainly in
`docs/plugin-development.md`: `offline:write`, like most permissions today
(`db:readWrite`, `notifications:send`), is review/install-time metadata with
an optional convenience helper, not a guarantee.

### 7. Logout/login purge — required, and riskier than RFC 0074's

`offlineQueue.clearAll()` must be wired into the same two call sites
`offline.clearAll()` already is:
`runtime/app/(platform)/_components/AccountMenu.tsx`'s sign-out handler
(~line 155) and `runtime/src/complete-sign-in.ts`'s `completeSignIn()`
(~line 22) — without it, a second user on a shared device could see, or
trigger a sync of, the first user's un-synced queued writes after login,
which is strictly worse than RFC 0074's read-cache leak risk (leaking a
_write_ is data corruption on shared data, not just a stale read).

But purging the _write queue_ is a materially worse failure mode than
purging the _read_ cache: it **silently discards edits the user made and
hasn't yet gotten back online to save**, not just a slower next cold-start.
This RFC resolves that explicitly rather than inheriting RFC 0074's purge
behavior by default:

- If the device is online at the moment of sign-out, attempt a best-effort,
  time-bounded (proposed 3s, matching the existing 4s `NetworkFirst`
  timeout precedent in `next.config.ts`) `drainQueue()` **before** purging.
  Sign-out must still complete regardless of the outcome — mirroring
  `AccountMenu.tsx`'s existing `finally { form.submit() }` discipline — so
  this is "try to save, don't block on it."
- If offline, or the best-effort sync fails or times out, purge anyway —
  sign-out must never hang or get stuck.
- **Open for reviewers**: should a confirmation prompt
  ("N unsynced changes — sign out anyway?") appear before the destructive
  purge, rather than purging silently? This is a product decision, not an
  engineering one — this RFC does not resolve it, and flags it explicitly
  rather than picking silently in an implementation.

### Docker / config impact

None expected — no new env var, port, on-disk path, or native dependency.
Same conclusion as RFC 0074.

## UI flows

**First online visit to an offline-enabled plugin** (e.g. Shopper):

```
online → shell renders → client fetches lists/items → renders + offline.set(...)
```

**Offline, viewing:**

```
offline → app opens → shell renders from precache
        → client offline.get(...) → renders cached data
        → OfflineBanner shows "No internet connection"
```

**Offline, editing** (add / edit / delete / mark bought):

```
offline → user action → offlineQueue.enqueue(...) + optimistic local render
        → no visible difference from "online and it just hasn't synced yet,"
          except a persistent pending-sync indicator
```

**Reconnect** (shell mount or `online` event):

```
online → drainQueue() runs → per-mutation outcomes reconcile the queue
       → full re-fetch overwrites the cache with canonical server state
```

**Reconnect with a partial failure:**

```
online → drainQueue() → some mutations applied, one failed
       → pending indicator persists with a Retry action
       → nothing else on the list is blocked
```

## Alternatives considered

- **Keep `offline.routes[]`, add writes on top of it.** Rejected. It would
  perpetuate a route-enumeration burden that the one real adopter
  (Launcher) never needed, and doesn't map cleanly onto a mutation queue
  keyed by plugin + operation rather than by which URL rendered a button.
- **Deprecate `offline.routes[]` but keep it valid, coexisting with the new
  model.** Considered and rejected in favor of removing it outright — a
  single model is simpler to document, review, and reason about than two
  offline mechanisms with different rules, and no plugin in this repo has
  adopted `routes[]` yet, so the migration cost is bounded.
- **Background Sync API** for the sync trigger. Rejected — no iOS Safari
  support, would leave the majority mobile-PWA case unimplemented;
  plugin-driven drain-on-foreground works everywhere.
- **Batch sync endpoint with all-or-nothing rollback.** Rejected in favor of
  sequential-apply-halt-on-first-failure: rollback implies undoing
  already-applied idempotent writes, unnecessary complexity when each
  operation is independently safe to leave applied.
- **Server-assigned real IDs with a client temp-ID swap.** Rejected in
  favor of client-minted permanent IDs from the start (§4) — removes an
  entire reconciliation mechanism rather than building one.
- **Hybrid logical clock instead of wall-clock LWW.** Rejected as
  over-engineering for this RFC's explicitly "simplest option, low
  concurrency" scope; the clock-skew risk is accepted and documented
  instead (§5).

## Open questions

1. **Permission enforcement and logout-purge behavior (§§6–7) should ship
   resolved in the implementation, not left open** — they're stated here
   with a recommended position, but are genuine product/security tradeoffs
   worth explicit reviewer sign-off before code lands.
2. Should `drainQueue` live in the SDK at all, or should each plugin's drain
   loop be 100% plugin-local, with the SDK only providing
   `enqueue`/`list`/`remove`? Leaning toward keeping it in the SDK — it
   reduces reimplementation for the next adopter after Shopper, which is the
   explicit point of prototyping in Shopper first — but open to reviewer
   input.
3. List-level operations (reorder, create/rename/archive a list, sharing)
   are out of scope for the first implementation — item-level operations
   only (add, edit, delete, mark bought). Whether those need finer
   per-operation permission granularity, beyond the single `offline:write`
   flag, is deferred to a future RFC once the one-shell pattern is
   validated with item-level writes.
4. The live-tab-vs-precached-document distinction noted under "Current
   state" (a live, online tab on an offline-declared route shouldn't show
   degraded chrome, only the cached copy needs to) is a real requirement for
   any implementation of §2's shell simplification, but this RFC does not
   specify the mechanism — left to the implementation task, informed by
   whatever pattern is in place by then.

## Adoption path

Documentation-first, no roadmap slot yet (matches RFC 0071 and RFC 0077's
posture). Once scheduled, implementation proceeds as a sequence of small,
independently reviewable tasks rather than one PR:

1. Manifest schema change (§1) + Launcher's manifest migrated in the same
   task, since the change is breaking to the one field already in use.
   `@sovereignfs/manifest` major bump.
2. Runtime simplification (§2) — registry/middleware/`next.config.ts`/
   neutrality-scanner changes, verified against Launcher (the only existing
   adopter) as a regression check.
3. SDK mutation queue (§3) — `@sovereignfs/sdk/offline-queue`.
   `@sovereignfs/sdk` minor bump.
4. Shopper — schema migration (the new timestamp column + updating existing
   online write paths to maintain it, §5), then the read-only offline shell
   (§1–2 applied), then the write path on top (§3–7). Shopper's own
   independent semver, minor bump.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | July 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 0.2     | July 2026 | Platform plumbing implemented on `main`: manifest breaking change (`offline` flattened to boolean, `offline:write` permission added and validated), `@sovereignfs/sdk/offline-queue` (`offlineQueue`, `drainQueue`, last-write-wins conflict resolution), runtime route-resolution/SW-precaching simplification, and the mutation queue purged on both logout and login. Status updated from Draft to Implemented; this changelog entry itself was added retroactively after the header had drifted stale relative to already-merged code. |
