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

> **Follow-up fix (2026-08-09): `resolveDeepLink`'s host parsing no longer
> trusts `new URL(rawUrl).hostname` for the deep link itself.**
> `sovereign-mobile`'s port of this exact function (epic task 20.14) found,
> via live on-device debugging on Android, that Chromium WebView does not
> populate `.hostname`/`.host` at all for a non-special scheme like
> `sovereign:` — the entire `//host/path` folds into `.pathname` instead,
> leaving every deep link unresolvable. WebKit (this app's macOS engine)
> parses the identical string correctly, and so does Node (this file's own
> Vitest suite) — a green test suite here never proved this worked on
> WebView2, this app's Windows engine, which is Chromium-based and the most
> likely engine to share Android's exact gap. **Applied defensively,
> without a confirmed reproduction on real WebView2** — this workbench has
> no Windows access (see this repo's CLAUDE.md Windows-verification notes,
> also the reason task 17.10's Windows Hello support is similarly
> unconfirmed) — `resolveDeepLink` now parses the scheme/host/path directly
> from the string instead of trusting the URL parser's authority
> recognition for anything but the _stored_ instance URLs, which are
> ordinary `https://` URLs and parse identically everywhere. Regression-
> verified on macOS: `pnpm test` (24/24, including two new tests —
> case-insensitive scheme/host matching, and a renamed "no sovereign://
> prefix" case replacing the old parse-failure framing) and a real
> `open sovereign://sovereign.openfs.io/plugins/console` against the
> actual built `.app` bundle, which launched cleanly with no crash.

**SRS reference:** §3.19

**Review checklist:**

- Clicking a `sovereign://my.instance.example/plugins/console` link opens the app
  and navigates to `/plugins/console` on the matching instance
- Unknown instance shows the add-instance prompt rather than crashing
- Scheme registered correctly on macOS (`LSApplicationQueriesSchemes` in `Info.plist`)

#### 🚧 17.4 — Keychain credential storage — parked, do not revisit without reading epic task 1.24 and RFC 0072's addendum first

> **Update (2026-08): one layer of the block cleared, but this is still not
> actionable.** RFC 0082 is now **Accepted**, and epic task 1.24 shipped the
> platform-side half of RFC 0072's addendum: `sovereign-desktop` can now
> discover its own instance-specific OAuth `client_id` via
> `GET /api/instance`'s `oauthClients` field, seeded automatically per
> instance — no admin hand-registration needed. What's still missing, and
> still unscheduled: the actual shell-side PKCE flow (Rust/Tauri —
> `ASWebAuthenticationSession`-equivalent, custom-scheme redirect handling,
> token exchange) and the OS keychain storage this task is nominally about.
> Nothing in the product today depends on this — today's shells authenticate
> fine via a normal WebView session cookie, unaffected either way.
>
> **Do not re-investigate this task's design from scratch.** Read epic task
> 1.24 (`docs/epics/users-auth.md`) and
> [RFC 0072's addendum](../rfcs/0072-external-oauth-provider.md#addendum-well-known-first-party-client-for-official-native-shells)
> first — the addendum documents exactly what's implemented, what's still a
> real open question (client revocation/recreation semantics — confirmed
> real, not hypothetical), and what this task would still need to build
> against the now-live `client_id` discovery.

> **As written below, this task is stale and should not be implemented.**
> [RFC 0083 §8](../rfcs/0083-device-bridge-capability-contract.md#8-relationship-to-existing-epic-tasks)
> supersedes it: the `sdk.device.secureStore.*` plugin-facing surface
> described in the deliverables below is explicitly rejected by that RFC's
> §7 — `secureStorage` is **not plugin-facing** in v1, because client-side
> plugin identity is self-declared/spoofable, so a plugin-facing keychain API
> would let any plugin read any other plugin's stored secrets. Building the
> deliverables as literally written would reintroduce exactly the mistake
> RFC 0083 was written to avoid.
>
> RFC 0083 §7 names `secureStorage`'s actual first intended consumer as
> "RFC 0082 §5's durable-session sequel" — but
> [RFC 0082 §5](../rfcs/0082-focused-plugin-app-shell.md#5-auth--cookie-now-durable-session-named-as-the-sequel)
> explicitly labels that feature **"designed but not built here"** and
> **"unresolved; it gates the sequel"**: it depends on RFC 0072's
> dynamic-client-registration friction for OAuth, which has no resolution
> yet. RFC 0082 is also scoped to a _different_ shell concept — a
> single-plugin "focused" app (`sovereign-mobile` config-driven build
> targets) — not `sovereign-desktop`'s universal multi-instance shell this
> epic covers. There is currently no concrete, unblocked consumer for
> keychain storage in `sovereign-desktop` specifically.
>
> This task stays open (not ✅) but is now blocked, not merely
> unprioritised, until RFC 0072's client-registration question resolves and
> RFC 0082 §5's durable-session design is actually built somewhere it
> applies. Re-scope the deliverables below against RFC 0083 §6's actual
> capability shapes when that happens, rather than the pre-RFC-0083 sketch
> that follows.

**Goal (pre-RFC-0083 sketch — superseded, see above):** Store the user's
session token in the OS keychain (macOS Keychain, Windows Credential Manager,
Linux Secret Service) so it survives app restarts without relying on WebView
cookie persistence.

**Deliverables (as originally sketched — do not implement as written):**

- `tauri-plugin-stronghold` or `tauri-plugin-keychain` integration — write/read
  session token per instance
- Cleared on "Sign out" action and on instance removal
- `packages/sdk` patch — `sdk.device.secureStore.*` surface (set / get / delete)

**SRS reference:** §3.19

**Review checklist (also superseded — will need to be rewritten against
whatever consumer eventually unblocks this):**

- Session token survives an app restart without re-authentication
- Removing an instance clears its stored token from the keychain
- `sdk.device.secureStore.set/get/delete` round-trips correctly in the desktop env

#### ✅ 17.5 — Auto-updater

> **Mechanism shipped; activation is a manual, deliberately-separate step —
> not code.** `bundle.createUpdaterArtifacts: true` without a matching
> `TAURI_SIGNING_PRIVATE_KEY` was empirically confirmed (built locally both
> ways) to break `tauri build` outright — a hard bundler error, unlike the
> macOS `APPLE_*` signing secrets, which degrade gracefully to an unsigned
> build when unset. `sovereign-desktop`'s `tauri.conf.json` therefore ships
> with a placeholder `pubkey` and `createUpdaterArtifacts` intentionally
> absent, so `pnpm build`/`pnpm dev` and `release.yml` stay completely
> unaffected until a real signing key is generated and configured — an
> ordered checklist in that repo's README's "Enabling auto-updates" section
> (generate a keypair, add two GitHub secrets already forwarded by
> `release.yml`, paste the public key into config, flip one boolean).
>
> Two deliberate deviations from the sketch below, resolved in the
> checklist's favor where the two disagreed: the update prompt is a
> **native dialog** (`tauri-plugin-dialog`), not a WebView banner — the
> WebView may be showing the bundled local page or a loaded instance at
> any given moment, and shell UI must not touch either, the same reasoning
> behind epic task 17.8's navigation policy. And "Update Now" downloads,
> installs, and restarts **immediately**, not "on quit" — matching the
> checklist's own "app restarts to the new version" wording, which the
> original deliverables bullet's "install on quit" phrasing didn't quite
> agree with.

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

#### ✅ 17.9 — `camera.photo` capability (native file picker only)

> **Scoped deliberately narrower than mobile's — file picker only, never
> live webcam capture.** Identified as a gap by comparing implemented
> `sdk.device.*` capabilities across `sovereign-mobile` and
> `sovereign-desktop`: mobile shipped `camera.photo` (epic task 20.6), and
> nothing in this repo advertised or implemented it — `bridge.rs`'s
> `bridge_invoke` only matched `notifications.native`. Live capture was
> considered and rejected: most desktops have no camera at all, and a
> laptop's front-facing webcam is a poor fit for the same "photograph a
> document" use case mobile's camera solves — not worth the extra
> complexity (permission prompts, a live preview surface) for low product
> value. `tauri-plugin-dialog`'s native file picker was already a
> dependency (the auto-updater's prompt, task 17.5) and satisfies the same
> `DeviceResult<{ dataUrl, mimeType }>` contract with no SDK changes
> required — `packages/sdk/src/device-client.ts`'s `camera.photo` already
> calls `bridge.invoke('camera.photo', { source })` generically and uses
> whatever a registered bridge returns, exactly as it does for
> `notifications.native`. The `source: 'camera' | 'library'` field the SDK
> sends is intentionally ignored: both resolve to the same picker, since
> there is no separate "camera" mode on this transport to route to.
>
> **Verification, recorded honestly.** `cargo build`/`cargo check` succeed;
> `cargo test` passes (10 tests: the 8 pre-existing navigation-policy tests
> plus 2 new ones covering `mime_type_for_extension`'s known/unknown
> extension cases); `cargo fmt --check` is clean on the changed files. The
> hand-written, unbundled JS string in `bridge_script()` (`lib.rs`) that now
> advertises `camera.photo` was independently checked for syntax validity
> with Node before committing. **Not verified:** an actual file picked
> through the native OS dialog end-to-end — same category as mobile's
> `biometrics.confirm` gap (epic task 20.7), and for the same underlying
> reason: no real plugin caller exists yet to trigger it, and a native OS
> file dialog needs GUI interaction this environment cannot drive
> headlessly either way.

**Goal:** Implement `sdk.device.camera.photo` for the Tauri transport so
plugins that already call it on mobile/web get a working desktop
equivalent instead of silently falling through to `unavailable`.

**Deliverables:**

- `src-tauri/src/bridge.rs` — `camera_photo()`: `tauri-plugin-dialog`'s
  `DialogExt::file().add_filter(...).blocking_pick_file()`, filtered to
  `png`/`jpg`/`jpeg`/`gif`/`webp`; reads the picked file, base64-encodes it,
  and returns `{ dataUrl, mimeType }` via the same `ok`/`dismissed`/`failed`
  helpers `notify()` already uses. No distinct OS cancel signal beyond
  `None` from `blocking_pick_file()`, so a cancelled pick resolves
  `dismissed`.
- `src-tauri/src/lib.rs`'s `bridge_script()` — `camera.photo` added to the
  advertised `capabilities` array
- `src-tauri/Cargo.toml` — `base64 = "0.22"` (new dependency; encodes the
  picked file into the `dataUrl` the SDK contract expects)
- `capabilities/bridge.json`'s description updated to name both
  `bridge_invoke` actions now implemented
- No new capability/permission grant: `tauri-plugin-dialog`'s Rust API is
  called directly from `bridge_invoke`, the same pattern
  `tauri-plugin-notification`'s `NotificationExt` already uses — its
  JS-invokable commands are never exposed to any origin

**SRS reference:** §3.19

**Review checklist:**

- `cargo build`/`cargo check` succeed
- `cargo test` passes, including the new `mime_type_for_extension` unit tests
- Requesting `sdk.device.camera.photo()` from a loaded instance opens a
  native "choose a file" dialog scoped to image files
- Picking a file resolves `{ status: 'ok', value: { dataUrl, mimeType } }`
  with a correctly-typed `data:` URL
- Cancelling the dialog resolves `{ status: 'dismissed' }`, not `failed`
- `source: 'camera'` and `source: 'library'` behave identically (both open
  the same picker) — documented as intentional, not a bug

#### ✅ 17.10 — `biometrics.confirm` capability (macOS Touch ID; Windows Hello written, unverified)

> **Another gap identified against sovereign-mobile — no Tauri plugin
> covers this, so it goes straight to each OS's native framework.**
> `tauri-plugin-biometric`'s own README lists desktop support explicitly:
> `Linux ✗, Windows ✗, macOS ✗, Android ✓, iOS ✓`. This capability does not
> exist for desktop anywhere in the Tauri plugin ecosystem.
>
> **macOS** (`src/biometrics/macos.rs`) calls `LocalAuthentication.framework`
> directly via `objc2-local-authentication` — the same `LAContext`/
> `canEvaluatePolicy`/`evaluatePolicy` API sovereign-mobile's `Bridge.swift`
> already calls from Swift, reached through Rust↔Objective-C FFI instead.
> `evaluatePolicy:localizedReason:reply:` is callback-only (Apple exposes no
> blocking variant, since evaluation may show UI), so it is bridged into
> `bridge_invoke`'s synchronous `#[tauri::command]` via a channel — the same
> shape `tauri-plugin-dialog`'s own `blocking_pick_file()` uses internally
> for its callback-based picker (task 17.9). The `LAError` → `DeviceResult`
> mapping mirrors `Bridge.swift`'s exactly, verified against
> `objc2-local-authentication`'s real generated constants, not guessed.
>
> **Windows** (`src/biometrics/windows.rs`) calls
> `Windows.Security.Credentials.UI.UserConsentVerifier` via the `windows`
> crate's WinRT bindings — API shapes read from the real generated bindings
> before writing this, not guessed. **This machine has no Windows toolchain
> at all**, so it is written but genuinely unverified beyond a
> cross-compile type-check (`rustup target add x86_64-pc-windows-msvc` +
> `cargo check --target x86_64-pc-windows-msvc`, isolated in a standalone
> probe crate since the full `sovereign-desktop` binary can't even be
> cross-checked here — an unrelated pre-existing dependency, `ring`, needs
> Windows C headers this machine doesn't have). Do not treat this as more
> verified than "type-checks" until someone builds and runs it on real
> Windows.
>
> **Linux** has no standard OS biometric primitive, so it always reports
> `unavailable` — the same no-op precedent `haptics.impact` already
> established (RFC 0083 §7). `lib.rs`'s `capabilities_list()` accordingly
> advertises `biometrics.confirm` only on macOS/Windows builds, omitted on
> Linux for the same reason `haptics.impact` is omitted everywhere: no
> point advertising a capability that always resolves `unavailable`.
>
> **Verification, recorded honestly, and sharply different per platform:**
> ✅ `cargo build`/`cargo check`/`cargo test` succeed on this machine's
> actual target (macOS) — 8/8 pre-existing tests still pass, no new ones
> added (nothing here is pure-function-testable the way `camera.photo`'s
> MIME mapping was). ✅ A standalone probe using the exact same macOS call
> sequence compiled and, when run, correctly passed `canEvaluatePolicy`
> (confirming Touch ID is genuinely available on this dev machine) and then
> blocked waiting on a real interactive OS prompt — killed before
> completion rather than clicked through, so the FFI plumbing is proven but
> the success/error-mapping path itself is not end-to-end verified. ✅ The
> full `sovereign-desktop` dev app was launched (`pnpm dev`) with this code
> compiled in and stayed up with no crash or panic, confirming the
> platform-conditional bridge-script injection doesn't break app boot. ❌
> **Not verified:** an actual Touch ID prompt clicked through to a real
> `ok`/`denied`/`dismissed` outcome (same category as `camera.photo` and
> mobile's own `biometrics.confirm` gap — no real plugin caller exists yet
> to trigger this from the loaded instance either). ❌ **Windows: not built,
> not linked, not run at all** — type-check only, as detailed above.

**Goal:** Implement `sdk.device.biometrics.confirm()` for the Tauri
transport so plugins that already call it on mobile get a working desktop
equivalent (Touch ID on macOS, Windows Hello on Windows) instead of
silently falling through to `unavailable`.

**Deliverables:**

- `src-tauri/src/biometrics/mod.rs` — `confirm(reason)` entrypoint,
  platform-dispatched via `#[cfg(target_os = ...)]`
- `src-tauri/src/biometrics/macos.rs` — Touch ID via
  `objc2-local-authentication`'s `LAContext`
- `src-tauri/src/biometrics/windows.rs` — Windows Hello via the `windows`
  crate's `UserConsentVerifier` (written, cross-compile-type-checked only)
- `src-tauri/Cargo.toml` — `[target.'cfg(target_os = "macos")'.dependencies]`
  (`objc2`, `objc2-foundation`, `objc2-local-authentication`, `block2`) and
  `[target.'cfg(target_os = "windows")'.dependencies]` (`windows`, with the
  `Security_Credentials_UI` feature)
- `src-tauri/src/bridge.rs` — `"biometrics.confirm"` dispatch, plus a new
  `denied()` `DeviceResult` helper (the first capability on this transport
  to need it)
- `src-tauri/src/lib.rs`'s `bridge_script()`/`capabilities_list()` —
  `biometrics.confirm` advertised only when `cfg!(any(target_os = "macos",
target_os = "windows"))`
- `capabilities/bridge.json`'s description updated to name all three
  `bridge_invoke` actions now implemented, with `biometrics.confirm` called
  out as narrower-not-equivalent to a browser-tab API (no WebAuthn-style
  fallback, and deliberately scoped to a local presence confirmation only —
  never a session or platform-auth grant, matching sovereign-mobile's ADR
  0003 framing)
- No new capability/permission grant: both native frameworks are called
  directly from `bridge_invoke`'s Rust code, the same pattern
  `tauri-plugin-notification`/`tauri-plugin-dialog` already use

**SRS reference:** §3.19

**Review checklist:**

- `cargo build`/`cargo check`/`cargo test` succeed on macOS
- `cargo check --target x86_64-pc-windows-msvc` succeeds for the isolated
  `biometrics::windows` API shapes (full-binary cross-check is blocked by
  an unrelated pre-existing dependency on this machine)
- `pnpm dev` boots the app cleanly with the platform-conditional bridge
  script compiled in
- Requesting `sdk.device.biometrics.confirm()` from a loaded instance on
  macOS shows the Touch ID/password prompt; a successful match resolves
  `{ status: 'ok' }`
- `biometrics.confirm` is absent from the advertised `capabilities` array
  on Linux, `unavailable` if invoked anyway
- Manual, once Windows access is available: confirm `src/biometrics/windows.rs`
  actually builds, links, and round-trips a real Windows Hello prompt

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
