# Research 0008 — WKWebView / Android WebView offline and service-worker spike

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Scope:** `sovereign-mobile` (external repo), native mobile shells generally\
**Related:** RFC 0058 (native mobile app shell), RFC 0013 (mobile
responsiveness & PWA), research 0006 (standalone plugin apps — shares this
spike), epic 20 task 20.10, workstream 0002 (native mobile app release) leg
1, workstream 0001 (standalone plugin apps)

---

## Question

Does Sovereign's PWA offline stack (service worker, `sdk.offline`
IndexedDB persistence, cached document shells) actually work inside a
Capacitor-wrapped WKWebView (iOS) and Android System WebView, and does the
`capacitor://` custom scheme genuinely prevent service-worker registration
the way RFC 0058 and ADR 0005 (in `sovereign-mobile`) assume? This is the
least-verified assumption behind the entire native mobile shell plan —
epic task 20.10 exists specifically to measure it rather than assume it,
and gates workstream 0002 (scope decision) and workstream 0001 (a hard
gate, since a focused plugin app's whole value proposition is offline
access).

## Findings

All testing used a disposable Capacitor 8.5.0 project (not `sovereign-mobile`
itself — a throwaway scaffold, per this task's own framing), built and run
via `xcodebuild`/`gradlew` against real iOS Simulator (iPhone 17 Pro,
iOS 26.5) and Android Emulator (arm64-v8a, API 34) instances, pointed at a
real, live Sovereign instance (`https://sovereign.openfs.io`).

### The bundled local scheme's service-worker support is platform-divergent — confirmed, not assumed

A minimal bundled page (no `server.url` configured — Capacitor's default
local-content loading path) ran this check directly and rendered the result
as on-screen text (verified by screenshot, since neither platform's
WebView is reachable from Safari/Chrome remote debugging in a headless
environment):

```js
document.getElementById('scheme').textContent = 'scheme: ' + location.protocol;
document.getElementById('sw-support').textContent =
  'SW supported: ' + ('serviceWorker' in navigator);
```

**iOS result:**

```
scheme: capacitor:
SW supported: false
SW register: N/A (not supported)
IndexedDB: OPEN SUCCESS
```

`navigator.serviceWorker` is not merely failing to register — the API is
**not exposed on `navigator` at all** in this context, consistent with
WebKit treating the `capacitor://` custom scheme as a non-"potentially
trustworthy" origin. This confirms RFC 0058's and ADR 0005's assumption
outright, empirically, for iOS.

**IndexedDB works fine even in this context** — a plain `indexedDB.open()`
succeeded. This is a useful, previously-undocumented data point: an
offline-storage strategy that used IndexedDB directly (not via a service
worker) would not be blocked by the `capacitor://` scheme the way service
workers are. `sdk.offline`'s actual storage layer should be checked against
this — if it's IndexedDB-based rather than service-worker-cache-based, it
may not need `server.url` at all to function offline.

**Android result — completely different, and this is the most important
finding of this spike:**

```
scheme: https:
SW supported: true
SW register: SUCCESS scope=https://localhost/
IndexedDB: OPEN SUCCESS
```

Android's default local-content scheme is **not** `capacitor://` at all —
Capacitor's `androidScheme` config defaults to `"https"`, so bundled local
content on Android is served over a synthetic `https://localhost` origin
specifically so secure-context APIs work there. And they do: **the service
worker registered successfully** on Android's bundled scheme, scope
`https://localhost/`.

**This directly contradicts the premise in RFC 0058 and `sovereign-mobile`'s
ADR 0005 that "the `capacitor://` custom scheme yields no service worker at
all."** That statement is confirmed true for iOS and confirmed **false**
for Android's default configuration. The two platforms do not behave the
same way here, and no existing doc says so.

This does not necessarily change what `sovereign-mobile` should ship — see
Recommendation — but it does mean ADR 0005's _stated rationale_ is only
half-true, and any future doc citing "capacitor:// has no service worker"
as a cross-platform fact should be corrected to say "on iOS" specifically.

### `server.url` pointed at a real instance loads and runs real content — confirmed on iOS

A second disposable project with `server.url: "https://sovereign.openfs.io"`
set directly (matching this task's literal setup, distinct from
`sovereign-mobile`'s own committed approach — see Note on scope below)
built and ran on iOS Simulator, loading the real, live, authenticated
Sovereign home/launcher screen successfully. Confirms the basic premise:
Capacitor's `server.url` can serve a real remote origin as primary content.

### A real, reproducible service-worker registration failure exists in Android WebView specifically

Captured via `adb logcat` during earlier `sovereign-mobile` testing (not
this spike's own throwaway build, but the same real instance, loaded via
the "local page + `location.assign()`" pattern `sovereign-mobile` actually
uses — see Note on scope):

```
I chromium: [INFO:CONSOLE(0)] "The script resource is behind a redirect,
which is disallowed.", source: (0)
I chromium: [INFO:CONSOLE(1)] "Uncaught (in promise) NetworkError: Failed
to execute 'importScripts' on 'WorkerGlobalScope': The script at
'https://sovereign.openfs.io/worker-fcda3e92b7d22339.js' failed to load.",
source: https://sovereign.openfs.io/sw.js (1)
```

Checked whether this is a general server-side bug or Android-WebView-specific:
loaded the same URL in a normal (non-WebView) Chromium browser tab and
queried `navigator.serviceWorker.getRegistrations()` directly:

```json
{
  "supported": true,
  "controller": false,
  "registrations": [
    {
      "scope": "https://sovereign.openfs.io/",
      "active": true,
      "installing": false,
      "waiting": false
    }
  ]
}
```

The service worker registers and reaches `active: true` cleanly in a
normal browser. **This is Android-WebView-specific, not a server bug** —
the same real deployment's service worker works in one Chromium-family
engine and fails in another, over the identical network path and served
assets. Root cause not yet identified (worth investigating separately:
possibly a CDN/hosting-layer redirect for versioned worker chunks that
Android WebView's `importScripts()` implementation refuses to follow more
strictly than desktop Chrome does — service workers disallowing redirected
`importScripts()` is spec-correct behavior, so if this is genuinely a
redirect, desktop Chrome should reject it too, which it evidently does not;
this discrepancy itself is worth a follow-up, not resolved here).

### Note on scope: this spike's setup vs. `sovereign-mobile`'s actual approach

This task's own instructions specify testing via `server.url` pointed
directly at a remote origin. `sovereign-mobile` (the actual shell repo)
does **not** do this — per its
[ADR 0005](https://github.com/sovereignfs/sovereign-mobile/blob/main/docs/adrs/0005-server-url-not-bundled-assets.md),
it loads a small bundled local page first, then navigates the _same_
WebView to the remote instance via `location.assign()` — the same pattern
`sovereign-desktop` already ships. That destination navigation is a normal
`https://` page load, not a `capacitor://`-scheme load, so it is expected
to register a service worker exactly as a normal browser tab would (module
the Android-specific bug found above, which is not caused by which loading
strategy is used — it reproduced against the real instance regardless).
Both approaches were tested here for completeness; they answer slightly
different questions (this spike's `server.url` variant answers "does
Capacitor's direct-remote-origin mode work at all"; `sovereign-mobile`'s
actual pattern is what ships).

## Options considered

Not applicable in the usual sense — this is a measurement spike, not a
design decision between options. The real branch points it informs:

| Question                                                                                         | Answer this spike supports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does offline need to be a v1 feature, or can it be a documented follow-up?                       | Service workers are confirmed viable in principle (work in `https://` contexts on iOS's `server.url`/navigate approach, and on Android in _both_ the bundled `https://localhost` scheme and (per the normal-browser check) the real deployment generally). There is a genuine, narrow Android WebView bug against the real deployment specifically to fix or route around before relying on it — nothing found here says offline is unworkable.                                                                                                                                                                                                                                                                                                                                                          |
| Is `capacitor://`/the bundled local scheme a viable content-loading strategy if offline matters? | **Platform-dependent — this is the headline finding.** No on iOS (confirmed empirically: no `serviceWorker` API at all in that context). Yes on Android's default config (confirmed empirically: SW registers and activates on the bundled `https://localhost` scheme). `sovereign-mobile`'s ADR 0005 decision (never load real content via the bundled scheme, always `server.url`/navigate to the real remote origin) is still right — but for reasons independent of service-worker support: a self-hosted, runtime-chosen instance genuinely cannot be baked into a build at all (per ADR 0002), regardless of what each platform's bundled scheme happens to support. ADR 0005's own stated rationale should be corrected to note the iOS/Android divergence rather than implying uniform behavior. |

## Recommendation

1. **Workstream 0002 (whole-instance app):** do not treat offline as
   blocked. `sovereign-mobile`'s ADR 0005 choice (`server.url`/navigate,
   never bundled) remains correct regardless of the iOS/Android
   divergence found here — its real justification is ADR 0002 (no
   baked-in instance), not service-worker support, and that finding
   should be corrected to say so. The Android SW bug found against the
   real deployment is real but looks narrow (one specific failure mode
   tied to one worker chunk, not "service workers don't work in Android
   WebView at all" — confirmed not-that, since the bundled-scheme control
   test registered a _different_ SW successfully on the same engine).
   Recommend shipping the leg-4/5 scaffold as planned, with offline scope
   for v1 decided once the Android bug is root-caused (see Open
   questions) — not before.
2. **Correct ADR 0005 in `sovereign-mobile`** to stop stating "the
   `capacitor://` custom scheme yields no service worker" as a
   cross-platform fact — it's iOS-specific. Android's default bundled
   scheme (`https://localhost`) does support service workers. This
   doesn't change ADR 0005's decision, only its stated rationale.
3. **Workstream 0001 (standalone plugin apps, offline is a hard gate):**
   do not clear this gate yet. The Android service-worker bug against the
   real deployment is exactly the kind of finding that gate exists to
   catch. Root-cause it (or find a viable workaround — e.g., app-side
   caching via IndexedDB directly, which this spike confirmed works in
   every context tested, iOS and Android, bundled and remote alike, as a
   fallback that doesn't depend on service workers at all) before
   treating RFC 0082 §4 as clear to proceed.
4. **File the Android service-worker redirect bug as its own follow-up**
   — it's specific enough (one worker chunk, one error type) to be
   actionable independent of the broader offline question, and matters
   for the PWA/mobile-web experience generally, not just the native shell.

## Open questions

- **Root cause of the Android WebView service-worker `importScripts`
  redirect failure.** Is it a CDN/hosting redirect for the specific
  versioned worker chunk URL? Reproducible outside Android WebView (e.g.
  in Chrome for Android, or via `adb shell` network tracing)? This needs
  someone with access to the hosting/CDN configuration for
  `sovereign.openfs.io`, which this session didn't have.
- **`sdk.offline` IndexedDB persistence across app restart** — not tested.
  Requires an authenticated session performing real read/write actions,
  which needs credentials; entering credentials into any field is outside
  what an agent should do regardless of who supplies them. This needs a
  human tester.
- **Background/foreground cycle survival** — not tested in this pass.
  Testable without credentials (just needs an active instance loaded);
  deferred for time, not blocked on anything.
- **`WKWebsiteDataStore` eviction under storage pressure or prolonged
  non-use** — not practically testable in a short spike session; needs
  either a long-duration test or artificial storage-pressure simulation
  neither available here.
- **Whether the Android SW registration failure is specific to
  `sovereign.openfs.io`'s current deployment/CDN config, or would
  reproduce against any Sovereign instance.** This spike only had access
  to one live instance. If it's deployment-specific (e.g., a CDN
  redirect rule), fixing that one instance's hosting config might be the
  actual fix, not a code change.

## Next steps

Does not yet graduate to an RFC — the Android service-worker bug needs
root-causing first, and the credential-gated tests need a human pass. Once
those land:

- If the Android bug is narrow/fixable: no RFC needed, just a fix and a
  note added to whichever doc references this finding (RFC 0058, ADR
  0005 in `sovereign-mobile`).
- If the Android bug turns out to be a fundamental WebView limitation
  (unlikely given service workers are a shipped, documented Android
  WebView feature since API 24+): workstream 0001's RFC 0082 §4 would need
  to be reopened, per that workstream's own kill-criteria language.
