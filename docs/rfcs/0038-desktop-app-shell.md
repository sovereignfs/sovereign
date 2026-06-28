---
rfc: 0038
title: Desktop app shell (Tauri, macOS-first)
status: Accepted
date: June 2026
author: kasunben
scope: sovereign-desktop (separate repo), docs, CLAUDE.md, packages/sdk
incorporated_into_plan: 'Yes — epic tasks 17.1–17.6'
---

## Summary

A minimal desktop shell app (`sovereign-desktop`) built with Tauri 2.x. On first
launch the user enters their self-hosted Sovereign instance URL; the shell loads
that URL in a WebView and persists it for subsequent launches. Multiple instances
are supported. macOS ships first; Windows and Linux follow with the same codebase.

This mirrors the mobile strategy (documented in CLAUDE.md and SRS §3.12) — same
universal shell + instance URL model, same `sdk.device.*` abstraction for plugin
developers, separate repository.

## Motivation

The PWA (v1) covers most desktop use cases but has limits: no persistent system
presence, no OS-level notifications on macOS, no deep link scheme, no dock icon
without a browser window open. A Tauri shell closes these gaps without requiring
plugins to change — `sdk.device.*` handles environment routing.

Sovereign's self-hosted positioning also benefits from a native download: it
signals permanence and trust in a way a browser tab does not, and aligns with how
Nextcloud, Bitwarden, and Element present their desktop clients.

## Current state

- PWA ships in v1 (RFC 0013, Task 0.5.1) — installable via browser on macOS/Windows.
- Mobile strategy decided (CLAUDE.md, SRS §3.12) — Capacitor shell, `sovereign-mobile`
  repo, `sdk.device.*` abstraction.
- `sdk.device.*` is defined in `packages/sdk` — the abstraction layer already exists;
  a `"desktop"` environment check is not yet wired.
- No Electron or Tauri references anywhere in the codebase or RFC corpus.

## Proposed design

### Repository

`sovereign-desktop` — separate repository under the Sovereign project, not in this
monorepo. Same pattern as the planned `sovereign-mobile`. Developed and versioned
independently of the platform.

### Technology: Tauri 2.x

| Concern           | Choice                         | Why                                                            |
| ----------------- | ------------------------------ | -------------------------------------------------------------- |
| Shell framework   | Tauri 2.x                      | Minimal shell philosophy; system WebView; ~5 MB binary         |
| WebView (macOS)   | WKWebView (Safari/WebKit)      | Already targeted by mobile PWA; no new compat surface          |
| WebView (Windows) | WebView2 (Chromium-based)      | Tauri default; good modern-Windows coverage                    |
| WebView (Linux)   | WebKitGTK                      | Tauri default; acceptable for self-hosters on Linux            |
| Shell logic       | TypeScript (`@tauri-apps/api`) | Consistent with the rest of the stack; no Rust needed for v1   |
| Native plugins    | Tauri plugin system (post-v1)  | Mirrors Capacitor's plugin pattern; add capabilities as needed |
| Build / release   | Tauri CLI + GitHub Actions     | `.app` + `.dmg` macOS; `.exe`/`.msi` Windows; AppImage Linux   |

### First-launch onboarding flow

```
App opens
  └─ No instance URL stored?
       └─ Show onboarding screen
            └─ User enters instance URL (e.g. https://my.sovereign.example)
                 └─ Validate: GET /api/admin/health → expect 200 + { status: "ok" }
                      ├─ Valid → persist URL → load URL in WebView
                      └─ Invalid → inline error, let user retry
  └─ URL stored?
       └─ Load stored URL directly in WebView
```

Multiple instances stored as an ordered list; instance switcher UI deferred to
implementation.

### Shell capabilities

| Capability                  | v1  | Post-v1 (Tauri plugin)                      |
| --------------------------- | --- | ------------------------------------------- |
| Instance URL onboarding     | ✅  | —                                           |
| Persistent URL storage      | ✅  | —                                           |
| WebView shell               | ✅  | —                                           |
| Multiple instance switcher  | ✅  | —                                           |
| macOS `.dmg` distribution   | ✅  | —                                           |
| Windows `.exe`/`.msi`       | ✅  | —                                           |
| Linux `.AppImage`/`.deb`    | ✅  | —                                           |
| System tray / menu bar      | —   | `tauri-plugin-system-tray` (task 17.2)      |
| OS-level notifications      | —   | `tauri-plugin-notification` (task 17.2)     |
| Deep link scheme            | —   | `sovereign://` deep link plugin (task 17.3) |
| Keychain credential storage | —   | `tauri-plugin-stronghold` (task 17.4)       |
| Auto-updater                | —   | `tauri-plugin-updater` (task 17.5)          |
| Mac App Store distribution  | —   | Sandbox entitlements + MAS CI (task 17.6)   |

### Device API tier (desktop)

Same three-tier model as mobile:

| Tier            | Technology                                         | Works in browser? |
| --------------- | -------------------------------------------------- | ----------------- |
| Web APIs        | Standard browser APIs, work in WKWebView           | ✅                |
| Tauri plugins   | JS bridge to native OS capabilities (post-v1)      | ❌                |
| SDK abstraction | `sdk.device.*` — detects env, routes to right tier | ✅                |

Plugin developers call `sdk.device.*` only — identical contract to mobile. The SDK
implementation adds a `"desktop"` environment check alongside existing
`"browser"` / `"native"` (mobile) checks. No plugin code changes required.

### Distribution

- **v1:** Direct download via GitHub Releases — `.dmg` (macOS), `.exe`/`.msi`
  (Windows), `.AppImage`/`.deb` (Linux).
- **Post-v1:** Mac App Store (requires Apple Developer account, sandboxing,
  notarization — deferred).

macOS `.dmg` requires code signing + Gatekeeper notarization even for direct
download (macOS 10.15+). Tauri's pipeline handles this via GitHub Actions secrets:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`.

## SDK impact

`packages/sdk` gains a `"desktop"` environment in `sdk.device.*` routing. No new
public API surface — internal environment detection only. Semver: patch bump.

## Alternatives considered

- **Electron:** ~150 MB binary (bundles full Chromium); philosophically inconsistent
  with Sovereign's lightweight identity and the Capacitor choice for mobile. Rejected.
- **PWA only:** Already ships; insufficient — system tray, OS notifications, deep
  links, and keychain are not available to PWAs on macOS/Windows.
- **Native Swift / SwiftUI:** Platform-locked, requires Swift expertise, inconsistent
  with the TypeScript-throughout stack. Rejected.

## Open questions

1. Minimum macOS version target — 13 (Ventura) or 12 (Monterey)?
2. Onboarding screen: local HTML (cross-platform, simpler) or native SwiftUI window
   (better macOS feel but platform-specific)?
3. Auto-updater in v1 scope or deferred? Simple to add in Tauri; avoids users running
   stale binaries.

## Adoption path

1. RFC merges.
2. Epic task 17.1 — `sovereign-desktop` scaffold: onboarding, WebView, persistent
   storage, macOS `.dmg` CI release; SDK `"desktop"` environment patch.
3. Epic task 17.2 — system tray + OS notifications.
4. Epic task 17.3 — deep link scheme (`sovereign://`).
5. Epic task 17.4 — keychain credential storage.
6. Epic task 17.5 — auto-updater.
7. Epic task 17.6 — Mac App Store distribution (last: requires sandbox review).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
