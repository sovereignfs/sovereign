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

### A real, reproducible service-worker registration failure exists — a server bug, not an Android WebView one

> **Corrected 2026-08-07.** This section originally concluded "**This is
> Android-WebView-specific, not a server bug**." The _failure_ was real and
> correctly captured; the _attribution_ was wrong. It is a plain server-side
> middleware bug affecting every platform, and the original section is kept
> below with the corrected analysis after it, since the reasoning that
> produced the wrong conclusion is itself the useful part. See
> [Root cause](#root-cause-the-middleware-matcher-omitted-worker-hashjs) below.

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

#### Root cause: the middleware matcher omitted `worker-<hash>.js`

_(Added 2026-08-07, superseding the paragraph above.)_

The redirect was real, it was ours, and it happens on every platform. The
runtime middleware matcher (`runtime/middleware.ts`) is a negative-lookahead
allowlist of paths that must load without a session. It listed `sw.js`,
`workbox-`, and `fallback-`, but not `worker-` — the `worker-<hash>.js`
chunk `@ducanh2912/next-pwa` builds from `runtime/worker/index.ts`
(`customWorkerSrc`, the Web Push handler added by RFC 0016). That artifact
was introduced after the allowlist was written and was never added to it, so
every sessionless request for it was redirected to `/login`:

```console
$ curl -sS -o /dev/null -D - https://sovereign.openfs.io/worker-fcda3e92b7d22339.js
HTTP/2 303
location: /login?returnUrl=%2Fworker-fcda3e92b7d22339.js

$ curl -sS -o /dev/null -w '%{http_code}\n' https://sovereign.openfs.io/fallback-ce627215c0e4a9af.js
200
```

`sw.js` pulls both in the same call —
`importScripts("/fallback-…js","/worker-…js")` — and a redirected
`importScripts()` is a spec-mandated hard failure, which aborts the **whole**
service-worker install rather than just the push handler. So a client with no
valid session cookie got no service worker at all: no precached login page,
no `/offline` document fallback, nothing.

**Why the "normal browser" control test pointed the wrong way.** Service
worker scripts are fetched with same-origin credentials. The desktop Chromium
tab used as the control was already authenticated against
`sovereign.openfs.io`, so its request carried a session cookie, got `200`,
and installed cleanly — while the Android WebView was a cold, unauthenticated
client and got the `303`. The variable that actually differed between the two
engines was **auth state**, not the engine. The two observations were
compared as if only the engine varied, and that is where the reasoning broke:
a control test has to hold everything else constant, and this one did not.

The failing case reproduces from plain `curl` on any platform, with no
WebView and no emulator involved — which is the cheap check that would have
falsified the Android attribution immediately.

Fixed by adding `worker-` to the matcher allowlist, with a regression test in
`runtime/src/__tests__/middleware-regression.test.ts` asserting that every
service-worker artifact (`sw.js`, `workbox-*`, `fallback-*`, `worker-*`)
bypasses the session gate.

**What this does and doesn't change about this spike's conclusions.** It
removes an Android-specific defect that never existed, so nothing here counts
against Android WebView. It does not weaken the case for offline — it
strengthens it: the one hard service-worker failure this spike found is a
fixed one-line server bug, not a platform limitation. It also means the bug
was never confined to the native shell: **every logged-out visitor on every
platform — browser, PWA, WebView — has been getting no service worker**,
which is a materially larger blast radius than "one Android chunk."

### Background/foreground cycle survival — WebView reloads from scratch on iOS; JS state does not survive

Tested with a second disposable Capacitor 8.5.0 project (`spike-bgfg`, iOS
only in this pass) loading a bundled local page with a live `setInterval`
counter and `visibilitychange`/`pagehide`/`pageshow`/`freeze`/`resume` event
logging, rendered as on-screen text and verified by screenshot (again, no
remote-debugging access in this environment).

Sequence on iOS Simulator (iPhone 17 Pro):

1. App launched and left running. Screenshot confirmed `counter: 11`,
   `page loaded at: 2026-08-02T06:50:06...`, one
   `pageshow:persisted=false` event (the normal first-load event, not a
   restore).
2. Backgrounded via the Home button, left backgrounded 30 seconds, then
   brought back to the foreground via `simctl launch` on the same bundle ID.
3. Post-foreground screenshot showed `page loaded at:
2026-08-02T06:51:55...` — a **different, later timestamp** than before
   backgrounding — with `counter` reset to a small value rather than
   continuing from 11. A follow-up screenshot ~4 minutes later showed the
   counter having climbed to 247, consistent with ~1 tick/second counting up
   fresh from the new load time, not a resumed prior session.

**Conclusion: the WebView's JS execution context did not survive this
background/foreground cycle on iOS Simulator — the page reloaded from
scratch.** No `pagehide`/`freeze`/`resume` events from the original page
instance appeared in the post-foreground log (that in-memory event array was
gone), consistent with the process being torn down and recreated, not merely
suspended and resumed.

**Caveat on method:** the foreground trigger was `simctl launch` re-invoked
on an already-backgrounded process, not a real user gesture (Home Screen
icon tap or App Switcher). This can't distinguish "the OS/simulator evicted
the backgrounded WebView content process under memory pressure" from
"`simctl launch`'s resume path itself forces a fresh load" — both produce
this exact symptom, and this session didn't cross-check against a real
foreground gesture. The practical answer (in-memory JS state should not be
assumed to survive backgrounding) holds either way; the root cause doesn't.

**Practical implication:** this sharpens the earlier IndexedDB finding into
a concrete constraint — any offline write-queue or buffering in
`sdk.offline` must flush to IndexedDB (confirmed working in every context
tested here) as data is produced, not hold it in a JS variable to flush
later, since a background/foreground cycle can silently discard that state
with no error or event to catch it.

**Android:** tested with the same `spike-bgfg` project, `./gradlew
assembleDebug` against Capacitor Android 8.5.0, installed and run on the
same arm64-v8a API 34 AVD used for the earlier navigation-policy testing.
Sequence:

1. Installed, launched (`adb shell am start`). Screenshot confirmed
   `counter: 5`, `page loaded at: 2026-08-02T07:00:02.075Z`, one
   `pageshow:persisted=false` event.
2. Backgrounded via `adb shell input keyevent KEYCODE_HOME`, waited (real
   elapsed time between steps ended up closer to ~10 minutes than the
   intended 30 seconds, due to tool round-trip latency — visible in the
   event timestamps below), then re-foregrounded via
   `adb shell am start` on the same activity. adb itself reported
   `Warning: Activity not started, its current task has been brought to
the front` — i.e. Android recognized the existing task and brought it
   forward rather than creating a new one, closer to a real launcher-icon
   tap than iOS's `simctl launch` re-invocation.
3. Post-foreground screenshot: **`page loaded at` unchanged** —
   still `2026-08-02T07:00:02.075Z`, the exact same value as before
   backgrounding. The event log had **grown**, not reset: it still
   contained the original `pageshow:persisted=false@07:00:02` entry, with
   `visibility:hidden@07:09:16` and `visibility:visible@07:09:50` appended
   after it — the same in-memory JS array (`window.__bgFgEvents`) from
   before backgrounding, added to, not recreated. Counter read `40`.

**Conclusion: on Android, the WebView's JS execution context survived the
background/foreground cycle** — this is the opposite result from iOS. The
unchanged load timestamp and the appended (not reset) event array both
confirm the same page instance and the same in-memory state persisted
through backgrounding, in clear contrast to iOS Simulator's fresh reload
(new load timestamp, reset counter, empty event history) under the
equivalent test.

**On the counter value itself:** `40` is lower than a naive "~1 tick per
elapsed wall-clock second" estimate would predict given the ~9-minute gap
between load and backgrounding. This is not evidence of a reload — the
unchanged load timestamp and intact/appended event log rule that out — and
is consistent with Chromium's well-documented behavior of throttling
`setInterval` timers in backgrounded/non-visible pages (and, additionally,
Android Doze/App Standby power management can throttle background JS
execution independent of the Page Visibility API). The state and code
survived; the timer's _tick rate_ while not foregrounded did not run at its
nominal 1/second.

**Practical implication — sharper than the iOS-only version above:** this
is a genuine, previously-undocumented iOS/Android divergence relevant to
`sdk.offline`'s design. An in-memory write queue would be silently and
completely lost across a background/foreground cycle on iOS, but would
survive (possibly with delayed/throttled execution while backgrounded, not
loss) on Android. Any design that assumes uniform behavior across platforms
here is wrong in one direction or the other; the safe design (flush to
IndexedDB as data is produced, never rely on JS-memory survival) is safe on
both, and necessary specifically because of the iOS behavior.

### Note on scope: this spike's setup vs. `sovereign-mobile`'s actual approach

This task's own instructions specify testing via `server.url` pointed
directly at a remote origin. `sovereign-mobile` (the actual shell repo)
does **not** do this — per its
[ADR 0005](https://github.com/sovereignfs/sovereign-mobile/blob/main/docs/adrs/0005-server-url-not-bundled-assets.md),
it loads a small bundled local page first, then navigates the _same_
WebView to the remote instance via `location.assign()` — the same pattern
`sovereign-desktop` already ships. That destination navigation is a normal
`https://` page load, not a `capacitor://`-scheme load, so it is expected
to register a service worker exactly as a normal browser tab would (modulo
the server-side session-gate bug found above, which is not caused by which
loading strategy is used — it reproduced against the real instance
regardless, from any client without a session cookie).
Both approaches were tested here for completeness; they answer slightly
different questions (this spike's `server.url` variant answers "does
Capacitor's direct-remote-origin mode work at all"; `sovereign-mobile`'s
actual pattern is what ships).

## Options considered

Not applicable in the usual sense — this is a measurement spike, not a
design decision between options. The real branch points it informs:

| Question                                                                                         | Answer this spike supports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does offline need to be a v1 feature, or can it be a documented follow-up?                       | Service workers are confirmed viable in principle (work in `https://` contexts on iOS's `server.url`/navigate approach, and on Android in _both_ the bundled `https://localhost` scheme and the real deployment generally). The one hard registration failure found here turned out to be a server-side middleware bug of ours (a missing `worker-` entry in the session-gate allowlist), not a platform limitation — real, cross-platform, and now fixed. Nothing found here says offline is unworkable.                                                                                                                                                                                                                                                                                                |
| Is `capacitor://`/the bundled local scheme a viable content-loading strategy if offline matters? | **Platform-dependent — this is the headline finding.** No on iOS (confirmed empirically: no `serviceWorker` API at all in that context). Yes on Android's default config (confirmed empirically: SW registers and activates on the bundled `https://localhost` scheme). `sovereign-mobile`'s ADR 0005 decision (never load real content via the bundled scheme, always `server.url`/navigate to the real remote origin) is still right — but for reasons independent of service-worker support: a self-hosted, runtime-chosen instance genuinely cannot be baked into a build at all (per ADR 0002), regardless of what each platform's bundled scheme happens to support. ADR 0005's own stated rationale should be corrected to note the iOS/Android divergence rather than implying uniform behavior. |

## Recommendation

1. **Workstream 0002 (whole-instance app):** do not treat offline as
   blocked. `sovereign-mobile`'s ADR 0005 choice (`server.url`/navigate,
   never bundled) remains correct regardless of the iOS/Android
   divergence found here — its real justification is ADR 0002 (no
   baked-in instance), not service-worker support, and that finding
   should be corrected to say so. The SW registration failure found
   against the real deployment was real, but it was a server-side bug of
   ours (the middleware session gate redirecting `worker-<hash>.js`), not
   an Android WebView defect — root-caused and fixed 2026-08-07. Ship the
   leg-4/5 scaffold as planned; offline scope for v1 no longer waits on
   this.
2. **Correct ADR 0005 in `sovereign-mobile`** to stop stating "the
   `capacitor://` custom scheme yields no service worker" as a
   cross-platform fact — it's iOS-specific. Android's default bundled
   scheme (`https://localhost`) does support service workers. This
   doesn't change ADR 0005's decision, only its stated rationale.
3. **Workstream 0001 (standalone plugin apps, offline is a hard gate):**
   the service-worker registration failure this gate was meant to catch
   is root-caused and fixed (a server-side session-gate bug, not a WebView
   limitation), so it no longer blocks. The gate itself is not fully
   cleared: task 20.10's own checklist still has `sdk.offline` IndexedDB
   persistence across app restart and `WKWebsiteDataStore` eviction under
   storage pressure open, both needing a human tester with credentials.
   Clear the gate on those, not on this bug.
4. **~~File the Android service-worker redirect bug as its own
   follow-up.~~** Superseded — root-caused as the middleware allowlist
   omitting `worker-<hash>.js` and fixed on 2026-08-07. The instinct was
   right for the wrong reason: it did matter beyond the native shell, but
   because it broke the service worker for _every_ logged-out visitor on
   every platform, not because of anything Android-specific.
5. **`sdk.offline` must treat in-memory JS state as unsafe across a
   background/foreground cycle, unconditionally.** This spike found iOS
   WKWebView discards it entirely (fresh reload on return to foreground)
   while Android WebView preserves it — a real, previously-undocumented
   platform divergence (see Background/foreground cycle survival above).
   Designing to the iOS behavior (flush to IndexedDB as data is produced,
   never buffer-then-flush-later in memory) is safe on both platforms and
   is the only design that doesn't silently lose data on iOS specifically.

## Open questions

- ~~**Root cause of the Android WebView service-worker `importScripts`
  redirect failure.**~~ **Answered 2026-08-07 — see
  [Root cause](#root-cause-the-middleware-matcher-omitted-worker-hashjs).**
  It was a redirect, but ours, not a CDN's: `runtime/middleware.ts`'s
  session-gate allowlist omitted `worker-`, so `worker-<hash>.js` 303'd to
  `/login` for any request without a session cookie. Reproducible outside
  Android WebView on any platform with plain `curl`; no hosting/CDN access
  was needed after all. The question was framed around the wrong variable —
  the difference between the failing and passing observations was auth
  state, not the WebView engine.
- **`sdk.offline` IndexedDB persistence across app restart** — not tested.
  Requires an authenticated session performing real read/write actions,
  which needs credentials; entering credentials into any field is outside
  what an agent should do regardless of who supplies them. This needs a
  human tester.
- **Whether iOS's observed reload-on-foreground is genuine OS/WebView
  content-process eviction or an artifact of using `simctl launch` (rather
  than a real Home Screen tap or App Switcher gesture) to resume the app.**
  Needs either a real device or a more interactive simulator session that
  can drive an actual foreground gesture instead of a CLI relaunch. (Android
  was tested with `adb shell am start` on an already-running task, which
  `adb` itself confirmed brought the existing task forward rather than
  recreating it — a closer match to a real launcher-icon tap. The iOS
  equivalent wasn't cross-checked against a real gesture in this pass.)
- **Whether iOS's context loss is time-bound or immediate** — this pass
  only tested a single ~30-second background interval. Whether a very
  short background (a few seconds, e.g. switching to enter a 2FA code from
  another app) also reloads, or whether iOS gives some grace period before
  evicting the WebView content process, is unknown and would need multiple
  timed trials.
- **Root cause of Android's `setInterval` under-counting relative to naive
  elapsed-wall-clock-time expectations** while backgrounded — plausibly
  ordinary Chromium background-timer throttling and/or Android Doze/App
  Standby, but not confirmed against documentation or a controlled timing
  test. Doesn't affect the headline finding (context survives) but would
  matter for any design relying on background timer precision, which
  `sdk.offline` should not do regardless.
- **`WKWebsiteDataStore` eviction under storage pressure or prolonged
  non-use** — not practically testable in a short spike session; needs
  either a long-duration test or artificial storage-pressure simulation
  neither available here.
- ~~**Whether the SW registration failure is specific to
  `sovereign.openfs.io`'s current deployment/CDN config, or would
  reproduce against any Sovereign instance.**~~ **Answered 2026-08-07 —
  it reproduces against _every_ Sovereign instance.** The redirect came
  from `runtime/middleware.ts`, which ships with the platform, so it was
  never deployment-specific and no hosting config change was involved.

## Next steps

Does not yet graduate to an RFC. The service-worker registration failure
is root-caused and fixed (a platform code change: `worker-` added to the
middleware allowlist, with a regression test); what remains open is the
credential-gated testing that needs a human pass — `sdk.offline` IndexedDB
persistence across app restart and `WKWebsiteDataStore` eviction.

- The SW bug was narrow and fixable, so no RFC is needed for it — just the
  fix plus a note in whichever docs reference this finding (RFC 0058, ADR
  0005 in `sovereign-mobile`, epic task 20.10).
- The contingency below is retired: it was **not** a fundamental WebView
  limitation (as expected — service workers are a shipped, documented
  Android WebView feature since API 24+), so workstream 0001's RFC 0082 §4
  does not need reopening on these grounds.
