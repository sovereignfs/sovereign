# Epic 20: Mobile App Shell

> Capacitor-based iOS and Android shell app that loads a user's self-hosted
> Sovereign instance in a WebView.

## Status

📋 Planned

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

#### 📋 20.1 — sovereign-mobile — Capacitor shell scaffold

**Goal:** Bootstrap `sovereign-mobile` with a working Capacitor shell for iOS and
Android: first-launch instance URL onboarding, persistent instance storage,
WebView loading, navigation policy, and multiple-instance switching.

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

#### 📋 20.2 — Mobile instance validation and compatibility endpoint

**Goal:** Define and implement the stable runtime endpoint used by native shells
to validate a user-entered Sovereign instance URL and discover client
compatibility metadata.

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

#### 📋 20.5 — Native push notifications (APNs/FCM)

**Goal:** Add native mobile push notification support through `sdk.device.*` and
the platform notification system so users can receive alerts when the app is not
open.

**Deliverables:**

- Capacitor push notifications integration for APNs and FCM
- Runtime/API support for registering and revoking per-user mobile device tokens
- `sdk.device.*` or notification SDK routing for native push registration
- Account UI or preferences surface for mobile push opt-in/opt-out
- Permission strings, privacy declarations, and operator configuration docs
- Tests for token registration, revocation, and permission/error states

**Dependencies:** Task 20.3; RFC 0015 Notification Center; RFC 0016 Web Push.

**SRS reference:** §3.12; notification transport RFCs

**Review checklist:**

- User can opt in to push on iOS and Android.
- Revoking permission or signing out removes or invalidates the device token.
- Push payloads do not expose sensitive content beyond documented behavior.
- Browser/PWA notification behavior remains unchanged.
- Missing APNs/FCM configuration degrades to a documented no-op.

#### 📋 20.6 — Native photo picker and camera capture

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

#### 📋 20.7 — Biometric auth capability

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

#### 📋 20.8 — Haptics capability

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

## Related RFCs

- [RFC 0058 — Native mobile app shell (Capacitor)](../rfcs/0058-native-mobile-app-shell.md)
- [RFC 0013 — Mobile responsiveness & PWA hardening](../rfcs/0013-mobile-responsiveness-pwa.md)
- [RFC 0015 — Notification Center](../rfcs/0015-notification-center.md)
- [RFC 0016 — Web Push notifications](../rfcs/0016-web-push.md)
- [RFC 0038 — Desktop app shell (Tauri, macOS-first)](../rfcs/0038-desktop-app-shell.md)
- [RFC 0046 — Plugin background jobs and schedules](../rfcs/0046-plugin-jobs.md)

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
