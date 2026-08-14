# Workstream 0001 — Standalone plugin apps

**Status:** ⏳ In progress — leg 2 done (task 3.33, surface model shipped at
platform `0.83.0`; task 3.32 itself pre-dates this workstream, shipped at
`0.58.0`) and leg 3 done (tasks 2.25–2.26, per-plugin installable PWA +
icon generation, shipped at `0.84.0`–`0.85.0`); leg 5's runtime half done
(task 2.27, shipped at `0.82.0`). Leg 1 (the WKWebView spike, gate) is
**down to one open item** — research 0008 confirmed the platform-divergent
service-worker finding, root-caused/fixed a real session-gate bug, and (as
of 2026-08-15, with a human supplying login credentials) confirmed
`sdk.offline` IndexedDB persistence across a hard app restart at the
storage layer. Only `WKWebsiteDataStore` eviction under storage pressure
remains, which needs elapsed time/storage-pressure simulation, not a human
credential step. Leg 4 was redesigned (see its own section)
to ship as an in-repo reference plugin instead of depending on an external
plugin repository, and has not started. The rest of leg 5 (tasks 20.11–20.12)
remains blocked on leg 1 and on epic 20.1 (`sovereign-mobile` shell,
substantially implemented but not yet signed off)\
**Date:** July 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0080](../rfcs/0080-plugin-surface-model.md) (surface model),
[0081](../rfcs/0081-per-plugin-installable-pwa.md) (per-plugin installable PWA),
[0082](../rfcs/0082-focused-plugin-app-shell.md) (focused plugin app shell)\
**Epics touched:** 2 (Platform Shell), 3 (Plugins Runtime), 12 (Example
Plugins), 20 (Mobile)\
**Research:** [0006](../research/0006-standalone-plugin-apps.md),
[0008](../research/0008-wkwebview-android-webview-offline-spike.md)

---

## Goal

A single plugin can be used as its own app. A user installs "Tally" from their
browser and gets a chrome-less, offline-capable app with its own home-screen
icon; for flagship plugins, the same experience is also published to the App
Store and Play Store as a focused native app that defaults to a primary
instance, allows the instance URL to be changed, and loads only that plugin.

Throughout, the user's Sovereign instance stays the backend, the web interface,
and the source of truth. The plugin ships **once** — no native UI, no
plugin-specific REST API, no second implementation.

## Definition of done

- [x] Any plugin can declare `installable: true` and be installed from a browser
      as its own home-screen app, with its own name, icons, and scope.
- [ ] An installed plugin app cold-launches offline and renders cached data.
- [x] An installed plugin app can be signed into without leaving its scope.
- [x] Plugins can gate features and UI on surface (`browser` / `mobile` /
      `desktop`) server-side with no hydration flash, and on installed-PWA state
      client-side.
- [x] A plugin can declare which surfaces it is available on, and the platform
      filters presentation accordingly.
- [ ] An in-repo reference plugin demonstrates offline viewing plus offline
      **append** writes, syncing on reconnect.
- [ ] One focused native app is published from `sovereign-mobile` build targets,
      with the whole-instance app still building from the same codebase.
- [x] `docs/plugin-development.md` documents `installable`, `surfaces`, and
      `sdk.device.*` as generic platform capabilities.
- [ ] The written rationing policy for store-published plugin apps exists
      (RFC 0082 §7).

## Decisions locked

Settled in a design session with kasunben, July 2026. Recorded so they are not
reopened mid-execution — full reasoning in research
[0006](../research/0006-standalone-plugin-apps.md).

| Decision                        | Choice                                                                                                        | Rejected alternative, and why                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall shape                   | Ladder: installable PWA first, focused native shell second                                                    | Native UI + plugin REST API — forks every plugin into two implementations; same reason RFC 0058 rejected React Native                         |
| Plugin API surface              | None new; WebView uses existing Server Actions                                                                | A REST API per plugin — unnecessary for a WebView, and the only new endpoint (offline sync) RFC 0078 already requires                         |
| Surface mechanism               | Server-injected `x-sovereign-surface` **plus** `sdk.device.*`                                                 | Client-only detection (hydration flash); `NEXT_PUBLIC_*` (build-time inlining); capability-system reuse (category error)                      |
| Feature flags                   | None. Surface + capability only                                                                               | General flag service with targeting/percentages — single-tenant self-hosted, no fleet to roll out across                                      |
| Operator flags                  | Not built                                                                                                     | `PlatformConfig` booleans + Console UI — no concrete need; don't ship a settings surface nobody asked for                                     |
| Focused app scope               | Hard lock to the plugin's `routePrefix`                                                                       | Soft lock (chrome-less but freely navigable) — a focused plugin app should not be a browser into the whole instance                           |
| Lock trust level                | **Presentation/UX only, never a security boundary**                                                           | Treating it as access control — the signal is a spoofable User-Agent                                                                          |
| Bearer-token plugin API         | Deferred, explicitly additive                                                                                 | Ruling it out (forecloses CLI/third-party clients); or including it now (would make native plugin UIs tempting)                               |
| Native auth                     | Cookie-in-WebView for v1; OAuth refresh token + keychain named sequel                                         | OAuth-first now — blocked on RFC 0072's per-instance admin-only client registration                                                           |
| Offline reference plugin writes | **Append-only** (add-item, add-comment style mutations only). Edit/delete/settle-style operations stay online | RFC 0078's LWW — row-level LWW across a resource's dependent tables can desync a derived total from its parts and silently corrupt aggregates |
| Queue first adopter             | Shopper (single-user)                                                                                         | A multi-member, financial-ledger-shaped plugin — the wrong place to harden a new mutation queue                                               |
| Leg 4 test vehicle              | An in-repo `example-plugins/` reference plugin                                                                | An external plugin repository — couples this workstream's completion to a repo outside its own control/versioning                             |
| Shell repository                | Build targets inside `sovereign-mobile`                                                                       | A repo per plugin app, or a separate generic shell repo — guarantees divergence, multiplies store tooling                                     |
| Per-plugin manifest location    | `/api/manifest/<pluginId>` (already session-exempt)                                                           | `/<routePrefix>/manifest.webmanifest` — session-gated, so a logged-out browser never gets an install prompt                                   |
| `installable` vs `offline`      | Separate manifest fields                                                                                      | Deriving one from the other — independent concerns; Launcher is offline-capable and should not become installable                             |
| Service worker                  | One, unchanged, at `/`                                                                                        | A second SW scoped per plugin — manifest scope is not SW scope; two SWs would overlap on the same origin                                      |
| Workstream execution            | Legs — one branch, one draft PR, one review gate per leg                                                      | Stacked per-task branches, or one giant PR per workstream                                                                                     |

## Prerequisites

| Prerequisite                                                     | Owner         | Status                                                                    |
| ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| RFC 0078 offline write queue (`@sovereignfs/sdk/offline-queue`)  | separate task | ✅ Shipped — no longer blocks leg 4                                       |
| RFC 0078 §7 logout/login purge wired                             | separate task | ✅ Shipped — both call sites                                              |
| Instance validation endpoint (epic 20.2)                         | epic 20       | ✅ Shipped — `GET /api/instance`, no longer blocks leg 5                  |
| `sovereign-mobile` repo exists with RFC 0058's shell (epic 20.1) | epic 20       | ⏳ Substantially implemented, not yet signed off — **still blocks leg 5** |

Legs 1–4 depend on none of these and can start immediately — the offline write
queue and instance validation endpoint both shipped, so only leg 5 still has
an unmet prerequisite (epic 20.1), on top of its own leg 1 gate.

## Legs

| Leg | Name                                 | Epic tasks            | Epics | Gate?   | Done when                                                                     |
| --- | ------------------------------------ | --------------------- | ----- | ------- | ----------------------------------------------------------------------------- |
| 1   | WKWebView offline spike ⏳           | 20.10                 | 20    | **Yes** | Service-worker + IndexedDB behavior in a real Capacitor build is known        |
| 2   | Surface model ✅                     | 3.32, 3.33            | 3     | No      | Plugins can gate on surface server-side and declare `surfaces` — done         |
| 3   | Per-plugin installable PWA ✅        | 2.25, 2.26            | 2     | No      | Two plugins install as their own home-screen apps — done                      |
| 4   | Offline append-only reference plugin | _new_                 | 12    | No      | An in-repo reference plugin works offline read + append, syncing on reconnect |
| 5   | Focused native app                   | 2.27 ✅, 20.11, 20.12 | 2, 20 | No      | One focused app builds and passes store review                                |

## Leg detail

### Leg 1 — WKWebView offline spike (gate)

**Epic tasks:** 20.10

**Status (August 2026): substantially progressed, not complete.** Research
[0008](../research/0008-wkwebview-android-webview-offline-spike.md) ran the
spike against real iOS Simulator and Android Emulator builds and a live
instance, and found:

- The bundled local scheme's service-worker support is **platform-divergent**
  — confirmed, not assumed. No `serviceWorker` API at all on iOS's
  `capacitor://` scheme; full registration and activation on Android's
  default `https://localhost` bundled scheme. `sovereign-mobile`'s ADR 0005
  decision (never load real content via the bundled scheme, always
  `server.url`/navigate to the real remote origin) is still correct, but for
  a different reason than originally stated (ADR 0002 — no baked-in
  instance — not service-worker support); the ADR's rationale needs
  correcting to say so, in that repo.
- A real, reproducible service-worker **registration failure** was found and
  root-caused: `runtime/middleware.ts`'s session-gate allowlist omitted the
  `worker-<hash>.js` custom-worker chunk, so any sessionless request for it
  303'd to `/login`, and the redirected `importScripts()` aborted the whole
  SW install. **This was never Android-specific** — it reproduced from plain
  `curl` on any platform and affected every logged-out visitor everywhere,
  not just native shells. Fixed 2026-08-07, with a regression test.
- Background/foreground cycle survival is confirmed **and platform-divergent
  in a way not previously documented**: iOS WKWebView discards the JS
  execution context entirely on backgrounding (fresh reload, in-memory state
  lost, no event fires to catch it); Android WebView preserves it. This is a
  hard design constraint on `sdk.offline`: flush to IndexedDB as data is
  produced, never buffer-then-flush-later in memory.
- **`sdk.offline` IndexedDB persistence across a real app restart — now
  confirmed at the storage layer (2026-08-15).** Tested live against
  `sovereign.openfs.io` with a human supplying login credentials in the
  simulator panel and an agent driving everything else (build, navigation,
  the hard process kill/relaunch, and inspecting the app's on-disk WebKit
  storage directly). Found real, origin-correct IndexedDB databases —
  object stores named `kv`, `queue`, and `key`, matching `sdk.offline`'s and
  RFC 0078's own naming — that were reopened and written to after a full
  process kill, not merely surviving in the UI. See research 0008's
  dedicated finding for the method and its one caveat: true cache-first
  rendering under an actual network outage (rather than storage-layer
  survival, which is what was actually verified) still wasn't isolated,
  since cutting simulator network reliably would have meant touching
  host-level system settings, which was out of scope for that session.
- **Still open — needs a human, or elapsed real time, not more agent
  work:** `WKWebsiteDataStore` eviction under storage pressure or prolonged
  non-use. Not practically testable in a short session; needs either a
  long-duration trial or artificial storage-pressure simulation, neither
  available in this environment.

**This leg is now down to one open item, and it genuinely can't be closed
by another agent session.** Everything else — including the item that
previously needed a human for credentials — is done. What remains is a
question of elapsed time or storage-pressure simulation, not access.

**Why this leg is first:** it is the cheapest leg and carries the most
information. Research 0005 identifies WKWebView's service-worker behavior as the
plan's least-verified assumption, and it gates the most expensive leg. A negative
result reshapes the workstream before anything is invested in it.

**Technical notes:**

- Service workers require an `https` document. Point Capacitor's `server.url` at
  a real instance. **Bundling assets behind the `capacitor://` custom scheme
  yields no service worker on iOS — but does on Android's default bundled
  scheme** — this was assumed to be a cross-platform fact and confirmed to be
  iOS-specific instead; see the status note above.
- Verify all four layers, not just registration: SW registration; `offline-shells`
  document caching; `sdk.offline` IndexedDB persistence across app restart; and
  survival of a background/foreground cycle.
- Probe the eviction limitation deliberately — how does the data store behave
  under simulated storage pressure and after prolonged non-use? This determines
  how loudly the pending-sync indicator in leg 4 needs to shout.
- Android System WebView is expected to be unproblematic; verify anyway so the
  result covers both platforms.

**Deliverable is a written finding**, appended to research 0005 or as its own
short research doc — not code. The spike branch is disposable. (In practice
the finding landed in research 0008, its own doc, cross-referenced from
research 0005.)

**Do not proceed if:** service workers are unavailable or unreliable in the
Capacitor WebView. In that case stop, record the finding, and re-open RFC 0082
§4 rather than proceeding to leg 5. Legs 2–4 are unaffected and still ship.
(The one hard SW failure found here was a fixed server bug, not a platform
limitation — see status note above. Nothing found so far says offline is
unworkable.)

### Leg 2 — Surface model

**Epic tasks:** 3.32, then 3.33

**Status (August 2026): fully shipped.** 3.32 landed the server/client
surface tiers and `x-sovereign-surface`; 3.33 (platform `0.83.0`) landed the
manifest `surfaces` field and Launcher/sidebar/mobile-drawer filtering —
`selectLauncherPlugins`/`selectSidebarPlugins`
(`runtime/src/launcher-plugins.ts`) and `decidePluginRoute`'s new
`'unavailable-surface'` outcome (`runtime/src/route-guard.ts`), redirecting
to a generic `runtime/app/(platform)/unavailable-surface/page.tsx` rather
than 404ing. `runtime/app/api/account/sidebar-plugins/route.ts` (the sidebar
reorder preference UI) deliberately does **not** filter by surface — see its
own doc comment.

**Technical notes:**

- Copy the established injected-header pattern exactly: middleware injects,
  `packages/sdk` reads via `next/headers`. `packages/sdk/src/auth.ts:13-34` and
  `packages/sdk/src/env.ts` are the two reference implementations — `env.ts`'s
  "return the safe default, never throw" discipline is the right one here.
- **Strip any inbound `x-sovereign-surface` header before injecting.** Same
  requirement as the `x-sovereign-user-*` family.
- The client tier must live on its own subpath (`@sovereignfs/sdk/device-client`)
  for the reason `@sovereignfs/sdk/offline` already does: the main barrel
  transitively reaches server-only `next/headers`, and Next's boundary check
  flags the whole reachable module graph.
- `useDeviceEnvironment()` returns `null` before mount **deliberately** — it
  forces callers to handle "not known yet" instead of being handed a plausible
  default that flashes. Do not soften this into a default value.
- Add the hard rule to `docs/architecture-rules.md`: **surface never gates
  authorization.** This is the single most important artifact of this leg,
  because leg 5 builds a route lock on top of the signal and someone will
  eventually mistake it for a boundary.
- Epic tasks 17.7 and 20.3 extend this module later. Leave the extension seams
  obvious rather than closing the design around today's three values.
- `useIsMobile` in `packages/ui` is untouched — it answers a viewport question.

**Do not proceed if:** surface-varying SSR turns out to be needed in this leg.
It is not (nothing here branches SSR on surface), but if a task drifts into it,
RFC 0080 §5's per-cache service-worker keying decision must be made and recorded
first — a surface-varying document served from a surface-agnostic cache is a
replay bug.

### Leg 3 — Per-plugin installable PWA

**Epic tasks:** 2.25, then 2.26

**Status (August 2026): fully shipped — 2.25 at platform `0.84.0`, 2.26 at
`0.85.0`.** `scripts/generate-registry.ts`'s `copyPluginIcons()` now
rasterizes a real 192/512/maskable-512 set from `icon` at build time
(`sharp`, following `scripts/generate-splash.ts`'s pattern), with
per-variant author-supplied overrides via the new `icons` manifest field;
`installable: true` requires `icon` or `icons` (schema-validated, a build
error rather than a broken install prompt). `apple-touch-startup-image`
remains permanently omitted on an installed plugin's routes — that was
never 2.26's scope (icon generation, not splash generation) — rather than
showing the _instance's_ wrong-brand splash; still deliberate, not an
oversight, just no longer attributed to a "pending task."

Two real bugs were found and fixed via live testing while implementing this
leg, not caught by unit tests alone — both worth reading before touching
this area again:

1. **Login containment's `returnUrl`** (2.25): fixed by reading it
   server-side in `login/page.tsx` rather than via `LoginForm`'s
   `useSearchParams()` client hook, which a middleware rewrite's target
   query string never reaches. Full account in this leg's earlier note,
   preserved below the technical notes.
2. **Plugin manifest icons were session-gated while the manifest
   referencing them wasn't** (2.26): `runtime/middleware.ts`'s matcher
   excluded `icons/` (the instance-level default set) but not
   `plugin-icons/` (the per-plugin set this leg added), so an unauthenticated
   icon fetch 303-redirected — and most browsers don't follow a redirect
   when fetching a manifest icon for an installability check, so this could
   have silently prevented the install prompt from ever appearing, with no
   other symptom. Confirmed live with `curl` against a running instance
   before the matcher entry was added. See `docs/architecture-rules.md`'s
   PWA rule for the permanent statement of this requirement.

**Technical notes:**

- Extend the **existing** `runtime/app/api/manifest/route.ts` into a
  `[pluginId]` segment. Reuse its instance-config lookup and its
  degrade-gracefully-on-DB-failure behavior; do not write a parallel route.
- `manifest` is already in `RESERVED_API_SEGMENTS` and already excluded from the
  middleware matcher (`runtime/middleware.ts:519`) precisely because browsers
  fetch manifests before login. That exemption is why this location was chosen —
  document the justification in the route's doc comment.
- **The Apple tags are the easiest thing here to miss and the most visible when
  missed.** iOS resolves the home-screen icon from `apple-touch-icon` and the
  launch image from `apple-touch-startup-image` — document head tags, not
  manifest entries. Without per-plugin values an installed Tally wears the
  Sovereign icon and flashes white on launch. `scripts/generate-splash.ts` is the
  existing precedent for generating these.
- **Login containment is a real bug, not a nicety.** With `scope: /tally`,
  redirecting to `/login` leaves scope. Generalize the existing `/` special case
  at `runtime/middleware.ts:320` — **rewrite**, do not redirect, for the reason
  its comment already records. Post-login must return to the plugin route, not
  `/`.
  - **A second, less obvious bug hides directly behind this one — found live,
    not by inspection.** "Rewrite, then set `returnUrl` on the rewrite
    target" sounds sufficient, and the code compiles and type-checks either
    way, but it silently fails if `/login`'s form reads `returnUrl` via
    `useSearchParams()` (a client hook bound to the browser's _visible_
    address bar) — a rewrite never changes that bar, so the hook sees no
    query string at all, and every post-login navigation quietly lands on
    `/` regardless of where the user started. Confirmed by driving the exact
    flow in a real browser: sign out, cold-GET an installable plugin's
    route, sign in, watch where it lands. It landed on `/` until
    `runtime/app/login/page.tsx` was changed to read `returnUrl` from its
    own server-side `searchParams` prop (which _does_ see the rewritten
    request) and pass it down as an explicit prop instead. The ordinary
    303-redirect path for every other gated route was never affected — the
    browser's address bar genuinely changes there, so the client hook was
    already correct for that case. **Anything that reaches `/login` via a
    middleware rewrite (not just this leg's case) must go through the
    server-side prop, not the client hook — future changes to this page
    should preserve that.**
- Do not register a second service worker, and do not change the existing one's
  scope. Manifest `scope` is navigation containment; SW registration is
  independent.
- Flag the generated-icon assets for Docker: new served-asset path, `.dockerignore`,
  and the `generate` step.

**Adopt with two plugins, not one** — per research 0005's de-risking
recommendation. One platform plugin (Launcher is already offline-capable) and one
real app.

**Do not proceed if:** a generated maskable icon looks broken on Android. Resolve
the background-plate question (RFC 0081 open question 1) before declaring the leg
done, rather than shipping an install prompt that produces an ugly springboard
icon.

### Leg 4 — Offline append-only reference plugin

**Epic tasks:** none yet — requires a new task under Epic 12 (Example
Plugins), alongside the existing `example-device-only` (RFC 0093) and
`example-mobile` reference plugins in `example-plugins/`.

**Redesigned from the original plan.** The original leg routed this through
Tally, a plugin outside this monorepo's own versioning and task tracking.
That coupled this workstream's definition of done to a separate repo's own
schedule, and put the append-only design, the pending-sync UI requirement,
and RFC 0078 §5's audit reasoning in a doc that couldn't be checked against
code living here. Leg 4 now ships as an in-repo **reference plugin** under
`example-plugins/`, built, reviewed, and tested in this repository like every
other example — usable afterward as a working precedent by any plugin, in
this repo or outside it, without this workstream depending on that plugin's
own repo, roadmap, or review cycle.

**Technical notes:**

- **Append-only. This is a locked decision, not a starting point.** The
  reference plugin's writable resource should be a minimal add-only list —
  e.g. "add item" plus "add comment on an item," enough to exercise a
  dependent-table relationship without needing a real domain. Offline
  mutations queue with client-minted ULIDs and
  `INSERT ... ON CONFLICT (id) DO NOTHING`. Edit, delete, and any
  settle/finalize-style operation are online-only. Do not adopt RFC 0078's
  LWW path here — row-level LWW across dependent tables can land one edit's
  change to a total and another edit's change to its parts, desyncing a
  derived value from what it's derived from and silently corrupting it. The
  reference plugin exists specifically to demonstrate the safe alternative,
  not to reproduce that bug class in miniature.
- Because writes are inserts only, **no `updatedAt` column and no audit of
  existing online write paths is required** — the expensive, easy-to-miss part
  of RFC 0078 §5 does not apply. This is the main reason append-only was
  chosen, and the reference plugin's own README should say so, since that's
  the lesson a future plugin author is meant to take from it.
- Manifest `offline: "offline-first"` (the tiered enum — not `"device-only"`,
  which never talks to the server and already has its own reference plugin
  in `example-device-only`). The rewrite target is a user-neutral shell with
  client hydration: render cached immediately, always fire a live fetch in
  parallel, update view and cache on success.
  `plugins/launcher/app/_components/LauncherOfflineView.tsx` is the reference
  pattern to follow, not re-derive independently.
- Mutations go through a JSON Route Handler, not a Server Action, because a
  Server Action cannot be queued and replayed, and because a Route Handler is
  what a future native client could call. This distinction is itself one of
  the plugin's main teaching points for plugin developers.
- If the reference plugin surfaces any derived/aggregate value (a count, a
  running total), it must make pending-sync state visible in the UI rather
  than presenting a partially-synced value as settled — a partially-synced
  client can legitimately show a different number than a fully-synced one,
  and hiding that is exactly the failure class this leg exists to catch
  before a higher-stakes plugin (financial, multi-party, or otherwise) ships
  it for real.
- Keep the offline-served surface to a single bare route (RFC 0078 §2's
  accepted tradeoff) — nested per-item views become client-side view
  switching inside that one shell, not separately SW-cached routes.

**Do not proceed if:** the shipped purge turns out to discard un-synced additions
without warning the user. RFC 0078 §7 left open whether a confirmation prompt
should precede the destructive purge, calling it "a product decision, not an
engineering one"; the queue shipped with the purge wired at both sign-out and
sign-in. Verify what it actually does before calling this leg done — silently
dropping a queued write is exactly the failure mode this reference plugin
exists to catch before any real, higher-stakes plugin copies the pattern.

### Leg 5 — Focused native app

**Epic tasks:** 2.27, then 20.11, then 20.12

**Status (August 2026): 2.27 shipped at platform `0.82.0`; 20.11/20.12 not
started.** The runtime half of this leg — `x-sovereign-focus-plugin` parsing
(extends RFC 0080's existing `Sovereign-Shell/...` User-Agent token rather
than a second grammar, `runtime/src/surface.ts`) and the route lock itself
(`runtime/src/route-lock.ts`'s `decideFocusRoute()`, wired into
`runtime/middleware.ts`) — was implementable and independently testable
against synthetic User-Agent headers without `sovereign-mobile` existing
yet, per the ordering note in this doc's changelog. `sovereign-mobile` now
exists with a substantially-implemented shell (epic 20.1), but that task is
not yet signed off in its own repo (real device verification and Android
back-navigation reliability still open there), and leg 1 (task 20.10, this
workstream's gate) still has two open items of its own — see that leg's
status note. 20.11 and 20.12 remain blocked on both.

**Depends on:** leg 1 (gate, not yet cleared), legs 2 and 3 (done), and epic
20.1 (substantially implemented, not yet signed off — the remaining unmet
prerequisite; epic 20.2 shipped).

**Technical notes:**

- The route lock is the highest-churn surface in this workstream. Start from
  RFC 0082 §3's allowlist and expect to extend it. Known entries that are easy
  to forget: `/account` — needed for password change, session revocation, **and
  `data:provide` consent**, which any offline-writing plugin using leg 4's
  pattern may require and which lives in Account → Data; and `/paywall/*`,
  which middleware already redirects to.
- Out-of-focus routes **redirect to the focused plugin root, not 404** — the
  content exists and the user is entitled to it.
- Re-state in code comments that the lock is not a security boundary. The
  `architecture-rules.md` entry from leg 2 is the canonical statement.
- Build targets go **inside `sovereign-mobile`**; the whole-instance app is the
  target with no `focusPlugin`. One navigation policy, one onboarding flow, one
  instance switcher.
- Instance validation must check the **target plugin** is installed, enabled, and
  surface-compatible — not merely that the URL is a Sovereign instance.
- Sign-out must drive the platform's own flow so `offline.clearAll()` and the
  queue purge still fire. A native sign-out that only clears native storage
  leaks the previous user's cached data and un-synced writes on a shared device.

**Do not proceed if:** the store rationing policy (RFC 0082 §7) has not been
written. Publishing the first focused app without a stated policy is how N
unmaintained store listings happen.

## Risks

- **Route-lock allowlist churn** — the only genuinely new runtime mode here, and
  new modes accrete edge cases. Contained and iterative, but expect two or three
  passes rather than one.
- **Store presence multiplication** — N apps means N listings, N review cycles,
  N privacy declarations, N signing identities, and 1–2 weeks of review latency
  on every shell fix. Not an architecture problem; mitigated by policy (leg 5)
  and by making leg 3 the default answer for most plugins.
- **iOS data eviction** — `WKWebsiteDataStore` can be purged under storage
  pressure. A slow cold start for reads; silent data loss for un-synced writes.
  Leg 1 measures it; leg 4's pending-sync indicator surfaces it; native storage
  via `sdk.device.*` is the eventual fix.
- **RFC 0078's hardening curve** — `CLAUDE.md` records that RFC 0071's
  encryption needed three passes including a production incident. RFC 0078 shares
  its profile (cross-cutting data layer, client/server reconciliation, a
  destructive purge path). Expect the same, which is why the queue hardens on
  Shopper first and leg 4's reference plugin stays append-only.
- **The `offline` manifest field has changed shape twice since this workstream
  was drafted** (boolean → tiered enum: `"offline-first" | "device-only"`,
  workstream 0008 leg 3) with `example-device-only` as its first real
  `device-only` adopter. Leg 4 is the first reference plugin to exercise the
  `"offline-first"` tier's actual sync-queue path end to end; treat unexpected
  behavior there as the field/queue combination being immature rather than as
  the reference plugin's own design being wrong.
- **`sdk.device.*` has two pending consumers** (epic tasks 17.7, 20.3) written
  before its base existed. Leg 2 should reconcile their assumptions rather than
  let three environment models coexist.

## Kill criteria

**If leg 1 fails** (no reliable service worker in the Capacitor WebView): stop
before leg 5. Legs 2–4 are unaffected and deliver real value on their own — an
installable, offline, focused per-plugin app experience on every platform that
supports PWAs, plus a surface model the desktop shell can use immediately.
RFC 0082 returns to design; RFCs 0079 and 0080 stand.

**If the store rationing policy cannot be agreed:** stop after leg 4. The PWA
rung is the product; native distribution is an amplifier, not a prerequisite.

**If the reference plugin's append-only model proves insufficient in
practice:** that is a finding for a follow-up RFC on offline conflict
resolution for multi-user/multi-party data, not a licence to adopt LWW
mid-leg.

In every case the workstream is designed so that stopping early leaves shipped,
coherent value rather than half a feature.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0.2     | August 2026 | Status: Planned → In progress. RFC 0082 accepted; leg 1's spike has run. Epic task 2.27 (leg 5) promoted into ROADMAP.md at slot `0.70.0` ahead of legs 2–3 completing — a deliberate ordering choice, not a dependency change; 20.11/20.12 still gate on 20.1/20.10 finishing regardless of version-slot placement.                                                                                                                                                                                                                                                |
| 0.3     | August 2026 | Corrected drift between this doc and actual status: leg 1 (research 0008) had substantive findings not reflected here, and epic 20.2 had shipped. **Leg 4 redesigned**: dropped the dependency on an external plugin repository entirely; it now ships as an in-repo `example-plugins/` reference plugin (Epic 12), so this workstream's definition of done no longer depends on any repo outside this monorepo's own control, versioning, or review cycle. All Tally-specific references in the Decisions table, Risks, and Kill criteria generalized accordingly. |
| 0.4     | August 2026 | Leg 1: `sdk.offline` IndexedDB persistence across app restart confirmed live (research 0008), closing the previously-open credential-gated item — a human supplied login credentials in the simulator panel, an agent drove the build, the hard restart, and the on-disk storage inspection that provided the actual evidence. Only `WKWebsiteDataStore` eviction under storage pressure remains open on this leg, and it's a time/simulation problem, not an access problem.                                                                                       |
