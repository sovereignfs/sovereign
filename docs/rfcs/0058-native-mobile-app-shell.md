---
rfc: 0058
title: Native mobile app shell (Capacitor)
status: Draft
date: July 2026
author: kasunben
scope: sovereign-mobile (separate repo), docs, packages/sdk
incorporated_into_plan: 'Yes - epic tasks 20.1-20.9'
---

## Summary

A minimal native mobile shell app (`sovereign-mobile`) built with Capacitor. One
app is published for iOS and Android. On first launch, the user enters the URL of
their self-hosted Sovereign instance; the app persists that URL and loads the
instance in a WebView. Multiple instances are supported.

The native app does not duplicate Sovereign's runtime, auth, shell, or plugin
system. The user's instance remains the source of truth. The mobile app is a
thin native wrapper that provides distribution through the App Store and Play
Store, native permissions, WebView hosting, and a path for richer device APIs via
`sdk.device.*`.

## Motivation

Sovereign v1 ships as an installable PWA. That covers the install-from-browser
use case, but it does not cover users who expect a native app from the App Store
or Play Store, nor does it provide the best path for native-only capabilities
such as APNs/FCM push, biometric auth, native photo picking, haptics, and
background location.

The product model is self-hosted and plugin-first, so the native app must not
become a second platform. It should load the user's own instance unchanged. That
keeps plugins portable across browser, PWA, and native mobile, and lets the
platform continue to evolve in the web runtime instead of forking behavior into
Swift and Kotlin clients.

## Current state

- The SRS already defines native mobile as a post-v1 plan:
  `docs/sovereign-proposal-plan-srs.md:680`.
- The SRS decision log records three related decisions:
  `docs/sovereign-proposal-plan-srs.md:1164`,
  `docs/sovereign-proposal-plan-srs.md:1165`, and
  `docs/sovereign-proposal-plan-srs.md:1166`.
- `docs/architecture.md:216` summarizes native mobile as a Capacitor shell plus
  `sdk.device.*`, designed but out of v1 scope.
- RFC 0013 treats mobile web hardening as the baseline inherited by the future
  Capacitor shell: `docs/rfcs/0013-mobile-responsiveness-pwa.md:38`.
- RFC 0038 mirrors this client model for desktop:
  `docs/rfcs/0038-desktop-app-shell.md:18`.

## Proposed design

### Repository

`sovereign-mobile` is a separate repository under the Sovereign project, not a
package inside this monorepo. It is developed and versioned independently of the
platform, matching the documented desktop-shell pattern.

The repository owns only native shell concerns:

- Capacitor app scaffold.
- iOS and Android project files.
- First-launch onboarding UI for instance URL entry.
- Persistent instance list storage.
- WebView loading and navigation policy.
- Native permission declarations.
- App Store and Play Store release metadata.
- Native bridge implementation needed by `sdk.device.*`.

### Technology: Capacitor

| Concern           | Choice                      | Why                                                      |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| Shell framework   | Capacitor                   | TypeScript-first shell for iOS and Android               |
| iOS WebView       | WKWebView                   | Standard iOS WebView; same engine targeted by mobile web |
| Android WebView   | Android System WebView      | Standard Android runtime WebView                         |
| Shell logic       | TypeScript                  | Consistent with the rest of Sovereign                    |
| Native extensions | Capacitor plugins           | Standard bridge for native-only capabilities             |
| Native languages  | Swift/Kotlin only as needed | Avoids platform-specific app logic by default            |
| Release channels  | App Store and Play Store    | Expected distribution path for native mobile users       |

### First-launch onboarding flow

```
App opens
  |- No instance URL stored?
  |    |- Show onboarding screen
  |    |- User enters instance URL
  |    |- Validate URL against the instance
  |    |    |- Valid: persist URL, then load it in the WebView
  |    |    `- Invalid: show inline error and let the user retry
  `- URL stored?
       `- Load stored URL directly in the WebView
```

The validation endpoint should be stable, unauthenticated, and already available
to deployments before the mobile shell ships. If no dedicated mobile capability
endpoint exists when implementation starts, use the same health/capability check
chosen for the desktop shell to avoid divergent client logic.

### Multiple instances

The shell stores an ordered list of instance URLs. Users can add, remove, and
switch between instances such as personal and work deployments. The active
instance is loaded in the WebView; switching instances replaces the WebView URL
instead of creating a separate native account model.

Session state remains owned by the instance in its WebView storage. The mobile
shell may expose instance management UI, but it does not own Sovereign users,
roles, auth sessions, or plugin permissions.

### WebView and navigation policy

The shell loads only user-configured Sovereign instances in the primary WebView.
External links should open in the platform browser or an approved in-app browser
surface instead of silently navigating the shell away from the configured
instance.

The runtime remains responsible for:

- Auth and session handling.
- Plugin routing and shell layout.
- CSP and security headers.
- PWA/mobile responsive behavior inherited by the WebView.
- Server-rendered UI and plugin composition.

The native shell is responsible for:

- Instance URL onboarding and persistence.
- WebView lifecycle.
- Store-facing app metadata.
- Native permission declarations.
- Native bridge calls exposed through the SDK.

### Device API strategy

The mobile shell follows the three-tier strategy already recorded in the SRS.

| Tier              | Technology                                                | Examples                                                                                | Browser support            |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| Web APIs          | Standard browser APIs available in WebView                | GPS, camera/mic, accelerometer, Web Push where supported                                | Yes                        |
| Capacitor plugins | JS bridge to native code                                  | Native photo picker, APNs/FCM push, Face ID/fingerprint, background location, haptics   | No, native shell only      |
| SDK abstraction   | `sdk.device.*` detects environment and routes accordingly | `sdk.device.getLocation()`, `sdk.device.capturePhoto()`, future device capability calls | Yes, with browser fallback |

Plugin developers call `sdk.device.*` only. They do not import Capacitor plugins
or branch directly on native shell internals. The SDK implementation detects the
environment and selects the browser, PWA, or native-mobile tier. Plugins should
continue to run unchanged outside the native shell.

### Capability roadmap

| Capability                             | Initial shell | Later native capability             |
| -------------------------------------- | ------------- | ----------------------------------- |
| Instance URL onboarding                | Yes           | -                                   |
| Persistent instance storage            | Yes           | -                                   |
| WebView shell                          | Yes           | -                                   |
| Multiple instance switcher             | Yes           | -                                   |
| iOS App Store distribution             | Yes           | -                                   |
| Android Play Store distribution        | Yes           | -                                   |
| Native photo picker                    | No            | Capacitor camera/photo plugin       |
| APNs/FCM push notifications            | No            | Capacitor push notifications plugin |
| Face ID / fingerprint                  | No            | Capacitor biometric auth plugin     |
| Haptics                                | No            | Capacitor haptics plugin            |
| Background location or background work | No            | Separate capability RFC/task        |

The initial shell should stay small. Native capability work lands only when a
plugin-facing SDK contract exists and the permission/privacy behavior is
documented.

### Store and privacy constraints

The published app must be clear that it connects to a user-provided Sovereign
instance. Store metadata should avoid implying that Sovereign hosts the user's
data by default.

Before store submission, implementation tasks must define:

- App privacy labels / data safety declarations.
- Required native permission strings and justifications.
- Minimum supported iOS and Android versions.
- App identifiers, signing, and release ownership.
- Whether instance URL entry allows any HTTPS URL or only validated Sovereign
  instances.

The shell should not introduce telemetry by default. Any future crash reporting
or analytics must follow Sovereign's privacy-first posture and be opt-in or
operator-controlled.

## UI flows

### Add first instance

1. User installs and opens the mobile app.
2. Shell shows a first-run screen asking for the Sovereign instance URL.
3. User enters an HTTPS URL.
4. Shell validates that the URL is reachable and identifies as a compatible
   Sovereign instance.
5. Shell stores the instance URL and loads it in the WebView.
6. User signs in through the instance's normal auth flow.

### Switch instance

1. User opens the native shell's instance switcher.
2. Shell lists saved instances.
3. User selects another instance.
4. Shell replaces the WebView URL with the selected instance.
5. That instance's own auth/session state determines whether the user is already
   signed in.

### Use a native-backed device capability

1. A plugin calls `sdk.device.*`.
2. The SDK detects that it is running in the native mobile shell.
3. If a native implementation exists, the SDK calls the Capacitor bridge.
4. The OS prompts for permission when required.
5. The SDK returns a normalized result or a normalized permission/error state to
   the plugin.
6. The same plugin code keeps working in browser/PWA contexts through Web API
   fallback or documented unsupported states.

## Alternatives considered

- PWA only: already the v1 plan and remains supported, but it does not satisfy
  store distribution or all native capability needs.
- Separate native apps per instance: rejected because self-hosters would need to
  build and distribute their own app. That conflicts with the goal of one
  reusable Sovereign mobile shell.
- React Native: better for fully native UI, but Sovereign's UI and plugin system
  already live in the web runtime. Rebuilding platform UI in React Native would
  create a second client.
- Hotwire Native with Swift and Kotlin: offers a more native-feeling wrapper, but
  it requires platform-specific implementation and custom bridges for each device
  capability. Capacitor better matches the TypeScript stack and SDK abstraction.
- Plugins calling Capacitor directly: rejected because it breaks portability and
  couples plugin code to one shell. `sdk.device.*` remains the boundary.

## Open questions

1. Which endpoint should the shell use for first-launch instance validation and
   compatibility metadata?
2. Minimum supported iOS and Android versions.
3. Whether push notifications ship with the initial shell or as the first
   follow-up native capability.
4. How the instance switcher is exposed without fighting the web shell's own
   navigation and account UI.
5. Exact package shape for the SDK's native bridge adapter.

## Adoption path

1. RFC merges and becomes the canonical native mobile design reference.
2. Epic tasks 20.1-20.9 track the mobile shell, validation endpoint, SDK bridge,
   store release setup, and native capability phases.
3. Create the `sovereign-mobile` repository with Capacitor, onboarding, WebView
   loading, persistent instance storage, and iOS/Android builds.
4. Add SDK native-mobile environment routing for `sdk.device.*`. Public SDK
   surface changes require semver according to the actual API delta.
5. Add native capability tasks one at a time, each with permission, privacy, SDK,
   docs, and store-review impact called out.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
