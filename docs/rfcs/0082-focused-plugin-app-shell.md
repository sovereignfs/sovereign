# RFC 0082 — Focused plugin app shell (single-plugin native apps)

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `sovereign-mobile` (config-driven build targets in the repo RFC 0058
establishes — **not** a new repository), `runtime/middleware.ts` (focused-app
route lock), `runtime/app/(platform)/layout.tsx`, `docs/plugin-development.md`,
`docs/architecture-rules.md`, `docs/self-hosting.md`. Depends on RFC 0080
(surface model — supplies the signal) and RFC 0081 (per-plugin installable PWA —
validates the UX and supplies the icon/manifest work). Extends RFC 0058 (native
mobile app shell) and mirrors RFC 0038 (desktop shell). Builds on research
[0006](../research/0006-standalone-plugin-apps.md).\
**Incorporated into plan:** Yes — epic tasks 2.27, 20.10–20.12.

---

## Summary

Publish an individual plugin as its **own** native app for iOS and Android —
"Sovereign Tally" on the App Store — while the user's Sovereign instance
remains the backend, the web interface, and the source of truth. The app
defaults to a primary instance URL, lets the user change it, loads only that
plugin's functionality, and works offline.

It is built as an additional **build target inside `sovereign-mobile`**, not a
second codebase: the generic whole-instance Sovereign app and every focused
plugin app compile from one Capacitor shell parameterized by a config file
(app id, display name, icon set, default instance URL, target plugin id).

The plugin itself ships **once**. There is no native UI, no plugin REST API, and
no second implementation — the WebView loads the same routes a browser does, and
the plugin's existing Server Actions keep working unchanged.

## Motivation

Research 0005 established the demand: a user who lives in one app on their
instance wants that app on their home screen, from the store, with an icon and
a name that mean something — not a workspace they navigate into.

The critical constraint is that this must not fork the plugin ecosystem. "The
plugin system _is_ the product", and plugins are meant to run unchanged across
browser, PWA, and native. An approach where each plugin app bundles native UI
and talks to a plugin-specific REST API would mean every feature ships twice —
the same reason RFC 0058 rejected React Native.

The WebView approach avoids that entirely, and it adds **no new architectural
bet**: "native shell loads the remote instance in a WebView" is already decided
(RFC 0058) and already shipped in Tauri (`sovereign-desktop`, epic 17.1 ✅). A
focused plugin app is a parameterization of a decision the project has already
made and validated.

## Current state (what this builds on)

- **RFC 0058 defines the shell this extends**: `sovereign-mobile` with
  first-launch instance URL onboarding, a persistent ordered instance list,
  WebView loading, navigation policy, and multi-instance switching (epic tasks
  20.1–20.9, all 📋). This RFC adds build-target parameterization and the
  focused route lock; it does not redesign onboarding.
- **RFC 0038's desktop equivalent has shipped** (epic 17.1 ✅) — the same
  client model in Tauri, in the field today. Whatever this RFC establishes for
  focused apps should be portable to `sovereign-desktop` without redesign.
- **RFC 0080 supplies the signal.** Native shells identify themselves in the
  User-Agent; middleware normalizes it into `x-sovereign-surface`. This RFC
  extends that token with a focus component rather than inventing a parallel
  mechanism — the two are the same signal at the same injection point, which is
  why research 0005 required they be designed together.
- **RFC 0081 supplies the per-plugin app identity** — manifest, icons, scope,
  the login-containment rewrite. A focused native app and an installed
  per-plugin PWA want the same things; the native shell should not re-solve
  them.
- **Auth is cookie-based for plugin surfaces.** `sdk.auth.getSession()`
  (`packages/sdk/src/auth.ts:13-34`) reads runtime-injected headers populated by
  `runtime/middleware.ts:304` after verifying better-auth's signed
  `session_data` cookie cache. There is no per-user bearer token path.
- **RFC 0072 is Implemented** — `apps/auth` is a full OAuth 2.0/OIDC provider
  with `/oauth2/authorize`, `/token`, `/userinfo`, `/.well-known/jwks.json`,
  and admin-registered clients with exact-match redirect URIs. This is the
  foundation for the durable-session follow-up in §5, and its
  `allowDynamicClientRegistration: false` posture is the friction described
  there.
- **Offline is entirely web-stack** (RFC 0074/0078) and therefore inherited by
  any WebView unchanged — see §4.
- **`offline.clearAll()` purges on sign-out and sign-in**
  (`runtime/app/(platform)/_components/AccountMenu.tsx`,
  `runtime/src/complete-sign-in.ts`), which is what makes plugin-scoped rather
  than user-scoped IndexedDB keys safe on a shared device.
- **Tally declares `data:provide`** with four contracts, and cross-plugin
  consent is managed by the user in Account → Data
  (`packages/sdk/src/data.ts`). This is one of the concrete routes the lock
  must not strand — see §3.

## Proposed design

### 1. One shell, many build targets

`sovereign-mobile` gains a build-config layer. Each target is a small
declarative file:

```jsonc
{
  "appId": "fs.sovereign.tally.app",
  "displayName": "Sovereign Tally",
  "defaultInstanceUrl": "https://example.com",
  "focusPlugin": "fs.sovereign.tally",
  "icons": "./targets/tally/icons",
}
```

The generic whole-instance app is simply the target with no `focusPlugin`. This
keeps one navigation policy, one onboarding flow, one instance-switcher, and one
WebView lifecycle for every published app — a shell fix lands once.

**The shell stays dumb by design**: a URL, a target plugin, an icon, a scheme.
It owns no auth, no roles, no plugin permissions, no session model, and no UI
beyond onboarding and instance management. Everything interesting stays in the
runtime, which is where the project already iterates.

### 2. Focus signal

The shell extends RFC 0080's User-Agent token:

```
Sovereign-Shell/mobile-ios 1.0.0 (focus=fs.sovereign.tally)
```

`runtime/middleware.ts` parses it alongside the surface value and injects
`x-sovereign-focus-plugin`. As with every `x-sovereign-*` header, any inbound
value is stripped before the middleware injects its own.

### 3. Route lock — scope, not security

When `x-sovereign-focus-plugin` is present, the runtime serves only what the
focused app needs. Everything else redirects to the focused plugin's
`routePrefix` rather than 404ing — the content exists and the user is entitled
to it, it simply is not part of _this_ app, and a 404 would misdescribe that.

**Allowlist** (beyond the focused plugin's own prefix):

| Path                                                         | Why it must be reachable                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Sign-in happens in the WebView (§5)                                                  |
| `/account` and its subroutes                                 | Password change, session revocation, **and `data:provide` consent** (Account → Data) |
| `/paywall/*`                                                 | The middleware already redirects here for monetized plugins                          |
| `/offline`                                                   | The SW document fallback                                                             |
| `/api/*`                                                     | Route handlers, sync endpoints, auth proxy                                           |
| PWA/static assets                                            | Manifest, SW, Workbox, icons, `_next/static`                                         |

> **Hard rule (per RFC 0080 §2):** the focus signal derives from a
> client-controlled User-Agent and is trivially spoofable. The route lock is a
> **product-scoping and UX mechanism, never a security boundary.** Nothing
> behind it may rely on the lock for confidentiality — session, capability, and
> plugin-permission gates are unchanged and remain the only real boundaries.
> A user who edits their User-Agent to reach `/console` gets exactly the access
> their role already grants, which is the correct outcome.

Research 0005 named this the highest-churn area of the whole design: new runtime
modes accrete allowlist edge cases. The table above is the known set; the
implementation should expect to extend it, and every addition should be
justified in a comment rather than quietly appended.

**Deep links** into nested plugin paths (from an email notification, say) stay
within the focused plugin's prefix and are therefore allowed. Deep links to a
_different_ plugin redirect to the focused plugin root; the implementation
should consider handing those to the system browser instead, so a notification
about another app still works. Left open in §"Open questions".

### 4. Offline — inherited, with one load-bearing constraint

A focused app's offline behavior is **entirely the web stack** (RFC 0074/0078):
the same service worker, the same `offline-shells` cache, the same
`sdk.offline` IndexedDB, the same client-hydration pattern. Nothing about
offline is native-specific, and that is the payoff of this approach.

**The constraint that makes or breaks it:** service workers require an `https`
document. The shell must therefore load the remote instance via Capacitor's
`server.url`. Bundling web assets locally and serving them over the
`capacitor://` custom scheme yields **no service worker at all**, and the entire
offline story collapses. This is a stated, tested constraint of the shell
design — not a default to be flipped later for startup-time reasons.

Research 0005 flags this as the plan's least-verified assumption. **A spike
against a real Capacitor build gates this RFC's implementation** (epic task
20.10), because if WKWebView's service-worker behavior disappoints, the cost
profile of focused native apps changes materially.

**Named limitation:** iOS can evict `WKWebsiteDataStore` — IndexedDB and SW
caches — under storage pressure or prolonged non-use. For the read cache that is
a slow cold start. For an unsynced RFC 0078 write queue it is silent data loss,
which is exactly that RFC's §7 concern. The eventual fix is native storage
bridged through `sdk.device.*`; the honest position for the first release is a
documented limitation, surfaced to the user as a pending-sync indicator rather
than hidden.

**Sign-out purge must still fire.** If sign-out moves to a native menu, the
shell must drive the same web purge sites rather than clearing its own storage —
otherwise a second user on a shared device inherits the first user's cached
data, and with RFC 0078 their un-synced writes. The shell should navigate the
WebView to the platform's own sign-out flow rather than reimplementing it.

### 5. Auth — cookie now, durable session named as the sequel

**v1: cookie in the WebView.** The instance's own login page renders in the
WebView; better-auth's cookies persist in the WebView's data store; the
existing middleware session gate is unchanged. Near-zero platform work, and it
reuses the flow every browser user already takes.

Its weaknesses are real and accepted for v1, not hidden: iOS may purge the
WebView data store, and a chrome-less focused app has no natural place to
present "your session expired, re-enter your password and 2FA".

**The sequel, designed but not built here:** the shell obtains an OAuth
refresh token via RFC 0072 (PKCE public client, `ASWebAuthenticationSession`,
custom-scheme redirect), stores it in the OS keychain, and exchanges it for a
session cookie when the WebView needs one. That yields durable sessions, silent
recovery after a data purge, and biometric unlock — and it is the on-ramp to
the deferred bearer-token plugin API. It is **additive**: nothing in this RFC's
shell design has to be undone to adopt it.

**The friction that follow-up must resolve:** RFC 0072 registers clients
per-instance, admin-only, with `allowDynamicClientRegistration: false` and
exact-match redirect URIs. A single published binary talking to arbitrary
self-hosted instances would require every operator to hand-register a client in
Console before login works — unacceptable for a store app. Either official
shells get a well-known pre-registered client id provisioned at instance
bootstrap, or dynamic client registration is revisited for this narrow case.
Unresolved; it gates the sequel, not this RFC.

### 6. Instance onboarding and validation

Reuse RFC 0058's onboarding (epic 20.1) and validation endpoint (epic 20.2)
unchanged, with one addition: a focused app must verify that its **target
plugin** is installed, enabled, and available on this surface before accepting
an instance URL. "This instance is a Sovereign instance" is insufficient when
the app only does one thing — a Tally app pointed at an instance without Tally
should say so during onboarding, not after a confusing empty screen.

The validation response therefore needs to expose, for a requested plugin id:
installed, enabled, `surfaces` compatibility (RFC 0080), and version. Epic 20.2
should design the endpoint with this consumer in mind rather than being retrofitted.

### 7. Store distribution — deliberately rationed

Research 0005's assessment stands: the code stays shared but the obligation does
not. N published apps means N listings, N review cycles, N privacy
declarations, N signing identities, and 1–2 weeks of review latency on every
shell fix.

**This is handled as policy, not design:** RFC 0081's installable PWA is the
default answer for any plugin that wants an app-like presence; a focused native
app is reserved for flagship plugins where store distribution or a native
capability genuinely justifies the ongoing cost. The decision is deliberate and
per-plugin, not granted on request.

Store metadata must be clear that the app connects to a user-provided instance
and that Sovereign hosts nothing by default — the same requirement RFC 0058
already states. No telemetry by default.

### Docker / config impact

None in this repository beyond RFC 0081's icon assets. The shell lives in
`sovereign-mobile`.

## UI flows

**First launch, default instance:**

```
open app → default instance URL pre-filled → validate (instance + Tally present)
         → load https://instance/tally in WebView → login page → signed in
```

**Change instance:**

```
native menu → instance list → add/select → re-validate target plugin
            → WebView replaced with the new instance's /tally
```

**Offline cold launch:**

```
tap icon → WebView loads /tally → SW serves cached document
         → client hydrates from sdk.offline → cached data renders
```

**Navigation outside the focused plugin:**

```
in-app link to /launcher → middleware sees x-sovereign-focus-plugin
                         → redirect to /tally
external https link      → opens in the system browser, not the shell WebView
```

## Alternatives considered

- **Native UI plus a plugin REST API.** Rejected — forks every plugin into a
  web and a native implementation, contradicting the project thesis and RFC
  0058's own reasoning against React Native. Also unnecessary: the WebView calls
  the plugin's existing Server Actions, and the only new endpoint (offline sync)
  is one RFC 0078 requires regardless.
- **A separate repository per plugin app.** Rejected — every shell fix would
  need porting N times. One repo, N build targets.
- **A new generic `sovereign-plugin-shell` repository** distinct from
  `sovereign-mobile`. Rejected — the two shells are ~90% identical; splitting
  them guarantees divergence and doubles the store-tooling surface.
- **Bundling web assets in the app** for faster cold start. Rejected — the
  `capacitor://` scheme has no service worker, which would trade the entire
  offline story for a startup-time gain.
- **404 for out-of-focus routes.** Rejected — the content exists and the user is
  entitled to it; a redirect to the focused root describes the situation
  honestly.
- **Enforcing the lock as a security boundary.** Rejected as unsound: the signal
  is a spoofable User-Agent. Recorded as a hard rule so nobody later mistakes it
  for one.
- **OAuth-first auth in v1.** Deferred rather than rejected — it is the right
  end state, but it needs the client-registration friction in §5 resolved, and
  cookie auth ships a working app now without foreclosing it.

## Open questions

1. Should a cross-plugin deep link open in the system browser rather than
   redirecting to the focused root? Better for notifications; adds a second
   navigation path to reason about.
2. Does the focused app need a manifest opt-in (a plugin declaring it _may_ be
   published standalone), or is that purely a build-time decision by whoever
   ships the app? Research 0005 left this open. Leaning build-time-only, since
   the lock is not a security boundary and the plugin needs no code change.
3. Minimum iOS/Android versions, and whether `sovereign-desktop` adopts focused
   targets in the same pass or later.
4. How the instance switcher is presented without fighting the web shell's own
   account UI — RFC 0058's open question 4, inherited and sharpened by
   chrome-less focused apps.
5. Whether the pending-sync indicator for the eviction limitation (§4) belongs
   in `packages/ui` as a shared affordance, given DS-first.

## Adoption path

Ordered; each step gates the next. Tracked as legs 3–4 of
[workstream 0001](../workstreams/0001-standalone-plugin-apps.md).

1. **Epic task 20.10** — WKWebView service-worker + offline spike against a
   real Capacitor build. **Gates everything below.** A negative result sends
   this RFC back to design rather than forward to implementation.
2. **Epic task 2.27** — runtime focused-app context and route lock, including
   the hard rule in `docs/architecture-rules.md`.
3. **Epic task 20.11** — `sovereign-mobile` build-target parameterization and
   the first focused target.
4. **Epic task 20.12** — store release process, privacy declarations, and the
   written rationing policy from §7.
5. Follow-up, unscheduled: OAuth refresh-token + session exchange (§5), pending
   resolution of the client-registration question.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
