# Epic 17: Desktop App Shell

> Tauri-based desktop shell app that loads a user's self-hosted Sovereign
> instance in a WebView — macOS first, Windows and Linux follow.

## Status

📋 Planned

## Overview

Sovereign's post-v1 native client strategy uses the same model for mobile and
desktop: a minimal shell where the user enters their instance URL on first launch
and the shell loads it in a WebView. All functionality is served by the user's own
instance — the shell provides only the native wrapper.

The desktop shell (`sovereign-desktop`, separate repository) is built with
Tauri 2.x: TypeScript for all shell logic, system WebView on each platform
(WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), ~5 MB binary.
This mirrors the Capacitor choice for mobile: minimal shell, web content does
the work, native capabilities added via Tauri plugins as needed.

Plugin developers are unaffected — `sdk.device.*` gains a `"desktop"` environment
check internally; no plugin code changes required.

## Tasks

#### 📋 17.1 — sovereign-desktop — Tauri shell scaffold (macOS-first)

**Goal:** Bootstrap `sovereign-desktop` with a working Tauri 2.x shell —
first-launch instance URL onboarding, URL validation against
`/api/admin/health`, persistent storage, WebView loading, multiple instance
support — and a GitHub Actions workflow producing a signed/notarized macOS
`.dmg` plus unsigned Windows and Linux artifacts on every tagged release.

**Deliverables:**

- `sovereign-desktop/` (new repo):
  - `src-tauri/` — Tauri 2 scaffold (`tauri.conf.json`, `Cargo.toml`, `src/lib.rs`)
  - `src/onboarding.ts` — first-launch URL entry + `/api/admin/health` validation
  - `src/store.ts` — instance URL list via `@tauri-apps/plugin-store`
  - `src/main.ts` — boot: check stored URLs → onboarding or load WebView
  - `index.html` — onboarding UI (local HTML rendered on first launch)
  - `.github/workflows/release.yml` — builds `.dmg` (macOS, signed + notarized),
    `.exe`/`.msi` (Windows), `.AppImage`/`.deb` (Linux) on `v*` tags
- ~~`packages/sdk` patch — add `"desktop"` environment to `sdk.device.*` routing~~
  — deferred to task 17.7: `sdk.device.*` does not exist in `packages/sdk` yet
  (post-v1 surface), so there is no routing to patch

**macOS CI secrets required:** `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
(notarization via Apple ID requires the team ID alongside the four secrets
listed in RFC 0038).

**SRS reference:** §3.19, §3.12 (mobile; same model)

**Review checklist:**

- `cargo tauri dev` opens the app; onboarding screen shown on first launch
- Valid instance URL loads the instance in the WebView and persists across restarts
- Invalid URL shows an inline error; app does not crash
- Multiple instance entries can be added and switched between
- `cargo tauri build` produces a `.app` bundle and `.dmg`
- GitHub Actions `release.yml` runs on a `v0.1.0` tag and attaches all artifacts

#### 📋 17.2 — System tray and OS notifications

**Goal:** Add persistent system presence via a menu bar / system tray icon and
OS-level notifications so users receive Sovereign alerts even when the main window
is closed.

**Deliverables:**

- `tauri-plugin-system-tray` integration — tray icon with a context menu: Open,
  Switch Instance (submenu), Quit
- `tauri-plugin-notification` integration — `sdk.device.notify()` routes to native
  OS notifications in the `"desktop"` environment (falls back to Web Notifications
  API in browser)
- `packages/sdk` minor bump — `sdk.device.notify()` desktop tier implementation

**SRS reference:** §3.19

**Review checklist:**

- App shows a tray icon on macOS menu bar after launch
- Closing the main window does not quit the app; tray icon remains
- Context menu "Open" restores the window
- `sdk.device.notify({ title, body })` triggers a native macOS notification
- Web Notifications API fallback still works in the browser

#### 📋 17.3 — Deep link scheme (`sovereign://`)

**Goal:** Register a `sovereign://` URL scheme so links in emails and browsers
open the desktop app and navigate to the correct instance and path.

**Deliverables:**

- `tauri-plugin-deep-link` integration — registers `sovereign://` on macOS,
  Windows, and Linux
- URL parsing: `sovereign://<instance-host>/<path>` → validate instance is in
  stored list → load WebView at `https://<instance-host>/<path>`
- Unknown instance → prompt user to add it via onboarding flow

**SRS reference:** §3.19

**Review checklist:**

- Clicking a `sovereign://my.instance.example/plugins/console` link opens the app
  and navigates to `/plugins/console` on the matching instance
- Unknown instance shows the add-instance prompt rather than crashing
- Scheme registered correctly on macOS (`LSApplicationQueriesSchemes` in `Info.plist`)

#### 📋 17.4 — Keychain credential storage

**Goal:** Store the user's session token in the OS keychain (macOS Keychain,
Windows Credential Manager, Linux Secret Service) so it survives app restarts
without relying on WebView cookie persistence.

**Deliverables:**

- `tauri-plugin-stronghold` or `tauri-plugin-keychain` integration — write/read
  session token per instance
- Cleared on "Sign out" action and on instance removal
- `packages/sdk` patch — `sdk.device.secureStore.*` surface (set / get / delete)

**SRS reference:** §3.19

**Review checklist:**

- Session token survives an app restart without re-authentication
- Removing an instance clears its stored token from the keychain
- `sdk.device.secureStore.set/get/delete` round-trips correctly in the desktop env

#### 📋 17.5 — Auto-updater

**Goal:** Allow the app to check for and apply updates in-app so users are never
silently running a stale binary.

**Deliverables:**

- `tauri-plugin-updater` integration — checks GitHub Releases for a new version
  on startup (configurable interval)
- Update prompt UI: version number, changelog excerpt, "Update now" / "Later"
- Background download + install on quit

**SRS reference:** §3.19

**Review checklist:**

- App checks for updates on launch and shows a banner when a newer version exists
- "Update now" downloads and installs the update; app restarts to the new version
- "Later" dismisses the banner until the next launch
- No update available → no UI shown

#### 📋 17.6 — Mac App Store distribution

**Goal:** Publish the macOS build to the Mac App Store as an alternative to
direct download, reaching users who prefer sandboxed App Store apps.

**Deliverables:**

- Tauri build configured for Mac App Store sandboxing (`com.apple.security.*`
  entitlements for WebView network access, keychain, notifications)
- `MAS_CERTIFICATE`, `MAS_PROVISIONING_PROFILE` CI secrets and signing flow
- App Store Connect listing (screenshots, description, privacy nutrition labels)
- Separate GitHub Actions job: `release-mas.yml` — builds MAS variant and submits
  via `xcrun altool` / `notarytool`

**SRS reference:** §3.19

**Review checklist:**

- MAS build passes `codesign --verify` with sandbox entitlements
- Submitted build passes App Review (no private API usage)
- App Store listing shows correct screenshots and privacy labels

#### 📋 17.7 — SDK `"desktop"` environment for `sdk.device.*`

**Goal:** Add the `"desktop"` environment to `sdk.device.*` routing so plugins
calling the device abstraction detect the Tauri shell and route to the correct
tier. Deferred from task 17.1: `sdk.device.*` does not exist in `packages/sdk`
yet (post-v1 surface), so there was no routing to patch when the shell scaffold
shipped.

**Deliverables:**

- `packages/sdk` — `"desktop"` environment detection alongside `"browser"` /
  `"native"` in the `sdk.device.*` surface. If `sdk.device.*` has not landed by
  the time this task is picked up, ship the desktop check as part of its first
  implementation instead. Semver: patch bump when routing already exists, minor
  when this lands with the initial surface.

**SRS reference:** §3.19, §3.12

**Review checklist:**

- `sdk.device.*` reports `"desktop"` inside the Tauri shell and `"browser"` in a
  plain browser tab on the same instance
- `pnpm test` passes in `packages/sdk` after the addition

## Related RFCs

- [RFC 0038 — Desktop app shell (Tauri, macOS-first)](../rfcs/0038-desktop-app-shell.md)

## Related Docs

- [CLAUDE.md — Desktop app (post-v1 plan)](../../CLAUDE.md)
- [sovereign-proposal-plan-srs.md §3.12 and §3.19](../sovereign-proposal-plan-srs.md)

## Cross-references

- Epic 3 (Plugins Runtime) — `sdk.device.*` in `packages/sdk`; desktop tier is a
  patch to the existing abstraction
- Mobile (`sovereign-mobile`, post-v1) — same universal shell + instance URL model
