# Research 0009 — Universal offline database architecture

> **Superseded by [Research 0012 — Offline-first architecture](0012-offline-first-architecture.md).**
> This doc framed the storage question as an open lean between a KV-shaped
> IndexedDB model and a relational client-side SQL layer, and explicitly did
> not decide it. Research 0012 decides it — per-tier storage backends
> (IndexedDB / OPFS-SQLite / native SQLite) behind one SDK surface — and
> reframes the whole problem as offline-first rather than online-first with an
> offline fallback. Kept as the decision trail; the options analysis below is
> still the fullest write-up of why PowerSync and the continuous-sync models
> were rejected.

**Status:** Superseded\
**Date:** August 2026\
**Author:** Claude Code (from a brainstorming session with kasunben)\
**Scope:** `packages/sdk` (`offline.ts`, `offline-queue.ts`, a possible new
unified client data API), `packages/manifest` (the `offline` field and
`offline:write` permission), `runtime` (registry, middleware, the
offline-route-neutrality scanner), `packages/db` (a possible client/server
schema-parity check), `sovereign-mobile`/`sovereign-desktop` (possible future
native storage adapters, both external repos)\
**Related:** RFC 0074 (offline-capable plugin routes), RFC 0078 (offline
plugin writes, Draft, no roadmap slot yet), RFC 0080 (plugin surface model),
RFC 0083 (device bridge capability contract), Research 0008 (WKWebView /
Android WebView offline spike — directly load-bearing for this doc), RFC 0071
(SQLite at-rest encryption — cited here as precedent for how much hardening a
data-layer subsystem in this codebase has needed historically)

---

## Question

Should Sovereign's offline support move from today's opt-in, per-plugin,
hand-rolled model to a unified, platform-provided offline database layer —
ideally one with a single API that behaves identically across browser, PWA,
Capacitor, and Tauri, and that plugins get by default without implementing
anything offline-specific themselves? If so, what should that layer actually
be built from, and is "default for everyone, everywhere, from day one" the
right scope to start with?

This doc captures a multi-session brainstorm exploring that question. No
direction has been decided — kasunben is explicitly not yet convinced of any
of the options below. This is a decision trail, not a proposal.

## Findings

### Today's model — opt-in, per-plugin, key/value-shaped

- Manifest: `offline: z.boolean().optional()`
  (`packages/manifest/src/schema.ts:228`). The `offline:write` permission
  (added to `permissionSchema` at `schema.ts:36`) requires `offline: true` via
  a cross-field `.refine()` (`schema.ts:637-640`) — write capability only
  exists on top of the offline-capable single-shell model.
- Client read cache: `packages/sdk/src/offline.ts` — a plugin-scoped IndexedDB
  key/value store (`sovereign-offline` DB), composite `[pluginId, key]` array
  keys (delimiter-free plugin isolation), a 5 MB soft cap per entry with
  **no eviction policy**, a same-tab epoch guard plus cross-tab
  `BroadcastChannel` to stop a write racing a purge, and an unconditional
  `clearAll()` wired into both sign-out and sign-in — the mechanism that makes
  plugin-only (not per-user) key scoping safe on a shared device.
- Client write queue: `packages/sdk/src/offline-queue.ts` — a **separate**
  IndexedDB database (`sovereign-offline-queue`), a 500-entry **count** cap
  per plugin (no eviction — a full queue throws rather than silently dropping
  a write), plugin-driven `drainQueue()` (no Background Sync API — no iOS
  Safari support), an idempotent/absolute-end-state mutation contract, and
  last-write-wins conflict resolution by wall-clock `clientTimestamp`.
- RFC 0078 (Draft, no roadmap slot yet) specs flattening `offline.routes[]`/
  `offline.root` into the single `offline: boolean` above and generalizing
  the write queue. The SDK modules already exist, ahead of the manifest/
  runtime changes landing. **Only one plugin (Launcher) is an actual
  adopter today**, using the simpler `offline.root: true` shape from RFC 0074.
- Every plugin that wants offline writes must hand-roll its own sync Route
  Handler, its own last-write-wins timestamp comparison (and remember to
  maintain that timestamp on every existing _online_ write path too), and its
  own permission check — RFC 0078 §6 states outright that `offline:write`
  cannot be centrally enforced the way `mailer:send` is. This is the real
  friction behind "plugins mostly don't bother."

### Hard constraints that box in any redesign

- SSR pages must stay `NetworkFirst`, never stale-served — a **security**
  rule (a precached, replayed document must never leak one user's session
  data to a different user on a shared device), not a performance preference.
  "Offline by default" therefore cannot mean caching pages more aggressively
  — it can only live at the client-side data-fetching layer.
- Most plugin screens fetch data inside Server Components — server-only, no
  client-side call for any layer to transparently intercept. A screen can
  only degrade gracefully offline if it already renders from a client-owned
  data path; this is why RFC 0074/0078 both require a neutral server-rendered
  shell with everything else hydrated client-side, as a precondition, not an
  implementation detail underneath one.
- `packages/sdk` is deliberately zero-deps; every comparable cross-cutting
  integration in this codebase (mailer, notifications, the device bridge) is
  hand-built rather than adopted from a third-party platform — an
  established, deliberate pattern any new dependency would break from.
- `sovereign-mobile`/`sovereign-desktop` are thin, dumb WebView loaders with
  zero app logic, post-v1, **not yet built**. `sdk.device.getSurface()` is
  explicitly a presentation hint only, never a security boundary (RFC 0080).

### Research 0008 (WKWebView/Android WebView spike) — directly load-bearing

- `navigator.serviceWorker` does not exist at all in `capacitor://`-scheme
  WKWebView contexts on iOS — service workers are not a viable universal
  mechanism for this problem.
- `indexedDB.open()` succeeded in **every** context tested (iOS bundled
  scheme, iOS `server.url` remote, Android bundled scheme, Android remote) —
  the one validated universal storage primitive across all four target
  runtimes so far.
- iOS WKWebView does **not** preserve JS memory state across a
  background/foreground cycle (a fresh reload was observed); Android WebView
  does. Any offline write buffering must flush to durable storage
  immediately — confirmed necessary specifically because of iOS's behavior,
  safe on both platforms either way.
- Left untested/open: IndexedDB persistence across a real app restart with an
  authenticated session (needs a human, credential-gated); **OPFS behavior
  and durability in Capacitor and installed-PWA contexts specifically was
  never tested**; `WKWebsiteDataStore` eviction under storage pressure or
  prolonged non-use is unknown.

### PowerSync, evaluated as a build-vs-adopt option

- Client SDKs use real embedded SQLite, not raw IndexedDB: `wa-sqlite`/OPFS
  in the browser, native SQLite via a Capacitor SDK (beta), native
  Rust-backed SQLite via a Tauri SDK (alpha, desktop-only so far), with
  automatic per-platform engine selection.
- Backend support: Postgres (mature, logical-replication-based) and MongoDB
  (GA); MySQL and SQL Server in beta/alpha. **No SQLite backend support** —
  directly conflicts with Sovereign's first-class self-hosted SQLite path
  (RFC 0071's at-rest encryption work exists specifically for that path).
- The self-hosted "Open Edition" is free but source-available under FSL
  (Functional Source License), not OSS (only the client SDKs are
  Apache-2.0), and requires running an additional `powersync-service` Docker
  container in every self-hosted deployment.
- PowerSync's own docs report that plain WASM SQLite (IndexedDB/OPFS-backed)
  had real data-persistence problems across app updates specifically inside
  Tauri — the stated reason they built a separate native Tauri SDK instead of
  reusing their web SDK there. Credible, first-hand evidence that "one WASM
  engine everywhere" is unsafe for Tauri specifically.
- Sources: [powersync.com](https://powersync.com/),
  [PowerSync Licensing & Terms](https://www.powersync.com/legal/licensing-terms),
  [Introducing PowerSync v1.0](https://powersync.com/blog/introducing-powersync-v1-0-postgres-sqlite-sync-layer),
  [JavaScript Web SDK docs](https://docs.powersync.com/client-sdks/reference/javascript-web),
  [Introducing the PowerSync Tauri SDK](https://releases.powersync.com/announcements/introducing-the-powersync-tauri-sdk-alpha).

### Client-side SQL tooling, if built in-house

- Drizzle can front a WASM engine via `drizzle-orm/sqlite-proxy` (a generic
  driver taking a custom execute function) — there is no dedicated wa-sqlite
  driver; this is glue code to write, not a drop-in dependency.
- `@tauri-apps/plugin-sql` is official (part of Tauri's own plugins
  workspace), `sqlx`-backed, native — but speaks `sqlx` directly, not
  Drizzle; Drizzle-shaped queries there need their own adapter layer.
- Capacitor's native SQLite path (`@capacitor-community/sqlite`) is
  community-maintained, not an Ionic first-party plugin — an ongoing
  dependency-risk line to weigh, not a guarantee on par with Tauri's official
  plugin.

## Options considered

### A — Harden and generalize the current model (IndexedDB KV, no new engine)

Land RFC 0078's manifest flattening; extract the LWW-timestamp-check and
idempotent-apply pattern into a shared SDK helper instead of every plugin
reimplementing it; add a generic sync-gateway Route Handler factory; add a
real eviction policy (none exists today). Optionally flip the manifest
default to opt-out.

- _Cost:_ low — mostly extraction of code that already exists and already
  works (Launcher).
- _Ceiling:_ stays KV-shaped — a plugin with related tables still manually
  denormalizes into cache keys; no relational offline queries.

### B — Unified relational local store: SQLite everywhere (WASM + two natives), default-on

Replace the KV cache with a real client-side SQL engine, mirroring each
plugin's server schema: `wa-sqlite`/OPFS in the browser, a native Capacitor
SQLite plugin on mobile, `@tauri-apps/plugin-sql` on desktop, one unified API
in front of all three, default-on for every plugin.

**Drawbacks surfaced for this option specifically**, from a dedicated
brainstorm pass:

1. **Three engines to maintain forever, each independently.** Every offline
   bug now has to be triaged per engine; SQLite versions, `PRAGMA` support,
   and locking semantics can drift across the WASM build and the two native
   plugins. RFC 0071 (a narrower, single-engine, server-only subsystem)
   needed three separate hardening passes including a real production
   incident before it was trusted — a documented precedent for this
   codebase's track record with data-layer complexity, not a hypothetical
   concern.
2. **Default-on caching inverts "secure by default."** Today a
   sensitive-data plugin simply doesn't opt in and nothing persists
   client-side. Default-on means such a plugin must actively and correctly
   opt out; getting it wrong means sensitive data silently persists,
   unencrypted (no client-side equivalent of RFC 0071 exists), on a
   device the platform doesn't control. The neutral-shell/purge-on-logout
   invariant's blast radius grows from "a small, reviewed opt-in list" to
   "every plugin's every screen."
3. **Schema drift between server and client, nothing catches it.** No
   parity check (analogous to `runtime/src/docs-parity.test.ts`) exists for
   client-vs-server schema; a plugin author who changes one and forgets the
   other breaks the offline path silently, in a way that only manifests
   offline.
4. **New user-visible incoherence.** Two surfaces (two tabs, phone + laptop)
   can legitimately show different data at the same moment depending on
   which one's last live fetch succeeded — inherent to any offline-fallback
   design, but a real support/trust cost if left unaddressed in the UI.
5. **Bundle size and performance, worst where offline matters most.** A real
   WASM SQL engine is heavier than today's `offline.get(key)`, and lower-end
   Android on patchy connections is both where offline matters most and
   where WASM instantiation cost hurts most. OPFS's full-concurrency mode can
   also want COOP/COEP headers, which have a history of breaking third-party
   embeds — relevant here because plugin pages are third-party-authored.
6. **Raises the bar to be a plugin author.** CLAUDE.md states the plugin
   system _is_ the product; this architecture requires even simple CRUD
   plugin authors to have a working model of client-side SQL, migrations, and
   sync semantics to use the platform idiomatically.
7. **Self-hosting admins lose visibility.** No current Console surface shows
   per-user, per-plugin client storage consumption across devices; this
   option grows that footprint by default with no corresponding visibility.
8. **Third rework of the same subsystem in a short window.** RFC 0074 → RFC
   0078 (Draft) → this — each a breaking manifest/SDK change with its own
   major bump and migration note, on top of real thrash cost for the one
   real adopter (Launcher).
9. **One-way door.** Once plugin authors write against client schemas and
   real user data exists in local SQLite/OPFS files across many devices,
   walking the design back is far more expensive than a server-side
   rollback — there's no way to reach a device that isn't currently
   connected to migrate or clear its local store.

### C — Adopt PowerSync wholesale

Rejected as a "from the beginning" foundation. The SQLite-backend gap alone
is close to disqualifying on its own (see Findings above) — it would either
make offline Postgres-only (an admin's DB choice at install time silently
deciding whether offline works, for reasons unrelated to offline) or force
dropping SQLite as a supported backend, a far bigger decision than this one.
Layered on top: an extra self-hosted service in every deployment, an
FSL-licensed core dependency in an OSS self-hosted product, early-stage
(beta/alpha) SDKs for shells that don't exist yet, and machinery sized for
_continuous_ local-first sync — a bigger commitment than the network-first,
local-fallback-only scope this brainstorm converged on (see Option E). The
underlying technology choice (real embedded SQLite client-side, picked
per-platform automatically) is validated and worth taking directly; the
platform and its constraints are not.

### D — Push storage into native shells only, bypass the browser primitive

Ruled out early. Contradicts the already-decided "thin, dumb shell, zero app
logic" architecture for `sovereign-mobile`/`sovereign-desktop`, doubles
engineering surface across repos that don't exist yet, and there is no
evidenced problem it solves — Research 0008 found IndexedDB already works in
every tested context.

### E — Network-first, local-fallback-only policy (a scope refinement, not a standalone option)

A live suggestion during this brainstorm: the local layer should be bypassed
whenever the network is available and only activate on failure — not a
continuously-syncing local-first mirror. This maps onto patterns already
shipped (the `pages` Workbox cache is already `NetworkFirst`; Launcher's own
`LauncherOfflineView.tsx` already renders from cache immediately, always
attempts a live fetch in parallel, and overwrites the cache on success).

This meaningfully de-scopes the problem: no continuous bidirectional
replication or subscription engine is needed, "just" a generalized
write-through read cache plus the existing write queue, retargeted at
whichever storage engine is chosen. It does **not** remove the precondition
that any screen wanting offline resilience must be capable of client-side
rendering from local data — physically, there's nothing to render if the
network is down and the server can't be reached. This refinement applies
equally under Option A, B, or F below; it's an orthogonal decision about
_sync policy_, not storage engine.

### F — Tiered capability + phased shell rollout (the alternative proposed at the end of this brainstorm)

- **Tier 1 — cheap, IndexedDB, no new engine, default-eligible.** Generalize
  the existing KV cache + write queue behind one unified API. Matches RFC
  0078's own stated design scope ("small, low-concurrency plugin data, not
  heavy simultaneous editing") and carries the same risk profile as what's
  already shipped and reviewed for Launcher — the tier actually safe to
  consider default-on.
- **Tier 2 — opt-in, heavier, relational SQL.** The wa-sqlite/OPFS engine,
  offered only to plugins that explicitly declare a need for real offline
  joins/complex queries — paying the bundle-size, injection-surface, and
  schema-drift costs only where they're actually needed. Browser/PWA first.
- **Native engines (Capacitor, Tauri) deferred, not designed away.** Design
  the API to be engine-pluggable now; implement only the browser/PWA adapter
  until `sovereign-mobile`/`sovereign-desktop` actually exist as buildable
  projects, at which point run a 0008-style spike against the real shells
  rather than speculating now.
- **Rollout stays opt-in-first.** Land Tier 1 behind one real pilot (Shopper
  — already RFC 0078's named first adopter), close the schema-parity,
  eviction, and logout-purge gaps against real usage, _then_ consider
  flipping the manifest default — not a big-bang default-on from day one.
- **What this trades away:** "every plugin, relational offline queries,
  three shells, on day one" is not achieved — it's spread across a longer
  timeline. Native-shell offline support is explicitly deferred, not solved,
  so "same behavior on every shell" is only true for the shells that exist
  today (browser/PWA).

## Recommendation

**Not decided.** The working lean coming out of this brainstorm is Option F
(tiered + phased) over Option B (full three-engine, default-on from day one)
and Option C (adopt PowerSync) — primarily because F's costs land where the
codebase's own history (RFC 0071) suggests data-layer complexity should be
absorbed incrementally, and because most of B's drawbacks are drawbacks of
_scope_, not of the underlying technology choice, so narrowing scope resolves
most of them without giving up the long-term direction.

**kasunben is explicitly not yet convinced of this lean.** Record this as the
agent's recommendation for a future session to react to, not as agreement
reached in this one.

## Open questions

- OPFS durability/persistence across Capacitor iOS/Android and an
  installed-PWA-on-iOS context — untested; needed before any commitment to
  OPFS as a cross-shell assumption (see Next steps).
- Is a client-side eviction/quota policy (LRU/TTL, per-plugin caps) a
  prerequisite for any default-on flip? Today: none exists — a soft cap that
  throws, not eviction.
- Does default-on caching require a client-side equivalent of RFC 0071's
  at-rest encryption for sensitive plugin data? No such mechanism exists
  today for either IndexedDB or a future local SQL store.
- Should schema-parity tooling (client vs. server schema drift detection)
  be a hard prerequisite for Tier 2, given nothing enforces this today?
- How would self-hosting admins get visibility into per-user, per-device
  local storage consumption? No current Console surface covers this.
- **The core unresolved disagreement:** is "identical behavior on every
  shell, starting now" a hard requirement, or is "identical API, shells
  added as they're actually built" acceptable? Option F assumes the latter;
  this hasn't been agreed.
- If Option F is pursued, is Shopper the right opt-in pilot, or is there a
  better-scoped first adopter?

## Next steps

Does not yet graduate to an RFC. Before any RFC is worth writing:

1. **A narrow, Research-0008-style spike** testing OPFS support and
   durability specifically — across browser/PWA, Capacitor iOS, and
   Capacitor Android, including persistence across app updates and
   backgrounding. This is the one concrete, cheaply-resolvable unknown
   blocking any storage-engine decision (Option B, C, and F's Tier 2 all
   depend on the answer).
2. **Revisit this doc** once that spike lands and once there's more
   conviction on the two open framing questions above (tiered vs. universal,
   default-on-from-day-one vs. opt-in-first).

If a direction firms up, this would likely graduate into two separable RFCs:
one for the unified SDK data API plus the Tier 1 (or Option A) generalization
— small, low-risk, mostly extracting what already exists — and, only if
Tier 2 is actually pursued, a second RFC scoping the relational SQL engine,
gated on the OPFS spike's findings.
