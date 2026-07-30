# Research 0005 — Standalone plugin apps and surface-aware features

**Status:** Decided\
**Date:** July 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Scope:** `runtime`, `packages/sdk`, `packages/manifest`, `sovereign-mobile`
(future repo), `docs/`\
**Related:** RFC 0013 (mobile responsiveness & PWA), RFC 0038 (desktop app
shell), RFC 0058 (native mobile app shell), RFC 0072 (external OAuth/OIDC
provider), RFC 0074 (offline-capable plugin routes), RFC 0075 (per-plugin
mobile chrome toggle), RFC 0078 (generic offline read+write for plugins)

---

## Question

Two related questions, explored together because they share one mechanism:

1. Can an individual plugin ship as a **standalone mobile app** (iOS and
   Android) that loads only that plugin's functionality, keeps the user's
   Sovereign instance as the backend and web interface, defaults to a primary
   instance while allowing the URL to be changed, and works offline — on the
   same model already planned for the whole-instance Sovereign mobile app?
2. Given features and UI elements that should exist only on some **surfaces**
   (installed PWA, Capacitor mobile shell, Tauri desktop shell, plain browser
   tab), what mechanism gates them? The platform has no feature-toggle
   implementation of any kind today.

## Findings

### Auth is further along than expected

- **RFC 0072 is Implemented.** `apps/auth` is a full OAuth 2.0 / OIDC provider
  via `@better-auth/oauth-provider`: `/oauth2/authorize`, `/token`,
  `/userinfo`, `/.well-known/jwks.json`, admin-registered clients with
  exact-match redirect URIs, and a Console registration/rotation UI. The
  hard part of native-app auth already exists.
- **But plugin surfaces are cookie-only.** `sdk.auth.getSession()`
  (`packages/sdk/src/auth.ts:13-34`) reads runtime-injected
  `x-sovereign-user-*` headers, which `runtime/middleware.ts:304` populates
  after verifying better-auth's signed `session_data` cookie cache (falling
  back to `/api/verify`). There is no per-user bearer token or PAT path into a
  plugin. `SOVEREIGN_ADMIN_KEY` is server-to-server only.
- RFC 0072's stated non-goal is that its tokens carry identity only — no
  `sdk.*` access.

### Plugin-owned JSON APIs need no new platform mechanism

A plugin may add ordinary Route Handlers under its own `routePrefix`, gated by
the normal session middleware — Tally already does
(`sovereign-tally.local/app/export/[groupId]/route.ts`). So `/tally/api/sync`
works today with zero RFC.

The `apiProvider: true` mechanism (`packages/manifest/src/schema.ts:173`,
`runtime/src/api-namespace.ts`) is **not** the tool for this: it delegates the
public `/api/*` namespace to exactly **one** provider plugin per instance,
exempt from the session gate. No plugin declares it today. It does not
generalize to "every plugin exposes its own API."

### The offline stack is already client-app-shaped, but writes do not exist

- Reads work end to end: `runtime/src/registry.ts:37` filters plugins on the
  flat `offline === true`; a dedicated `offline-shells` Workbox cache
  (`StaleWhileRevalidate`, ahead of the general `pages` `NetworkFirst`) serves
  the document; `runtime/middleware.ts:474` sets `x-sovereign-offline-route`;
  `runtime/app/(platform)/layout.tsx:50` renders a user-neutral shell and
  re-hydrates personalized chrome client-side (`hydrate={isOfflineRoute}` on
  `SidebarPluginIcons` and `AdminConsoleIcon`) — which resolves RFC 0078's
  open question 4.
- `plugins/launcher/app/_components/LauncherOfflineView.tsx` is the reference
  pattern: render cached data immediately, always fire a live fetch in
  parallel, update view and cache on success.
- **Writes now exist** — `packages/sdk/src/offline-queue.ts` shipped while this
  research was being written, exposing `offlineQueue`, `drainQueue`,
  `categorizeOutcomes`, `QueuedMutation`, and `OfflineQueueFullError` on the
  dedicated `@sovereignfs/sdk/offline-queue` subpath. RFC 0078 §7's logout/login
  purge is wired at both sites (`runtime/src/complete-sign-in.ts:32` and
  `runtime/app/(platform)/_components/AccountMenu.tsx:168`), resolving that RFC's
  open question. **This removes the blocking prerequisite the ladder below
  originally carried**, but it does not change this doc's recommendation about
  _which_ writes Tally should adopt — see "Tally is a poor first adopter of
  RFC 0078's LWW writes" below, which is about conflict semantics, not
  availability.
- The flat `offline: boolean` landed in commit `4d9ab5a` — one commit before
  this research. Its current form has effectively no mileage, and Launcher is
  its only adopter.

### Tally is a server-rendered, Server-Action plugin

Two pages (`app/page.tsx`, `app/[groupId]/page.tsx`), all mutations as Server
Actions in `app/_lib/actions.ts`, one Route Handler for CSV export. Adopting
the RFC 0074/0078 offline model is a substantial rewrite of Tally, not a
manifest flag.

### There is no feature-flag or surface-detection mechanism

- `packages/sdk/src/device.ts` **does not exist**. `sdk.device.*` is promised
  by RFC 0058 and RFC 0038 and scheduled as epic tasks 17.7 and 20.3, both
  still 📋.
- No feature-flag, feature-gate, or toggle code anywhere in the repo.
- `useIsMobile` (`packages/ui`) is a **viewport** hook, not a surface
  detector — widely used by `DatePicker`, `ContextMenu`, `Combobox`, `Menu`,
  `HoverCard`.
- What does exist and is adjacent: capabilities (`runtime/src/capabilities.ts`,
  pure role→capability, Edge-resolvable), per-user grants with an explicit
  allowlist (RFC 0070), DB-backed instance settings via `getConfig()`
  (`packages/sdk/src/types.ts:88-107`), and `compatibility.minPlatformVersion`
  (RFC 0024).
- Shell chrome control already exists: `shell: 'default' | 'minimal' |
'overlay'` plus `shellConfig.mobileHeader`/`mobileFooter`
  (`packages/manifest/src/schema.ts:160-172`, RFC 0075).

### Two constraints that shape any design

- **`NEXT_PUBLIC_*` is unusable** for surface detection — Next inlines it at
  build time and Docker images build without `.env`, so the value freezes to
  its fallback (hard rule, `CLAUDE.md`).
- **Client-side globals cannot be read in render** — `'use client'` components
  must not read browser globals in a `useState` initializer or during render
  (hydration mismatch, hard rule). So client-side surface detection means
  `useEffect` plus a safe default, i.e. **a visible flash of the wrong UI**.
  Acceptable for progressive enhancement, not for gating whole elements.

## Options considered

### For standalone plugin apps

| Option                                                 | Verdict                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| **0. Per-plugin installable PWA**                      | **Accepted** — first rung                                   |
| **A. Focused WebView shell** (parameterized Capacitor) | **Accepted** — second rung                                  |
| B. Native app + plugin REST API                        | **Rejected** — forks every plugin into two implementations  |
| D. Bearer-token plugin API                             | **Deferred, named** — additive later, not needed for 0 or A |

**Option B rejected on the project's own thesis.** "The plugin system _is_ the
product" and plugins are meant to run unchanged across browser, PWA, and
native. B means every feature ships twice — the same reason RFC 0058 rejected
React Native. It is also unnecessary: in a WebView the plugin's existing
Server Actions work as-is, and the only new endpoint (offline sync) is one
RFC 0078 already requires regardless of mobile.

**Why A is low-risk:** it adds **no new architectural bet**. The
"native shell loads the remote instance in a WebView" decision is already made
(RFC 0058) and already shipped in Tauri (`sovereign-desktop`, epic 17.1 ✅).
A focused plugin app is a parameterization of that decision. The shell stays
dumb — a URL, a route prefix, an icon, a scheme — and every interesting
surface stays in the runtime.

### For surface-aware features

Four things hide under "feature toggle", and they have different owners and
lifetimes:

| Concern           | Question                                          | Lifetime         | Owner          |
| ----------------- | ------------------------------------------------- | ---------------- | -------------- |
| **Surface**       | Capacitor / Tauri / installed PWA / browser tab?  | permanent        | ambient fact   |
| **Capability**    | camera / biometrics / push available?             | permanent, grows | ambient fact   |
| **Operator flag** | has the admin enabled feature X on this instance? | permanent        | instance admin |
| **Rollout flag**  | ship dark, enable for 10%?                        | temporary        | release eng    |

| Option                                                       | Verdict                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| **1. Build `sdk.device.*` as already specified**             | **Accepted** — combined with 2                                 |
| **2. Server-injected surface header + manifest declaration** | **Accepted** — combined with 1                                 |
| 3. Operator flags in `PlatformConfig`                        | Right tool, wrong problem — not adopted now (no concrete need) |
| 4. Extend the capability system                              | **Rejected** — category error                                  |
| 5. General flag service with targeting rules                 | **Rejected** — no fleet to roll out across                     |

**Option 4 rejected deliberately**, because it is the most tempting: RFC 0021's
capability machinery is mature and Edge-resolvable, so reusing it looks free.
But capabilities answer _authorization_ ("is this user allowed") and surfaces
answer _availability_ ("does this environment support it"). Merging them
pollutes a security primitive with non-security concerns and produces checks
whose failure is ambiguous between "no permission" and "no camera".

**Option 5 rejected** because Sovereign is single-tenant self-hosted. There is
no fleet, so percentage rollout and targeting rules are pure complexity. This
is the category that generates most of a flag system's cost.

**Rollout flags are deleted from the problem entirely**, and operator flags are
left out until a concrete need appears rather than building a settings surface
nobody asked for.

## Recommendation

**Decided in session with kasunben (July 2026).**

1. **Ladder 0 → A**, in that order. Rung 0 validates the focused-app UX
   cheaply; rung A adds store distribution and native capability.
2. **Surface model = options 2 + 1 designed together** — a server-injected
   `x-sovereign-surface` signal plus `sdk.device.*` as the plugin-facing API,
   with an optional manifest `surfaces` declaration.
3. **Reject option B** (native + plugin REST API) and **option 4** (capability
   reuse). **Defer option D** (bearer-token API) as an explicitly additive
   sequel that nothing in 0 or A forecloses.
4. **Design the surface signal together with the focused-app route lock** —
   they are the same signal at the same middleware injection point. Building
   the lock first without the surface model means building the signal twice.

### Two-tier reality for surface detection

- **Server-knowable:** Capacitor and Tauri shells, because they control their
  User-Agent. Gate **layout and routing** here — no flash.
- **Client-only:** installed-PWA-ness. An installed PWA is the same engine
  hitting the same origin and cannot set a header; `display-mode: standalone`
  is irreducibly client-side. Gate **progressive enhancement** here, with a
  safe default.

Do not smuggle `display-mode` to the server via a cookie. That leads directly
to the next finding.

### Surface-varying SSR collides with the service worker

If a document renders differently per surface and the service worker caches
it, the wrong variant can be replayed — the same class of bug as the existing
hard rule keeping `pages` on `NetworkFirst` because pages are per-user SSR.
Any surface-varying SSR must either send `Vary`, key the cache on surface, or
keep the difference client-side. Decide explicitly; this is a six-months-later
bug otherwise.

## Findings that change the plan

### Tally is a poor first adopter of RFC 0078's LWW writes

RFC 0078 designed last-write-wins around Shopper — a single-user shopping
list. Tally is a **multi-member financial ledger**, and two problems follow:

- **Row-level LWW across a parent/child structure can produce an internally
  inconsistent expense.** An expense spans `tallyExpenses` +
  `tallyExpensePayers` + `tallyExpenseShares`. Two members editing the same
  expense offline can land the amount from one edit and the shares from the
  other, so shares no longer sum to the amount. `computeNetBalances`/
  `simplifyDebts` then consume it and every member sees wrong money, silently.
- **Balances are derived, so partial sync shows different numbers to different
  people.** Invisible for a shopping list; it is the entire product for
  "who owes whom".

**Recommended resolution:** Tally's data model is closer to an event log than
to mutable state. _Adding_ an expense or comment offline is naturally
conflict-free with client-minted ULIDs (`INSERT ... ON CONFLICT DO NOTHING`,
no LWW at all). _Editing and deleting_ is where LWW hurts. So offline Tally
should support **add expense + add comment + view cached**, with edit, delete,
and settle staying online-only. This covers the motivating case (log an
expense with no signal) and sidesteps the conflict-resolution risk surface
entirely.

**Corollary:** build `sdk.offline-queue` against Shopper, the single-user
plugin RFC 0078 was actually designed for, and let it take its hardening
passes there — where a bug costs a re-typed grocery item.

### Stability assessment

- **Stable:** rung 0 (additive, reversible); rung A's core bet (inherited, not
  invented); both deferrals (cookie→OAuth and the token API are additive and
  foreclose nothing); the coarse `offline: boolean` — splitting a coarse field
  later is the recoverable direction, and the painful churn already happened.
- **Highest-churn technical area:** the focused-app route lock. It is the only
  genuinely new runtime surface, and new runtime modes accrete allowlist edge
  cases. Known ones already: `/login`, `/account` (password change, session
  revocation), `/paywall/*`, deep links from email notifications, and — for
  Tally specifically — `data:provide` consent, which lives in Account → Data
  and is unreachable from a hard-locked app.
- **Highest-risk area overall, and not architectural:** store presence
  multiplication. N plugin apps means N listings, N review cycles, N privacy
  declarations, N signing identities, and 1–2 weeks of review latency on every
  shell fix. The code stays shared; the obligation does not. Mitigation is
  policy, not design — rung 0 is the default answer, rung A is reserved for
  flagship plugins.
- **Unverified assumption, cheapest to test:** WKWebView service-worker
  behavior. Service workers require an `https` document, so a Capacitor shell
  pointing `server.url` at the remote instance should work, while bundling
  assets behind the `capacitor://` custom scheme would yield **no service
  worker at all** and collapse the offline story. This has not been tested
  against a real Capacitor build and should be spiked before shell work
  starts.

### Known limitation worth naming rather than absorbing

iOS can evict `WKWebsiteDataStore` — IndexedDB and SW caches — under storage
pressure or prolonged non-use. For a read cache that is a slow cold start; for
an unsynced write queue it is silent data loss, which is exactly RFC 0078 §7's
concern. The eventual fix is native storage bridged through `sdk.device.*`;
the honest v1 position is a documented limitation.

### Calibration from this project's own history

`CLAUDE.md` records that RFC 0071's at-rest encryption is "still-settling, not
hardened" after bugs in three separate passes including a production incident.
RFC 0078 shares that risk profile: cross-cutting data layer, client/server
state reconciliation, documentation-first with no roadmap slot, and a
destructive path (purge-on-logout) that discards user data on failure. Expect
the offline write queue to need two or three hardening passes, not one, and
sequence accordingly.

## Open questions

1. Should Tally's offline support be **permanently** append-only, or does
   edit/delete get revisited once the queue is hardened elsewhere? Recommended
   position: decide on the merits later, do not inherit RFC 0078's LWW default.
2. Does the focused-app lock need a manifest opt-in per plugin, or is it purely
   a property of how a shell is built? Deferred to RFC 0082.
3. Whether an operator-facing feature-flag surface is ever needed. Left out
   until a concrete case appears.
4. How the OAuth-based durable session interacts with a published app's fixed
   `client_id` across arbitrary self-hosted instances — RFC 0072 registers
   clients per-instance, admin-only, with `allowDynamicClientRegistration:
false`, so every operator would hand-register a client. Needs either a
   well-known pre-registered client for official shells or a revisit of
   dynamic registration.

## Next steps

Graduates to three RFCs, split by what ships independently:

| RFC                                   | Designs                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| **0079 — Plugin surface model**       | `x-sovereign-surface`, `sdk.device.*`, manifest `surfaces`, the two-tier split |
| **0080 — Per-plugin installable PWA** | Rung 0: per-plugin webmanifest, scope, icons, session-gate and login edges     |
| **0081 — Focused plugin app shell**   | Rung A: parameterized Capacitor shell, route lock, auth, offline in a WebView  |

Execution order across epics is tracked as
[workstream 0001](../workstreams/0001-standalone-plugin-apps.md), because the
sequence cuts across epics 2, 3, and 20 and the dependency order matters more
than the per-epic grouping.
