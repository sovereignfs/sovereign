# Workstream 0010 — Desktop native push relay

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Goal owner:** `kasunben`\
**RFCs:** [0087](../rfcs/0087-sovereign-relay.md) — governing design; this
workstream sequences its "Desktop native push" addendum\
**Epics touched:** 4 (Notification Center, this monorepo), 17 (Desktop, this
monorepo's task 17.11 plus the `sovereign-desktop` repository itself)\
**Prior art:** [Workstream 0005](0005-native-push-relay.md) (the mobile leg
this one extends — same relay, same schema, same encryption scheme, same
fan-out branch)

---

## Goal

A `sovereign-desktop` user on macOS or Windows can receive a real, decrypted
push notification without the app foregrounded — on macOS, even while fully
quit; on Windows, while the process is alive but not necessarily
foregrounded (tray-resident is sufficient — see RFC 0087's addendum for why
a fully-quit Windows app cannot receive push without breaking the relay's
content-blind guarantee). Linux gets no new capability from this workstream
— documented as a permanent platform gap, not a deferred task. At the end of
this workstream: `push_device_tokens`, the relay, and `fanOutPushToUser`
serve three client platforms (`sovereign-mobile`'s two plus
`sovereign-desktop`'s two) through the same schema and the same encryption
scheme, with zero changes to the fan-out function itself.

## Definition of done

- [ ] A self-hosted instance can register a `sovereign-desktop` macOS
      device's push token and public key, and revoke it on sign-out/instance
      removal.
- [ ] Same, for Windows.
- [ ] `fanOutPushToUser` delivers to a registered desktop device via the
      relay, in the same fan-out as Web Push and mobile native — verified
      with a user who has a browser subscription, a mobile device, and a
      desktop device all registered simultaneously.
- [ ] The relay never receives, logs, or is otherwise capable of accessing
      plaintext notification content for either desktop platform — verified
      by inspecting the actual network payload, not just by reading the code
      that's supposed to guarantee this (same standard workstream 0005 held
      itself to).
- [ ] A push is received and correctly displayed on real macOS hardware with
      real APNs sandbox credentials while `sovereign-desktop` is fully
      quit — content is a placeholder banner while quit per RFC 0087's
      addendum, full content once opened; verify both states.
- [ ] A push is received and correctly displayed on real Windows hardware
      with real WNS credentials while `sovereign-desktop` is running
      (tray-resident) but not foregrounded.
- [ ] An instance's already-configured relay URL (workstream 0005) is reused
      unmodified — this workstream adds no second relay-configuration
      surface.
- [ ] Both this monorepo's and `sovereign-desktop`'s docs describe the
      Windows running-app-only limitation and the Linux gap plainly, not as
      an implementation detail buried in code comments.
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` (this
      monorepo); `pnpm format:check && pnpm lint && pnpm typecheck && pnpm
test && cargo test` (`sovereign-desktop`).

## Decisions locked

Settled in [RFC 0087's "Desktop native push" addendum](../rfcs/0087-sovereign-relay.md#addendum-desktop-native-push-macos-apns-windows-wns-linux-out-of-scope).
Full reasoning there; summarized here for quick reference.

| Decision                 | Choice                                                                             | Rejected alternative, and why                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS transport          | APNs — same service as iOS, distinct bundle-ID topic (`APNS_BUNDLE_ID_MACOS`)      | A separate push service for macOS — doesn't exist; APNs already covers all Apple platforms                                                                         |
| macOS closed-app content | Generic placeholder banner while quit; real content once opened                    | A macOS Notification Service Extension equivalent now — no existing Tauri bundle tooling to embed one; deferred as a separable later leg, not rejected outright    |
| Windows transport        | WNS, raw notifications only                                                        | WNS toast notifications — would show real closed-app banners, but requires plaintext content in the payload to Microsoft, breaking RFC 0087's content-blind design |
| Windows availability     | Delivery only while the process is running (tray-resident counts)                  | True closed-app delivery — would require MSIX packaging + a registered background task, a distribution change out of scope here                                    |
| Linux                    | No new capability; foreground/loaded-instance notifications only (already shipped) | UnifiedPush — a legitimate future answer, but a bigger, separate research question, not scoped into this workstream                                                |
| Schema                   | Widen existing `push_device_tokens.platform`, no new table                         | A separate desktop-specific device-token table — rejected, the existing schema is already platform-agnostic by design (untyped `text` column)                      |
| Fan-out                  | No change to `fanOutPushToUser`                                                    | N/A — confirmed by reading the current implementation that it already forwards `platform` opaquely                                                                 |
| On-device crypto         | Rust (`p256`/`aes-gcm`/`hkdf` crates), same wire format as iOS/Android             | A different crypto library or framing — rejected, the whole point of RFC 0087's wire-format choice was cross-language compatibility without conversion             |

## Prerequisites

- RFC 0087's addendum accepted (Draft status is sufficient to begin, per
  this repo's own precedent for workstream 0005 itself).
- `sovereignfs` needs a second APNs bundle ID (`fs.sovereign.desktop`)
  registered under the same Apple Developer Program account already used
  for `sovereign-mobile` — incremental, not a new relationship, but a real
  step someone has to take. **Owned by `kasunben`, not automatable — flag
  before leg 2 starts if this isn't provisioned yet.**
- A Partner Center app reservation for `sovereign-desktop`'s Windows
  identity (Package SID + client secret) — new relationship, free tier.
  **Owned by `kasunben`.**
- `sovereign-desktop` epic task 17.2 (system tray + OS notifications,
  already merged) — this workstream's client-side display step reuses
  `notifications.native`'s existing path, same as mobile leg 4 did.
- Workstream 0005 fully merged (schema, relay, fan-out, encryption scheme
  all already exist and are reused verbatim, not rebuilt).

## Legs

| Leg | Name                                   | Epic tasks    | Repo                | Gate? | Done when                                                                     |
| --- | -------------------------------------- | ------------- | ------------------- | ----- | ----------------------------------------------------------------------------- |
| 1   | Schema + registration API widening     | 4.8 (partial) | `sovereign`         | No    | Instance can register/revoke a `'macos'`/`'windows'` device token             |
| 2   | Relay: macOS APNs topic + Windows WNS  | 4.8 (partial) | `sovereign`         | No    | `apps/relay` forwards a real encrypted blob to a real macOS or Windows device |
| 3   | `sovereign-desktop` client (both OSes) | 17.11         | `sovereign-desktop` | No    | A real device receives and displays a decrypted push per the DoD above        |

Three legs, not four — unlike workstream 0005, there is no separate
fan-out leg here, since `runtime/src/push.ts` already generalizes with zero
changes (confirmed in the RFC addendum). `sovereign-desktop`'s macOS and
Windows registration ship together in one leg per the developer's own
"one PR, everything" preference from workstream 0005's leg 4 — the two
platforms share the same Rust crypto/storage code and diverge only in their
native registration call, so splitting them would mean more cross-leg
coordination for less isolation benefit than mobile's client-vs-NSE split
had.

**Cross-repo parallelism**, as in workstream 0005: leg 3
(`sovereign-desktop`) can start building its registration call and
encryption once leg 1's endpoint contract is confirmed unchanged (it is —
this workstream doesn't modify the registration endpoint's shape beyond
widening the accepted `platform` values), without waiting for leg 2. Full
end-to-end verification needs all three legs done.

## Leg detail

### Leg 1 — Schema + registration API widening

**Epic tasks:** 4.8 (schema + API portion only)

**Technical notes:**

- Widen the `platform` validation in
  `runtime/app/api/account/push-device-token/route.ts` from `'ios' |
'android'` to also accept `'macos'` and `'windows'`. No schema migration —
  `push_device_tokens.platform` is already an untyped `text` column in both
  dialects.
- Widen the corresponding doc comment in
  `packages/db/src/schema/{sqlite,postgres}/platform.ts`.
- No relay integration in this leg, matching workstream 0005 leg 1's own
  scoping — registration/revocation must work standalone first.

**Do not proceed if:** the registration endpoint's accepted-platform list
isn't stable enough for `sovereign-desktop` (leg 3, a different repo) to
start building against.

### Leg 2 — Relay: macOS APNs topic + Windows WNS

**Epic tasks:** 4.8 (relay portion)

**Depends on:** Leg 1 only loosely, same relationship workstream 0005's
legs 1/2 had.

**Technical notes:**

- Generalize `apps/relay/src/apns.ts`'s `sendApnsPush()` to accept an
  explicit `apns-topic` argument instead of reading `config.bundleId`
  internally; `apps/relay/src/config.ts`'s `apnsConfig()` gains
  `APNS_BUNDLE_ID_MACOS` (additive — `APNS_BUNDLE_ID` keeps meaning iOS,
  unchanged, no breaking change to workstream 0005's already-shipped
  config). `apps/relay/app/v1/push/route.ts` selects the topic by platform
  before calling `sendApnsPush`.
- New `apps/relay/src/wns.ts`: OAuth2 client-credentials token fetch
  against `https://login.live.com/accesstoken.srf` (`WNS_PACKAGE_SID` as
  `client_id`, `WNS_CLIENT_SECRET`), cached and proactively refreshed
  (~24h validity), sending **raw** notifications (`X-WNS-Type: wns/raw`)
  directly to the device's channel URI. See RFC 0087's addendum for why
  raw-only, not toast.
- `apps/relay/src/config.ts` gains `wnsConfigured()`/`wnsConfig()`, same
  "gate, don't throw" discipline as `apnsConfigured()`/`fcmConfigured()`.
- `apps/relay/app/v1/push/route.ts` widens its platform dispatch:
  `'ios'`/`'macos'` → APNs, `'android'` → FCM, `'windows'` → WNS.
- Verify the WNS OAuth2 token request/response shape and the raw-
  notification POST against Microsoft's actual documented contract before
  trusting it — the same "verify empirically, don't assume API
  compatibility" discipline workstream 0005 leg 2 applied to APNs/FCM JWT
  signing, even though full live verification (a real Package SID/secret,
  a real channel URI) is unavailable in this environment.
- No payload inspection, no content logging — same non-negotiable as
  workstream 0005 leg 2.

**Do not proceed if:** `sovereignfs`'s second APNs bundle ID or the Windows
Partner Center identity aren't actually available yet — flagged in
Prerequisites; this leg's real credentials are owned by `kasunben`, not
automatable.

### Leg 3 — `sovereign-desktop` client (macOS + Windows)

**Epic tasks:** 17.11

**Depends on:** Leg 1's endpoint contract (can start once confirmed stable,
per the parallelism note above); full end-to-end verification needs leg 2
deployed too.

**Technical notes:**

- On-device P-256 keypair via the `p256` crate; ECDH + HKDF-SHA256 +
  AES-256-GCM via `hkdf`/`aes-gcm` — must produce the exact same 65-byte
  SEC1/X9.63 public-key point and wire format iOS/Android already use.
  Verify empirically the same way workstream 0005 leg 4 did: encrypt with
  one generated keypair (in Node or another already-verified client),
  decrypt in Rust using only the retained private key, not a round-trip
  inside one process.
- Private key storage: macOS Keychain via the `security-framework` crate;
  Windows Credential Manager via the `windows` crate. Store both the public
  and private key at generation time on both platforms — deriving a public
  key back out of a stored private key alone is the same non-portable
  problem workstream 0005 leg 4 hit on Android, and the fix is the same.
- Registration is native Rust, not the bundled onboarding page's JS and not
  routed through `bridge.json`'s remote grant — read the active instance
  URL from `tauri-plugin-store`'s `instances.json` directly (the same
  source `store.ts` already writes), read the session cookie via Tauri's
  webview cookie API, `POST` to `/api/account/push-device-token` with
  `platform: 'macos'` or `'windows'`.
- **macOS device-token registration spike (do this first):** call
  `NSApplication.registerForRemoteNotifications()` and receive
  `application:didRegisterForRemoteNotificationsWithDeviceToken:` /
  `application:didFailToRegisterForRemoteNotificationsWithError:`. These
  are `NSApplicationDelegate`-only callbacks with no Tauri-level
  equivalent — `tao` (Tauri's windowing crate) owns the application
  delegate already. The spike: add these selectors to `tao`'s existing
  Objective-C delegate class at runtime via the Objective-C runtime
  (`objc2`, already a dependency for epic task 17.10's Touch ID). This
  environment has real macOS and can build/run the result for real, even
  though ad-hoc local signing (no real Apple Developer Team configured
  here, same limitation workstream 0005 leg 4 hit with Keychain access
  groups) means only the failure callback is verifiable here, not the
  success path with a real device token.
- **Windows device-channel registration:** obtain a channel URI via
  `Windows.Networking.PushNotifications.PushNotificationChannelManager`
  (the `windows` crate), associating the unpackaged process with the
  Partner Center Package SID — the exact current API for that association
  needs verification during implementation, per RFC 0087's addendum's open
  questions. Real verification is blocked on both a Windows machine and
  real Partner Center credentials; ships cross-compile-checked only
  (`cargo check --target x86_64-pc-windows-msvc`), same posture already
  established for epic task 17.10's `src/biometrics/windows.rs`.
- macOS decrypt-and-display: generic placeholder banner while quit (no
  Notification Service Extension equivalent — see RFC 0087's addendum for
  why), full content decrypted and shown via the existing
  `notifications.native` path once the app is opened.
- Windows decrypt-and-display: since delivery only reaches a running
  process, decrypt inline wherever the app receives the raw WNS payload
  (its own background/tray event loop) and display via the same
  `notifications.native` path — no separate extension needed here either,
  unlike iOS.
- Revocation call on sign-out and on instance removal, both paths,
  independently verified — same standard workstream 0005 leg 4 held itself
  to for mobile.
- Version bump: `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json` in lockstep, per this repo's own versioning
  rule.

**Do not proceed if:** the macOS delegate-selector spike doesn't work at
all (not even the failure callback firing) — that would mean the entire
`objc2`-based approach needs rethinking before the rest of this leg has
anywhere to attach, the same "verify the sharp edge before building on it"
standard workstream 0005 leg 4 applied to iOS's Keychain access groups.

## Risks

- **The macOS `NSApplicationDelegate` spike is genuinely new native
  surface area** for this ecosystem — no Tauri precedent in this repo for
  adding delegate methods to `tao`'s Objective-C class at runtime. Budget
  real debugging time, not just implementation time, matching workstream
  0005's own risk note about the iOS Notification Service Extension.
- **Windows registration is entirely unverifiable in this environment** —
  no Windows machine, no real Partner Center credentials. Ships
  structurally complete and cross-compile-checked, same posture already
  accepted for epic task 17.10's Windows Hello code; the actual first real
  verification will happen on `kasunben`'s own Windows hardware, outside
  this workbench.
- **A second APNs bundle ID doubles the relay's Apple-side credential
  surface** — `sovereignfs` now maintains push credentials for two app
  identities under one Developer account. Not a new _kind_ of
  responsibility (workstream 0005 already established this pattern), but
  a real increase in what a credential rotation or incident response needs
  to cover.
- **Cross-repo drift**, same as workstream 0005: leg 3 lives in
  `sovereign-desktop`, its own PR queue and review cadence. This
  workstream's Definition of done can only be fully verified once both
  repos' work has merged.

## Kill criteria

If the macOS `NSApplicationDelegate` spike proves unworkable (no way to
receive the device-token callback without destabilizing `tao`'s own window
management), the fallback is **not** to ship an unencrypted or plaintext-
adjacent macOS path — it's to pause leg 3's macOS half and revisit whether
a real Xcode-project-based extension (outside Tauri's normal build, closer
to how `sovereign-mobile`'s NSE was built) is worth the added build-tooling
investment. Windows's leg can still ship independently either way, since it
doesn't depend on the macOS spike. If Windows registration turns out to
need real MSIX packaging after all (i.e. the unpackaged-app identity-
association path doesn't actually work the way this workstream assumes),
that's a signal to re-open RFC 0087's addendum rather than force a
workaround — packaged distribution is a bigger decision than this
workstream should make implicitly.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
