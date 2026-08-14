# Epic 20: Mobile App Shell

> Capacitor-based iOS and Android shell app that loads a user's self-hosted
> Sovereign instance in a WebView.

## Status

⏳ In Progress — task 20.2 shipped; task 20.1 substantially implemented in
`sovereign-mobile` (see that repo's own `docs/epics/shell.md` for status).

## Overview

Sovereign's native mobile app is a post-v1 client shell, not a second
implementation of the platform. The mobile shell (`sovereign-mobile`, separate
repository) asks the user for their instance URL on first launch, persists that
instance list, and loads the selected instance in a WebView. Auth, plugins,
shell layout, CSP, and runtime behavior continue to come from the user's own
Sovereign deployment.

The mobile app is built with Capacitor so the shell logic can stay TypeScript
first while still exposing native device capabilities through Capacitor plugins
where Web APIs are insufficient. Plugin developers use `sdk.device.*` only; they
do not import Capacitor or branch on shell internals.

## Tasks

#### ⏳ 20.1 — sovereign-mobile — Capacitor shell scaffold

**Goal:** Bootstrap `sovereign-mobile` with a working Capacitor shell for iOS and
Android: first-launch instance URL onboarding, persistent instance storage,
WebView loading, navigation policy, and multiple-instance switching.

**Status (2026-08):** Scaffold implemented and largely verified against a real
instance on both iOS Simulator and Android Emulator — see
`sovereign-mobile`'s own [docs/epics/shell.md](https://github.com/sovereignfs/sovereign-mobile/blob/main/docs/epics/shell.md)
for the full review checklist and what remains open (real physical-device
verification, Android back-navigation reliability). Not yet ✅ here pending
that repo's own sign-off.

**Deliverables:**

- `sovereign-mobile/` (new repo):
  - Capacitor app scaffold with committed iOS and Android project files
  - First-launch instance URL onboarding UI
  - Persistent ordered instance list storage
  - WebView boot flow: stored instance → load; no stored instance → onboarding
  - Multiple-instance add, remove, and switch flows
  - Primary WebView navigation policy that keeps configured Sovereign instances
    in-app and opens external links outside the shell
  - Local development instructions for iOS Simulator and Android Emulator
- Document required local tooling: Node, pnpm, Xcode, Android Studio, CocoaPods,
  and Capacitor CLI

**Dependencies:** RFC 0058.

**SRS reference:** §3.12

**Review checklist:**

- App opens in iOS Simulator and Android Emulator.
- First launch shows instance URL onboarding.
- A valid saved instance loads in the WebView on restart.
- Users can add, remove, and switch between at least two instances.
- External links do not silently navigate the primary WebView away from the
  configured instance.
- No Sovereign auth, role, or plugin behavior is duplicated in native code.

#### ✅ 20.2 — Mobile instance validation and compatibility endpoint

**Goal:** Define and implement the stable runtime endpoint used by native shells
to validate a user-entered Sovereign instance URL and discover client
compatibility metadata.

**Status (2026-08):** Shipped as `GET /api/instance` (`runtime/app/api/instance/route.ts`)
— unauthenticated, returns `{ status, product: "sovereign", instanceName,
platformVersion }`. Both `sovereign-mobile` and `sovereign-desktop` updated to
validate against it instead of the bare `/api/health` liveness probe they used
before this endpoint existed; `instanceLabel()` (derived-from-hostname label)
removed from both shells' `validate.ts` now that the real `instanceName` is
available. Verified end-to-end on iOS Simulator against a live local dev
server, not just unit tests. See
[sovereignfs/sovereign-mobile#2](https://github.com/sovereignfs/sovereign-mobile/pull/2)
and
[sovereignfs/sovereign-desktop#2](https://github.com/sovereignfs/sovereign-desktop/pull/2)
(both draft, pending review — the desktop change also updates a documented
"hard rule" in that repo's CLAUDE.md, flagged there for explicit sign-off).

**Deliverables:**

- Runtime endpoint for unauthenticated instance validation and compatibility
  metadata, shared by mobile and desktop shells where practical
- Response includes at minimum instance identity, compatible platform version or
  capability flags, and a machine-readable status
- Reserved API namespace checks updated if a new `runtime/app/api/*` segment is
  added
- `sovereign-mobile` onboarding updated to validate against the chosen endpoint
- Docs updated to describe endpoint stability, privacy behavior, and expected
  error states

**Dependencies:** Task 20.1; coordinate with Epic 17 desktop validation.

**SRS reference:** §3.12

**Review checklist:**

- Valid Sovereign instance URL passes validation and loads.
- Non-Sovereign URL fails with a clear inline error.
- Offline or unreachable URL fails without crashing the app.
- Endpoint returns no sensitive deployment or user data.
- Desktop and mobile validation behavior do not diverge unnecessarily.

#### 📋 20.3 — Mobile SDK native environment and bridge adapter

> **Rescoped by [RFC 0083](../rfcs/0083-device-bridge-capability-contract.md).** Do
> not implement as originally written. The environment-detection half is covered by
> Task 3.32 (RFC 0080); what remains is **the Capacitor transport of
> `@sovereignfs/bridge`** — the protocol is owned in the platform repo so the mobile
> and desktop shells cannot drift. Tracked as leg 4 of
> [workstream 0003](../workstreams/0003-device-bridge-across-surfaces.md). Two
> requirements carry over from that RFC: the shell must expose **only** the narrow
> bridge object (never raw `window.Capacitor` to page JS), and its advertised
> `capabilities` list must reflect what the build actually implements.

**Goal:** Add the SDK-side native-mobile environment routing needed for
`sdk.device.*` so plugins can call one portable API across browser, PWA, and the
Capacitor shell.

**Deliverables:**

- `packages/sdk` native-mobile environment detection for the Capacitor shell
- Native bridge adapter shape for device calls implemented by `sovereign-mobile`
- Browser/PWA fallback behavior documented for unsupported native capabilities
- Tests covering environment detection and fallback routing
- Semver bump according to the public API delta

**Dependencies:** Task 20.1.

**SRS reference:** §3.12; RFC 0058 device API strategy

**Review checklist:**

- Plugin code calls `sdk.device.*` without importing Capacitor.
- SDK routes to native bridge only inside the mobile shell.
- Browser and PWA behavior remains unchanged for existing device calls.
- Unsupported capabilities return documented errors or fallback states.
- `pnpm test` passes for `packages/sdk`.

#### 📋 20.4 — Mobile store release setup and privacy declarations

**Goal:** Prepare iOS App Store and Android Play Store release infrastructure for
the universal mobile shell.

**Deliverables:**

- iOS bundle identifier, Android application ID, icons, splash screens, and app
  display metadata
- App Store Connect and Play Console listing copy explaining the user-provided
  instance URL model
- App privacy labels / data safety declarations
- Signing, provisioning, and CI release documentation
- Minimum supported iOS and Android versions selected and documented
- Store-review checklist covering network access, permissions, and self-hosted
  instance behavior

**Dependencies:** Task 20.1.

**SRS reference:** §3.12

**Review checklist:**

- Store listing does not imply Sovereign hosts user data by default.
- Privacy declarations match the shell's actual data collection behavior.
- Required signing/provisioning secrets are documented without committing
  secrets.
- iOS and Android release builds can be produced locally or in CI.
- No telemetry is introduced by default.

#### ✅ 20.5 — Native push notifications (APNs/FCM)

> **Rescoped by [RFC 0087](../rfcs/0087-sovereign-relay.md).** The
> runtime/API device-token registration, the encrypted-relay fan-out, and
> the new `apps/relay` service are **not** this task's work — they're
> this monorepo's task 4.7 (see
> [docs/epics/notification-center.md](notification-center.md#-47--native-mobile-push-relay-apnsfcm)).
> What remains here is **the `sovereign-mobile` client-side half**:
> Capacitor push registration, on-device keypair generation and
> encryption/decryption, the iOS Notification Service Extension, and
> calling this monorepo's registration endpoint. See
> [Research 0010](../research/0010-native-mobile-push-notifications.md)
> for why a relay is unavoidable (APNs/FCM credentials are tied to one app
> identity, not to individual self-hosted instances) — this was not
> obvious when this task was first scoped. Sequenced by
> [workstream 0005](../workstreams/0005-native-push-relay.md), leg 4 —
> merged as `sovereign-mobile` PR #8.
>
> **Shipped:** entirely native registration on `applicationDidBecomeActive`
> (iOS) / `onResume()` (Android) — no new bridge capability, per RFC 0083
> §7 and `sovereign-mobile`'s own registry-first rule for new device
> capabilities. On-device P-256 keypair via native `CryptoKit`/Android
> `KeyStore`-backed `EncryptedSharedPreferences`; a real Xcode Notification
> Service Extension target (added via the `xcodeproj` Ruby gem, not
> hand-edited `project.pbxproj`); Android FCM background handling inline,
> no separate extension. Two real cross-language bugs caught before merge
> via empirical cross-language round-trip verification, not assumed: iOS
> `CryptoKit`'s `.rawRepresentation` is a bare 64-byte encoding (not the
> 65-byte SEC1/X9.63 point this wire format needs — fixed via
> `.x963Representation`); Android's `javax.crypto.Cipher` expects
> `ciphertext‖tag`, the opposite byte order of this wire format's
> `tag‖ciphertext` (fixed by reordering before `doFinal()`).
>
> **Not shipped, despite being in the original deliverables list below:**
> revocation on sign-out/instance removal (no reliable native detection
> signal for either event without more invasive polling — a stale token
> self-heals via task 4.7's `invalid_token` pruning instead) and a
> dedicated Account UI opt-in/opt-out surface (registration is currently
> automatic/implicit whenever push is configured, with no user-facing
> toggle). Both are real, open gaps, not silently dropped scope — flag
> before treating this task as fully closed if either becomes a real
> product requirement.

**Goal:** Let `sovereign-mobile`'s native app receive and display a push
notification while fully closed, by registering a device token and
encryption keypair with the user's own instance and decrypting what the
configured relay (`sovereignfs`'s by default) delivers.

**Deliverables:**

- Capacitor push notifications integration for APNs and FCM
  (`@capacitor/push-notifications`)
- On-device keypair generation (`CryptoKit` on iOS, Android `KeyStore`) —
  private key never leaves the device
- Registration call to the instance's `POST /api/account/push-device-token`
  (RFC 0087) on first opt-in; revocation call on sign-out/instance removal
- iOS **Notification Service Extension** — decrypts the payload and
  populates notification content before the OS displays it; reuses the
  `notifications.native` display path from workstream 0003 once decrypted
- Android FCM background message handling — decrypt inline, no separate
  extension needed
- Account UI or preferences surface for mobile push opt-in/opt-out
- Permission strings, privacy declarations, and operator configuration docs
  (including that push depends on `sovereignfs`'s relay by default, and
  what the escape hatch is — RFC 0087's "Deployment topology")
- Tests for token registration, revocation, and permission/error states

**Dependencies:** Task 20.3 (device bridge, for `notifications.native`
reuse); RFC 0087; this monorepo's task 4.7 (the registration endpoint and
relay must exist to register against).

**SRS reference:** §3.12; RFC 0087

**Review checklist:**

- User can opt in to push on iOS and Android.
- A real push is received and displayed correctly while the app is fully
  closed, not just backgrounded — verified against a real
  simulator/emulator with real APNs/FCM sandbox credentials.
- Revoking permission or signing out removes or invalidates the device
  token, verified end-to-end (not just that the local keypair is deleted).
- Push payloads are decrypted only on-device; nothing sent to the relay
  before encryption is inspectable in transit (verify by capturing the
  actual network call, not by reading the code).
- Browser/PWA notification behavior remains unchanged.
- Missing or unreachable relay configuration degrades to a documented
  no-op, not a crash.

#### ✅ 20.6 — Native photo picker and camera capture

> Shipped in `sovereign-mobile` (commit `5defa1c`, 2026-08-08); Capacitor
> camera/photo-picker integration, `camera.photo` bridge capability. Status
> corrected here 2026-08 — this file had drifted behind that repo's own
> `ROADMAP.md`/`docs/epics/bridge.md`, which record it done.

**Goal:** Expose native mobile photo selection and camera capture through
`sdk.device.*` without plugins importing Capacitor directly.

**Deliverables:**

- Capacitor camera/photo picker integration in `sovereign-mobile`
- SDK device method for capture/select flow, or native implementation for an
  existing compatible method
- Browser fallback using existing Web APIs where available
- Permission strings and privacy declarations for iOS and Android
- Example or test plugin flow proving plugin portability across browser and
  native shell

**Dependencies:** Task 20.3.

**SRS reference:** §3.12

**Review checklist:**

- Plugin can request a photo through `sdk.device.*` in the mobile shell.
- iOS and Android permission prompts use accurate copy.
- Browser fallback works or returns a documented unsupported state.
- Returned file/blob metadata is normalized across environments.
- Denied permissions are handled without crashing the plugin.

#### ✅ 20.7 — Biometric auth capability

> Shipped in `sovereign-mobile` (commit `463bd6c`, 2026-08-09); Face ID/Touch
> ID (iOS) and BiometricPrompt (Android), `biometrics.confirm` bridge
> capability. Status corrected here 2026-08 for the same reason as 20.6.

**Goal:** Add Face ID / fingerprint capability through `sdk.device.*` for
high-trust local confirmation flows without replacing Sovereign server-side auth.

**Deliverables:**

- Capacitor biometric auth integration
- SDK device method for local biometric confirmation
- Clear distinction between local device confirmation and platform
  authentication/session freshness
- Permission/privacy documentation for iOS and Android
- Tests or simulator verification for success, failure, unavailable, and denied
  states

**Dependencies:** Task 20.3; coordinate with auth/session freshness rules before
using this for sensitive flows.

**SRS reference:** §3.12; auth architecture rules

**Review checklist:**

- Biometric prompt can confirm a local action in the mobile shell.
- Capability never grants server-side auth by itself.
- Devices without biometrics return a documented unsupported state.
- Failed or cancelled biometric prompts are handled predictably.
- Existing browser/PWA auth behavior remains unchanged.

#### ✅ 20.8 — Haptics capability

> Shipped in `sovereign-mobile` as part of Task 20.3 (bridge adapter,
> `haptics.impact`) — closed there as subsumed by 20.3 rather than needing
> separate work (`sovereign-mobile/ROADMAP.md` changelog 0.2). Status
> corrected here 2026-08 for the same reason as 20.6/20.7.

**Goal:** Expose lightweight native haptics through `sdk.device.*` for mobile
interaction feedback where appropriate.

**Deliverables:**

- Capacitor haptics integration
- SDK device method or environment-routed implementation for haptic feedback
- No-op browser fallback
- Usage guidance that keeps haptics optional and non-essential

**Dependencies:** Task 20.3.

**SRS reference:** §3.12

**Review checklist:**

- Mobile shell can trigger success/warning/error/light feedback.
- Browser and PWA environments no-op without throwing.
- Plugins can remain fully usable when haptics are unavailable.
- Reduced-motion or accessibility preferences are respected where exposed by the
  platform.

#### 📋 20.9 — Background capability planning

**Goal:** Define whether and how native background location or background work
belongs in Sovereign before any high-risk background permissions are added to
the mobile shell.

**Deliverables:**

- Follow-up RFC or design note for background location and background work
- Store-review and privacy analysis for iOS and Android
- Capability gating model for plugins that request background behavior
- Operator/user consent and revocation model
- Decision on whether background work is handled by mobile shell APIs, platform
  jobs, plugin jobs, or a combination

**Dependencies:** Task 20.3; RFC 0046 Plugin background jobs and schedules.

**SRS reference:** §3.12

**Review checklist:**

- No background permission is added before the design is accepted.
- The design identifies data collection, retention, and revocation behavior.
- Plugin-facing API shape is explicit or intentionally deferred.
- Store-review risk is documented before implementation.

#### ⏳ 20.10 — WKWebView service-worker and offline spike (RFC 0058, RFC 0082)

**Progress (2026-08):** [Research 0008](../research/0008-wkwebview-android-webview-offline-spike.md)
covers the `capacitor://`/bundled-scheme service-worker question (confirmed,
not assumed, and platform-divergent — no SW support on iOS's `capacitor://`
scheme, but full SW support on Android's default `https://localhost` bundled
scheme) and found a real, reproducible service-worker registration failure
against a live instance. **That failure was originally attributed to Android
WebView; the attribution was wrong** — root-caused 2026-08-07 as a
platform-side bug in `runtime/middleware.ts`, whose session-gate allowlist
omitted the `worker-<hash>.js` custom-worker chunk, so a sessionless request
for it 303'd to `/login` and the redirected `importScripts()` aborted the
entire service-worker install. It affected every logged-out visitor on every
platform, reproduces from plain `curl`, and is now fixed with a regression
test. Nothing here counts against Android WebView, and the SW question no
longer blocks anything. Background/foreground
cycle survival is now also confirmed on both platforms, and is itself
platform-divergent: iOS WKWebView discards the JS execution context entirely
(fresh reload on return to foreground — any in-memory state is lost with no
event to catch it), while Android WebView preserves it across the same cycle.
This is a real, previously-undocumented finding with a direct design
implication for `sdk.offline` (never rely on in-memory buffering; flush to
IndexedDB as data is produced). **Not yet complete** per this task's own
review checklist: `sdk.offline` IndexedDB persistence across restart (needs
an authenticated session — a human handoff, not something an agent should do
by entering credentials) and `WKWebsiteDataStore` eviction under storage
pressure are still open. See that doc's Open questions.

**Goal:** Establish, against a real Capacitor build, whether Sovereign's offline stack
works inside the mobile WebView. This is the least-verified assumption behind every
native shell plan.

**Shared by two workstreams — run it once, let both consume the finding:**

- [Workstream 0002](../workstreams/0002-native-mobile-app-release.md) (whole-instance
  native app) uses it to decide **scope**: whether offline is a feature of the first
  store release or a documented follow-up. A negative result narrows Task 20.1; it
  does not stop the release.
- [Workstream 0001](../workstreams/0001-standalone-plugin-apps.md) (standalone plugin
  apps) uses it as a **gate** on Tasks 20.11–20.12: a negative result sends RFC 0082
  §4 back to design, because a focused plugin app whose whole value is offline access
  cannot ship without it.

**Deliverables:**

- A disposable Capacitor build pointing `server.url` at a real instance over `https`.
- Verified findings for each layer separately: service-worker registration, the
  `offline-shells` document cache, `sdk.offline` IndexedDB persistence across app
  restart, and survival of a background/foreground cycle.
- Confirmation (not assumption) that the `capacitor://` custom scheme yields **no**
  service worker, since the whole offline story rests on avoiding it.
- Measured behavior of `WKWebsiteDataStore` eviction under simulated storage pressure
  and prolonged non-use — this determines how loudly a pending-sync indicator must
  surface unsynced writes.
- Equivalent verification on Android System WebView.
- A written finding appended to `docs/research/0006-standalone-plugin-apps.md` or as its
  own research doc. **The deliverable is the finding, not code.**

**Dependencies:** RFC 0082. Requires Task 20.1's shell only insofar as a throwaway
Capacitor project is needed.

**SRS reference:** §3.12

**Review checklist:**

- Each of the four offline layers is reported as working or not working, individually.
- The `capacitor://` no-service-worker claim is tested, not assumed.
- Eviction behavior is characterized on iOS.
- Android is covered.
- If the result is negative, the finding says so plainly and RFC 0082 §4 is reopened
  rather than the workstream proceeding.

#### 📋 20.11 — Focused plugin app build targets (RFC 0082)

**Goal:** Publish an individual plugin as its own native app from the same
`sovereign-mobile` codebase that builds the whole-instance app — one shell,
parameterized, not a second project.

**Deliverables:**

- A declarative build-target config per app: `appId`, `displayName`,
  `defaultInstanceUrl`, `focusPlugin`, icon set. The whole-instance app becomes the
  target with **no** `focusPlugin`.
- Shell sends the RFC 0080 User-Agent token extended with `focus=<pluginId>`.
- `server.url` loads the remote instance over `https` — never bundled assets behind
  `capacitor://`, per Task 20.10's finding.
- Instance onboarding extended to validate that the **target plugin** is installed,
  enabled, and surface-compatible, not merely that the URL is a Sovereign instance.
- Instance switcher re-validates the target plugin on switch.
- Sign-out drives the platform's own flow so `offline.clearAll()` and the offline-queue
  purge still fire — a native-only sign-out would leak the previous user's cached data
  and unsynced writes on a shared device.
- One published focused target, with the whole-instance app still building.

**Dependencies:** Task 20.10 (gate), Task 20.1, Task 20.2, Task 2.27, RFC 0082.

**SRS reference:** §3.12

**Review checklist:**

- Both the whole-instance app and one focused app build from the same codebase.
- The focused app loads only its plugin; out-of-focus navigation redirects to the
  plugin root.
- Onboarding rejects an instance that lacks the target plugin, with a clear message.
- Offline cold launch renders cached data.
- Sign-out clears the offline cache and queue.
- No auth, role, or plugin-permission logic is duplicated in native code.

#### 📋 20.12 — Plugin app store release process and rationing policy (RFC 0082)

**Goal:** Make publishing a focused plugin app a repeatable process with a written
policy on when it is justified — the ongoing cost is per-app and permanent.

**Deliverables:**

- Store metadata, privacy labels, and data-safety declarations per focused target,
  making clear the app connects to a user-provided instance and that Sovereign hosts
  nothing by default.
- Signing identity, app identifier, and release-ownership model for multiple apps.
- **Written rationing policy** (RFC 0082 §7): the installable PWA (Task 2.25) is the
  default answer for any plugin wanting an app-like presence; a store-published focused
  app is reserved for flagship plugins where distribution or a native capability
  justifies N listings, N review cycles, N privacy declarations, and 1–2 weeks of review
  latency on every shell fix.
- No telemetry by default.

**Dependencies:** Task 20.11, RFC 0082.

**SRS reference:** §3.12

**Review checklist:**

- One focused app passes store review on both platforms.
- The rationing policy is written and referenced from the epic.
- Store metadata does not imply Sovereign hosts user data.
- No analytics or crash reporting is enabled by default.

#### 🚧 20.13 — `device:secureStorage` bridge capability (Research 0012)

> **Partial — key custody done, the SQLCipher database is not.** This
> repo's own three deliverables below (permission, bridge protocol
> semantics, capability reporting) are done — see `packages/manifest`'s
> `device:secureStorage` permission and `packages/sdk/src/device-client.ts`'s
> `secureStorage` surface (RFC 0093, leg 4). `sovereign-mobile`'s
> Keychain/Keystore-backed key custody is also done and build-verified on
> both platforms (iOS `xcodebuild`, Android `:app:assembleDebug`) — see that
> repo's own epic task 20.13. **Not done:** `sovereign-mobile`'s
> `@capacitor-community/sqlite` + SQLCipher database integration — the
> `secureStorage` capability built so far stores small Keychain/Keystore-
> backed values (the Device Storage Key itself, per RFC 0093 §2), not the
> actual encrypted SQLite database `device-only` plugin data would live in.
> That remains open, tracked under task 8.20's own native-backend scope and
> now planned as
> [workstream 0008](../workstreams/0008-offline-first-architecture.md)'s
> leg 9 (`sovereign-mobile`, cross-repo). `sovereign-desktop`'s Tauri
> transport (task 17.4) has also not started.

**Goal:** Extend the device bridge with durable, encrypted, device-auth-gated
storage — the capability that makes the `device-only` tier possible, and the only
storage on any surface that is not subject to web-storage eviction.

**Deliverables:**

**Scope — this task does not restate `secureStorage`.** The capability is already
defined by RFC 0083 §8, with the Tauri transport tracked as task **17.4** and
[workstream 0003](../workstreams/0003-device-bridge-across-surfaces.md) **leg 3b**
(not started). That leg was parked because "there is no plugin-facing urgency
driving this leg — pick it up when that consumer is ready to be built, or sooner
if a concrete need emerges." Research 0012's `device-only` tier **is** that
concrete need. This task adds only what is new.

**Deliverables (this repo):**

- New `device:secureStorage` permission in `packages/manifest`, alongside the
  existing `device:haptics` and `device:notifications` (`schema.ts:37-38`) — the
  plugin-facing surface RFC 0083 deliberately did not ship.
- Bridge protocol methods in `packages/bridge` for key generation, key retrieval
  under user-presence, and encrypted SQLite-backed storage — extending the
  existing `secureStorage` capability rather than defining a second one.
- Encrypted-store semantics: SQLCipher-backed, user-presence-gated keys, and the
  behaviour when the key has been invalidated.
- Capability reporting so task 3.36's detection can ask "is durable encrypted
  storage available?" rather than inferring it from the surface string.
- Consent flow consistent with the existing device-permission pattern from task
  3.35.

**Deliverables (shell repos, owned separately):**

- **`sovereign-mobile`** — Capacitor transport: native SQLite via
  `@capacitor-community/sqlite` with SQLCipher; keys in Keychain (iOS) and
  Keystore (Android) with `setUserAuthenticationRequired(true)` allowing
  `DEVICE_CREDENTIAL`, so device passcode works when biometrics are unenrolled.
  Extends task 20.3's bridge transport.
- **`sovereign-desktop`** — Tauri transport: task 17.4 / workstream 0003 leg 3b,
  unchanged in scope. Ship behind the same capability contract so a `device-only`
  plugin lights up on desktop with no manifest change once it exists.

The platform-side contract must land before either shell implements against it.
Per workstream 0003's standing rule, a shell must never advertise a
`capabilities` entry its build does not honor — the caller's `unavailable` path
would never run.

**On origin isolation:** not a concern here. Workstream 0003's leg 4 outcome
verified on both iOS Simulator and Android Emulator that the narrow
`__SOVEREIGN_BRIDGE__` is injected scoped to the runtime-chosen active instance
origin and round-trips successfully from the loaded remote instance page. Native
storage is not web storage — origin partitioning governs IndexedDB / OPFS /
Cache API, not the app sandbox reached through the bridge.

**Why this task is native-only:** this task is specifically the Capacitor
bridge transport — web's equivalent is WebAuthn PRF + OPFS, task 1.22's own
scope, not a gap left open here. Earlier framing in this doc claimed
`device-only` was native-first because iOS `WKWebsiteDataStore` eviction
makes web storage unsuitable for a wallet — true of IndexedDB, but
[RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md) resolved a
web path that doesn't route through `WKWebsiteDataStore`/IndexedDB at all
(OPFS, with its own best-effort-not-guaranteed caveat — RFC 0093 §6). The
tier is no longer native-only as a whole; this task is native-only because
of how the work is split across repos, not because web can't have it. RFC
0082 §4's claim that "nothing about offline is native-specific" still needs
revisiting for a narrower reason: the _storage-durability guarantee_ is
stronger on native than web even now, not that web has none at all.

**Dependencies:** RFC 0083, task 3.36. Coordinates with task 17.4 (Tauri
transport) rather than superseding it. Blocks tasks 1.22 and 8.20.

**SRS reference:** §3.12, §3.19.

**Review checklist:**

- A key generated under user-presence cannot be retrieved without device auth.
- Data survives an app restart and an OS storage-pressure event.
- Device passcode unlocks when no biometric is enrolled.
- The same plugin code works against both the Capacitor and Tauri
  implementations.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

## Related RFCs

- [RFC 0058 — Native mobile app shell (Capacitor)](../rfcs/0058-native-mobile-app-shell.md)
- [RFC 0082 — Focused plugin app shell](../rfcs/0082-focused-plugin-app-shell.md)
  (Tasks 20.10–20.12)
- [RFC 0013 — Mobile responsiveness & PWA hardening](../rfcs/0013-mobile-responsiveness-pwa.md)
- [RFC 0015 — Notification Center](../rfcs/0015-notification-center.md)
- [RFC 0016 — Web Push notifications](../rfcs/0016-web-push.md)
- [RFC 0038 — Desktop app shell (Tauri, macOS-first)](../rfcs/0038-desktop-app-shell.md)
- [RFC 0046 — Plugin background jobs and schedules](../rfcs/0046-plugin-jobs.md)
- [RFC 0087 — Sovereign Relay (native push notifications & WebRTC signaling)](../rfcs/0087-sovereign-relay.md)
  (Task 20.5)

## Related Docs

- [sovereign-proposal-plan-srs.md §3.12](../sovereign-proposal-plan-srs.md)
- [architecture.md](../architecture.md)
- [pwa-real-device-testing.md](../pwa-real-device-testing.md)

## Cross-references

- Epic 3 (Plugins Runtime) — `sdk.device.*` in `packages/sdk`; mobile native
  routing extends the existing SDK boundary.
- Epic 4 (Notification Center) — native push uses the platform notification
  model and must not fork notification semantics.
- Epic 17 (Desktop App Shell) — same universal shell + instance URL model.
