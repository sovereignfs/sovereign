# Epic 17: Desktop App Shell

> Tauri-based desktop shell app that loads a user's self-hosted Sovereign
> instance in a WebView — macOS first, Windows and Linux follow.

## Status

⏳ In Progress

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

#### ✅ 17.1 — sovereign-desktop — Tauri shell scaffold (macOS-first)

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

#### ✅ 17.2 — System tray and OS notifications

> **Both halves complete, shipped separately.** Notifications shipped via
> [workstream 0003](../workstreams/0003-device-bridge-across-surfaces.md) leg
> 3, rescoped to the Tauri transport of `@sovereignfs/bridge` —
> `sdk.device.nativeNotifications.show()` (not `sdk.device.notify()` as
> originally sketched below) routes to native OS notifications on desktop via
> `tauri-plugin-notification`, empirically verified end-to-end. The system
> tray half shipped separately, directly in `sovereign-desktop` (unrelated to
> the bridge): a persistent tray/menu-bar icon with an Open / Switch
> Instance… / Quit menu, built on Tauri 2's built-in `tray-icon` crate
> feature rather than a dedicated plugin (no such plugin exists for Tauri 2 —
> the `tauri-plugin-system-tray` name below was carried over from the Tauri 1
> API and never matched the v2 dependency graph). Closing the main window now
> hides it instead of quitting, so the app stays reachable for notifications;
> Quit (tray menu or Cmd+Q) is the only full exit.

**Goal:** Add persistent system presence via a menu bar / system tray icon and
OS-level notifications so users receive Sovereign alerts even when the main window
is closed.

**Deliverables:**

- Tauri's built-in `tray-icon` feature (`src-tauri/src/lib.rs` in
  `sovereign-desktop`) — tray icon with a context menu: Open, Switch
  Instance…, Quit
- `tauri-plugin-notification` integration — `sdk.device.nativeNotifications.show()`
  routes to native OS notifications in the `"desktop"` environment (falls back to
  Web Notifications API in browser)

**SRS reference:** §3.19

**Review checklist:**

- App shows a tray icon on macOS menu bar after launch
- Closing the main window does not quit the app; tray icon remains
- Context menu "Open" restores the window
- `sdk.device.nativeNotifications.show({ title, body })` triggers a native macOS notification
- Web Notifications API fallback still works in the browser

#### ✅ 17.3 — Deep link scheme (`sovereign://`)

> **Resolution happens in TypeScript, not Rust — Rust only relays the raw
> URL.** The plugin's own `deep-link://new-url` event is undocumented-race-y
> on macOS (it can arrive slightly after this app's `setup()` runs, so a
> Rust-side handler registered there can still lose a cold-launch race
> against the JS boot path redirecting to a stored instance first). Rather
> than fighting that race, `src-tauri/src/lib.rs` unconditionally forces the
> webview back to the local bundled page with the raw URL attached as
> `?deeplink=` — on cold launch (via the plugin's `get_current()`, populated
> from CLI args on Windows/Linux before this app's own `setup()` runs) and on
> every subsequent open while running (via `on_open_url`). `main.ts` /
> `src/deep-link.ts` then do the actual host-matching against the stored
> instance list — the same page that already owns that list, rather than
> duplicating it in Rust. No `@tauri-apps/plugin-deep-link` JS dependency and
> no new capability/permission grant were needed as a result, since no
> JS-side plugin command is ever called.

**Goal:** Register a `sovereign://` URL scheme so links in emails and browsers
open the desktop app and navigate to the correct instance and path.

**Deliverables:**

- `tauri-plugin-deep-link` (Rust-side only) — registers `sovereign://` via
  `tauri.conf.json`'s `plugins.deep-link.desktop.schemes` (verified against
  the built `.app`'s `Info.plist` → `CFBundleURLTypes`)
- URL parsing (`src/deep-link.ts`'s `resolveDeepLink`): `sovereign://<instance-host>/<path>`
  → validate instance is in stored list by hostname → load WebView at the
  matching stored instance's origin + path
- Unknown instance → prompt user to add it via onboarding flow, pre-filled
  with the deep link's host, and resume to the intended path once added

**Known limitation:** Windows/Linux have no single-instance plugin yet, so a
`sovereign://` click while the app is already running opens a second OS
process rather than routing to the existing window (the deep-link plugin's
own documented behavior without `tauri-plugin-single-instance`). A natural
follow-up if it proves annoying in practice; not blocking since macOS ships
first.

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

> **Subsumed by [RFC 0080](../rfcs/0080-plugin-surface-model.md) and
> [RFC 0083](../rfcs/0083-device-bridge-capability-contract.md).** This task
> predates both and assumed it would patch an existing `sdk.device.*` routing that
> never got built. Environment detection now lands in Task 3.32 (which creates the
> surface, including the `desktop` value); transport detection lands in Task 3.34.
> Nothing separate remains here — close it against those tasks rather than
> implementing it. Tasks 17.2's notification half and 17.4 are **rescoped** to the
> Tauri transport of `@sovereignfs/bridge`; see RFC 0083 §8 and leg 3 of
> [workstream 0003](../workstreams/0003-device-bridge-across-surfaces.md).

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

#### ✅ 17.8 — Navigation policy enforcement

> **RFC 0038 never carried over RFC 0058's navigation-policy requirement to
> desktop.** RFC 0058 (mobile) requires: "The shell loads only
> user-configured Sovereign instances in the primary WebView. External links
> should open in the platform browser or an approved in-app browser surface
> instead of silently navigating the shell away from the configured
> instance." Mobile implemented this in
> [ADR 0007](https://github.com/sovereignfs/sovereign-mobile/blob/main/docs/adrs/0007-navigation-policy-enforcement.md)
> via a native `WKNavigationDelegate` / `shouldOverrideUrlLoading` on each
> platform; desktop had no equivalent until this task, even though the same
> silent-navigation-away risk applies equally to a WebView-based shell. This
> task closes that gap for desktop rather than opening it as a fresh design
> question — the policy itself was already decided for the sibling shell.

**Goal:** Same-origin navigation (the currently active instance) stays in the
shell's WebView; cross-origin navigation opens in the system browser instead
of silently taking over the shell.

**Deliverables:**

- `src-tauri/src/lib.rs`'s `WebviewWindowBuilder::on_navigation` — Tauri 2's
  built-in navigation-decision hook (`Fn(&Url) -> bool`), the desktop
  equivalent of iOS's `decidePolicyFor` / Android's
  `shouldOverrideUrlLoading`. Local origin (the bundled onboarding/manager
  page) is always allowed; a navigation matching the currently active
  instance's origin — read directly from the same `instances.json` store
  `src/store.ts` already persists via `tauri-plugin-store`'s Rust API, so
  there is exactly one source of truth for "what's active," matching how
  mobile's ADR 0007 reads its own native store — is allowed; anything else is
  cancelled and reopened via `tauri-plugin-opener`'s `open_url` (system
  default browser)
- No new capability/permission grant: the policy decision and the browser-open
  call both happen entirely in Rust, with no JS-side plugin command involved

**`window.open()` / `target="_blank"` gap — closed as a same-day follow-up.**
Those requests go through a _separate_ Tauri hook (`on_new_window`), not
`on_navigation`; left unregistered they silently no-op (Tauri/WRY's own
default with no handler configured) rather than following the policy. Safe
either way — nothing escapes to an unmanaged native window — but not
feature-complete until `on_new_window` was also wired up, reusing the same
`is_allowed_navigation` decision: same-origin gets a real new window, anything
else is denied and reopened in the system browser, same outcome as
`on_navigation` reaches for a plain link.

**SRS reference:** §3.19 (desktop), §3.12 (mobile equivalent, same
requirement)

**Review checklist:**

- Clicking a link inside the loaded instance to a path on the same origin
  stays in the app's WebView
- Clicking a link to a different origin (e.g. an external documentation link)
  opens the system default browser and leaves the app's WebView on the
  instance, unchanged
- The bundled onboarding/instance-manager page's own navigations (first
  launch, Switch Instance…, a resolved deep link) are unaffected
- A same-origin `target="_blank"` link opens a real new window; a
  cross-origin one opens the system browser instead of silently no-op'ing
- No new entries needed in `capabilities/default.json` or `capabilities/bridge.json`

## Related RFCs

- [RFC 0038 — Desktop app shell (Tauri, macOS-first)](../rfcs/0038-desktop-app-shell.md)
- [RFC 0058 — Native mobile app shell](../rfcs/0058-native-mobile-app-shell.md)
  (source of Task 17.8's navigation-policy requirement, carried over from
  mobile's ADR 0007)
- [RFC 0080 — Plugin surface model](../rfcs/0080-plugin-surface-model.md)
  (supplies the `desktop` surface value; subsumes Task 17.7)
- [RFC 0083 — Device bridge and capability contract](../rfcs/0083-device-bridge-capability-contract.md)
  (rescopes Task 17.2's notification half and Task 17.4 to the Tauri transport)

## Related Docs

- [CLAUDE.md — Desktop app (post-v1 plan)](../../CLAUDE.md)
- [sovereign-proposal-plan-srs.md §3.12 and §3.19](../sovereign-proposal-plan-srs.md)

## Cross-references

- Epic 3 (Plugins Runtime) — `sdk.device.*` in `packages/sdk`; desktop tier is a
  patch to the existing abstraction
- Mobile (`sovereign-mobile`, post-v1) — same universal shell + instance URL model
