# Workstream 0001 — Standalone plugin apps

**Status:** ⏳ In progress\
**Date:** July 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0080](../rfcs/0080-plugin-surface-model.md) (surface model),
[0081](../rfcs/0081-per-plugin-installable-pwa.md) (per-plugin installable PWA),
[0082](../rfcs/0082-focused-plugin-app-shell.md) (focused plugin app shell)\
**Epics touched:** 2 (Platform Shell), 3 (Plugins Runtime), 20 (Mobile), plus
the `sovereign-tally` plugin repository\
**Research:** [0006](../research/0006-standalone-plugin-apps.md)

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

- [ ] Any plugin can declare `installable: true` and be installed from a browser
      as its own home-screen app, with its own name, icons, and scope.
- [ ] An installed plugin app cold-launches offline and renders cached data.
- [ ] An installed plugin app can be signed into without leaving its scope.
- [ ] Plugins can gate features and UI on surface (`browser` / `mobile` /
      `desktop`) server-side with no hydration flash, and on installed-PWA state
      client-side.
- [ ] A plugin can declare which surfaces it is available on, and the platform
      filters presentation accordingly.
- [ ] Tally supports offline viewing plus offline **add** of expenses and
      comments, syncing on reconnect.
- [ ] One focused native app is published from `sovereign-mobile` build targets,
      with the whole-instance app still building from the same codebase.
- [ ] `docs/plugin-development.md` documents `installable`, `surfaces`, and
      `sdk.device.*` as generic platform capabilities.
- [ ] The written rationing policy for store-published plugin apps exists
      (RFC 0082 §7).

## Decisions locked

Settled in a design session with kasunben, July 2026. Recorded so they are not
reopened mid-execution — full reasoning in research
[0006](../research/0006-standalone-plugin-apps.md).

| Decision                     | Choice                                                                | Rejected alternative, and why                                                                                            |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Overall shape                | Ladder: installable PWA first, focused native shell second            | Native UI + plugin REST API — forks every plugin into two implementations; same reason RFC 0058 rejected React Native    |
| Plugin API surface           | None new; WebView uses existing Server Actions                        | A REST API per plugin — unnecessary for a WebView, and the only new endpoint (offline sync) RFC 0078 already requires    |
| Surface mechanism            | Server-injected `x-sovereign-surface` **plus** `sdk.device.*`         | Client-only detection (hydration flash); `NEXT_PUBLIC_*` (build-time inlining); capability-system reuse (category error) |
| Feature flags                | None. Surface + capability only                                       | General flag service with targeting/percentages — single-tenant self-hosted, no fleet to roll out across                 |
| Operator flags               | Not built                                                             | `PlatformConfig` booleans + Console UI — no concrete need; don't ship a settings surface nobody asked for                |
| Focused app scope            | Hard lock to the plugin's `routePrefix`                               | Soft lock (chrome-less but freely navigable) — a Tally app should not be a browser into the whole instance               |
| Lock trust level             | **Presentation/UX only, never a security boundary**                   | Treating it as access control — the signal is a spoofable User-Agent                                                     |
| Bearer-token plugin API      | Deferred, explicitly additive                                         | Ruling it out (forecloses CLI/third-party clients); or including it now (would make native plugin UIs tempting)          |
| Native auth                  | Cookie-in-WebView for v1; OAuth refresh token + keychain named sequel | OAuth-first now — blocked on RFC 0072's per-instance admin-only client registration                                      |
| Tally offline writes         | **Append-only** (add expense, add comment). Edit/delete/settle online | RFC 0078's LWW — row-level LWW across expense/payers/shares can desync shares from amount and silently corrupt balances  |
| Queue first adopter          | Shopper (single-user)                                                 | Tally — a multi-member financial ledger is the wrong place to harden a new mutation queue                                |
| Shell repository             | Build targets inside `sovereign-mobile`                               | A repo per plugin app, or a separate generic shell repo — guarantees divergence, multiplies store tooling                |
| Per-plugin manifest location | `/api/manifest/<pluginId>` (already session-exempt)                   | `/<routePrefix>/manifest.webmanifest` — session-gated, so a logged-out browser never gets an install prompt              |
| `installable` vs `offline`   | Separate manifest fields                                              | Deriving one from the other — independent concerns; Launcher is offline-capable and should not become installable        |
| Service worker               | One, unchanged, at `/`                                                | A second SW scoped per plugin — manifest scope is not SW scope; two SWs would overlap on the same origin                 |
| Workstream execution         | Legs — one branch, one draft PR, one review gate per leg              | Stacked per-task branches, or one giant PR per workstream                                                                |

## Prerequisites

| Prerequisite                                                     | Owner         | Status                              |
| ---------------------------------------------------------------- | ------------- | ----------------------------------- |
| RFC 0078 offline write queue (`@sovereignfs/sdk/offline-queue`)  | separate task | ✅ Shipped — no longer blocks leg 4 |
| RFC 0078 §7 logout/login purge wired                             | separate task | ✅ Shipped — both call sites        |
| `sovereign-mobile` repo exists with RFC 0058's shell (epic 20.1) | epic 20       | 📋 — **blocks leg 5**               |
| Instance validation endpoint (epic 20.2)                         | epic 20       | 📋 — **blocks leg 5**               |

Legs 1–4 depend on none of these and can start immediately — the offline write
queue shipped, so only leg 5 still has an unmet prerequisite.

## Legs

| Leg | Name                       | Epic tasks         | Epics | Gate?   | Done when                                                              |
| --- | -------------------------- | ------------------ | ----- | ------- | ---------------------------------------------------------------------- |
| 1   | WKWebView offline spike    | 20.10              | 20    | **Yes** | Service-worker + IndexedDB behavior in a real Capacitor build is known |
| 2   | Surface model              | 3.32, 3.33         | 3     | No      | Plugins can gate on surface server-side and declare `surfaces`         |
| 3   | Per-plugin installable PWA | 2.25, 2.26         | 2     | No      | Two plugins install as their own home-screen apps                      |
| 4   | Tally offline adoption     | _external repo_    | —     | No      | Tally works offline read + append, syncing on reconnect                |
| 5   | Focused native app         | 2.27, 20.11, 20.12 | 2, 20 | No      | One focused app builds and passes store review                         |

## Leg detail

### Leg 1 — WKWebView offline spike (gate)

**Epic tasks:** 20.10

**Why this leg is first:** it is the cheapest leg and carries the most
information. Research 0005 identifies WKWebView's service-worker behavior as the
plan's least-verified assumption, and it gates the most expensive leg. A negative
result reshapes the workstream before anything is invested in it.

**Technical notes:**

- Service workers require an `https` document. Point Capacitor's `server.url` at
  a real instance. **Bundling assets behind the `capacitor://` custom scheme
  yields no service worker at all** — confirm this rather than assuming it, since
  it is the constraint the whole offline story rests on.
- Verify all four layers, not just registration: SW registration; `offline-shells`
  document caching; `sdk.offline` IndexedDB persistence across app restart; and
  survival of a background/foreground cycle.
- Probe the eviction limitation deliberately — how does the data store behave
  under simulated storage pressure and after prolonged non-use? This determines
  how loudly the pending-sync indicator in leg 4 needs to shout.
- Android System WebView is expected to be unproblematic; verify anyway so the
  result covers both platforms.

**Deliverable is a written finding**, appended to research 0005 or as its own
short research doc — not code. The spike branch is disposable.

**Do not proceed if:** service workers are unavailable or unreliable in the
Capacitor WebView. In that case stop, record the finding, and re-open RFC 0082
§4 rather than proceeding to leg 5. Legs 2–4 are unaffected and still ship.

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

**Status (August 2026): 2.25 shipped at platform `0.84.0`.** 2.26 (real
per-plugin icon rasterization) remains open — the plugin's own `icon.svg` is
used directly as a placeholder manifest icon and `apple-touch-icon` for now
(`runtime/src/plugin-manifest.ts`), and `apple-touch-startup-image` is
omitted entirely on an installed plugin's routes rather than showing the
_instance's_ wrong-brand splash. Both are documented, deliberate, temporary
gaps closed by 2.26, not oversights. One real bug was found and fixed while
implementing login containment (see the note below the technical notes) —
worth reading before touching this area again.

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

### Leg 4 — Tally offline adoption

**Epic tasks:** none in this repository — `sovereign-tally` has its own
versioning and its own task tracking. Referenced here because the workstream's
definition of done depends on it.

**Technical notes:**

- **Append-only. This is a locked decision, not a starting point.** Add expense
  and add comment queue offline with client-minted ULIDs and
  `INSERT ... ON CONFLICT (id) DO NOTHING`. Edit, delete, and settle stay
  online-only. Do not adopt RFC 0078's LWW path for Tally — row-level LWW across
  `tallyExpenses` / `tallyExpensePayers` / `tallyExpenseShares` can land the
  amount from one edit and the shares from another, desyncing an expense's shares
  from its total and silently corrupting every member's balances.
- Because writes are inserts only, **no `updatedAt` column and no audit of
  existing online write paths is required** — the expensive, easy-to-miss part of
  RFC 0078 §5 does not apply. This is the main reason append-only was chosen.
- The rewrite is the real work: `app/page.tsx` and `app/[groupId]/page.tsx` are
  per-user SSR today and must render a user-neutral shell with client
  hydration. `plugins/launcher/app/_components/LauncherOfflineView.tsx` is the
  reference pattern — render cached immediately, always fire a live fetch in
  parallel, update view and cache on success.
- Mutations move from Server Actions (`app/_lib/actions.ts`) to a JSON Route
  Handler, because a Server Action cannot be queued and replayed, and because a
  Route Handler is what a future native client could call.
- Balances are **derived** (`computeNetBalances`, `simplifyDebts`), so a
  partially-synced client shows different numbers to different members. The UI
  must make pending-sync state visible rather than presenting provisional
  balances as settled.
- Only the bare `/tally` route is SW-served offline (RFC 0078 §2's accepted
  tradeoff), so nested group views become client-side view switching inside one
  shell.

**Do not proceed if:** the shipped purge turns out to discard un-synced additions
without warning the user. RFC 0078 §7 left open whether a confirmation prompt
should precede the destructive purge, calling it "a product decision, not an
engineering one"; the queue shipped with the purge wired at both sign-out and
sign-in. Verify what it actually does before Tally relies on it — silently
dropping a queued expense is data loss in a financial ledger, and Tally should
not be the plugin that discovers it.

### Leg 5 — Focused native app

**Epic tasks:** 2.27, then 20.11, then 20.12

**Status (August 2026): 2.27 shipped at platform `0.82.0`.** The runtime half
of this leg — `x-sovereign-focus-plugin` parsing (extends RFC 0080's
existing `Sovereign-Shell/...` User-Agent token rather than a second
grammar, `runtime/src/surface.ts`) and the route lock itself
(`runtime/src/route-lock.ts`'s `decideFocusRoute()`, wired into
`runtime/middleware.ts`) — was implementable and independently testable
against synthetic User-Agent headers without `sovereign-mobile` existing
yet, per the ordering note in this doc's changelog. 20.11 and 20.12 remain
blocked on the unmet prerequisites in the table above (`sovereign-mobile`
repo + RFC 0058 shell, epic 20.1) — nothing to build the actual focused
target against yet.

**Depends on:** legs 1 (gate), 2, 3, and the epic 20.1/20.2 prerequisites.

**Technical notes:**

- The route lock is the highest-churn surface in this workstream. Start from
  RFC 0082 §3's allowlist and expect to extend it. Known entries that are easy
  to forget: `/account` — needed for password change, session revocation, **and
  `data:provide` consent**, which Tally requires and which lives in Account →
  Data; and `/paywall/*`, which middleware already redirects to.
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
  Shopper and Tally stays append-only.
- **The flat `offline: boolean` is new** (landed `4d9ab5a`) with one trivial
  adopter. Leg 4 is its first real test; treat unexpected behavior as the field
  being immature rather than as Tally being wrong.
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

**If Tally's append-only model proves insufficient in practice:** that is a
finding for a follow-up RFC on offline conflict resolution for multi-user
ledgers, not a licence to adopt LWW mid-leg.

In every case the workstream is designed so that stopping early leaves shipped,
coherent value rather than half a feature.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                               |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft                                                                                                                                                                                                                                                                                                        |
| 0.2     | August 2026 | Status: Planned → In progress. RFC 0082 accepted; leg 1's spike has run. Epic task 2.27 (leg 5) promoted into ROADMAP.md at slot `0.70.0` ahead of legs 2–3 completing — a deliberate ordering choice, not a dependency change; 20.11/20.12 still gate on 20.1/20.10 finishing regardless of version-slot placement. |
