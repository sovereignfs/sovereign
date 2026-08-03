# RFC 0085 — Native mobile push notification relay

**Status:** Draft\
**Date:** August 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Scope:** `packages/db` (new device-token schema), `runtime` (registration
API, extends RFC 0015/0016's fan-out), a new standalone service
`apps/push-relay` (this monorepo), `sovereign-mobile` (external repo — client
registration, encryption, native decrypt-and-display; tracked there via that
repo's own epic 20 task 20.5)\
**Incorporated into plan:** Yes — epic task 4.7 (this monorepo) and epic task
20.5, rescoped (`sovereign-mobile`'s client-side half). Sequenced by
[workstream 0005](../workstreams/0005-native-push-relay.md).

---

## Summary

This RFC adds native mobile push notifications (APNs for iOS, FCM for
Android) to Sovereign, for the one client context that structurally cannot
use the existing Web Push mechanism (RFC 0016): the Capacitor-wrapped
`sovereign-mobile` native app. It introduces one new piece of
`sovereignfs`-operated infrastructure — a small, end-to-end-encrypted relay
service — because APNs/FCM require credentials tied to one app identity,
and `sovereign-mobile` is one published app used by many independent
self-hosted instances that cannot each hold that credential. The relay is
content-blind by design (Nextcloud's proven pattern, not a novel one): every
self-hosted instance encrypts the notification payload against the
recipient device's own public key before it ever leaves the instance: the
relay forwards an opaque blob it cannot read. Every self-hosted instance
defaults to `sovereignfs`'s relay but can point at a different one via
config, and an operator who wants zero dependency on it can build and
publish their own signed app variant instead — a real, low-cost-to-Sovereign
escape hatch, not a hypothetical one.

## Motivation

`sovereign-mobile` task 20.5 has existed as a roadmap line item without a
real design: "add native push" was scoped as if it were a Capacitor
integration task dependent only on RFC 0015/0016. It isn't — see
[Research 0010](../research/0010-native-mobile-push-notifications.md) for
the full investigation, including confirmation (from Apple's own DTS
engineers and Chromium's issue tracker) that Web Push is platform-blocked
inside a WKWebView/WebView embedded in a third-party app, and research into
how Nextcloud, Matrix/Element, Home Assistant, and Bitwarden — all
comparable self-hosted or federated products — solved the identical
problem. Without this RFC, the native mobile app can never notify a user
once the app is closed; PWA and browser-tab users are unaffected either way
since Web Push already works for them.

This ties directly to Sovereign's self-hosted, privacy-first positioning:
every other device capability (RFC 0083's `haptics.impact`,
`notifications.native`, `secureStorage`) is architected so the shell talks
only to the user's own instance and the OS, never to a `sovereignfs`-run
server. Native push is the first capability that cannot honor that pattern
completely — Apple/Google's push transport requires a credentialed sender
in the loop by design — so this RFC's central design goal is minimizing
what that sender can see, not just making push work.

## Current state (what this builds on)

- **RFC 0015 (Notification Center)** and **RFC 0016 (Web Push)** are both
  Implemented. The delivery fan-out lives in `runtime/src/push.ts`:
  `fanOutPushToUser(userId, payload)` fetches every registered subscription
  for a user (`getPushSubscriptionsForUser`) and delivers to each
  independently via `Promise.allSettled`, pruning subscriptions the push
  service reports as gone (`runtime/src/push.ts:89–163`). This RFC adds a
  second delivery branch to the same function; it does not restructure it.
- **`push_subscriptions`** (`packages/db/src/schema/{sqlite,postgres}/platform.ts`)
  stores the Web Push `PushSubscription` shape (`endpoint`, `p256dh`,
  `auth`) — structurally incompatible with an APNs/FCM device token, which
  needs a different shape (see below).
- **RFC 0083 (device bridge, Draft)** shipped `notifications.native` in
  workstream 0003 (legs 3/4) — a foreground-only, locally-triggered
  capability (`sdk.device.nativeNotifications.show()`), unrelated to this
  RFC's server-initiated delivery except that the native app **reuses it
  to display** a push once decrypted (see "Client-side flow" below).
- **`apps/auth`** is this monorepo's only precedent for a standalone
  deployable app outside the main `runtime` Next.js app — a minimal Next.js
  service with its own `package.json`, `Dockerfile`, and
  `scripts/next-server.mjs`-driven dev/start scripts. `apps/push-relay`
  follows the same shape (see "The relay service" below).
- **`sovereign-mobile`** already has a `notificationPermissionLauncher`-style
  runtime-permission flow (Android `POST_NOTIFICATIONS`, iOS
  `UNUserNotificationCenter`) from workstream 0003 leg 4 — this RFC's
  client-side permission handling extends the same pattern rather than
  introducing a new one.

## Proposed design

### Device-token schema

New table, dialect-agnostic (SQLite + Postgres, per this repo's hard rule),
alongside `push_subscriptions` in `packages/db/src/schema/{sqlite,postgres}/platform.ts`:

```
push_device_tokens
  id              text/uuid primary key
  user_id         references users.id, cascade delete
  platform        'ios' | 'android'
  device_token    text — the raw APNs device token or FCM registration token
  public_key      text — base64-encoded device public key (encryption target)
  relay_url       text — the relay this token was registered against (see below)
  created_at      timestamp
  last_used_at    timestamp, nullable — updated on successful delivery
```

`relay_url` is stored per-token, not read from a single instance-wide
setting at send time — an operator can change their configured relay after
a device has already registered, and old tokens must keep resolving to the
relay they actually registered with until the device re-registers.

### Client-side flow

Detailed further in `sovereign-mobile`'s own epic task 20.5.

1. On first enabling push, the app generates an encryption keypair on-device
   (native `CryptoKit` on iOS, Android's `KeyStore`-backed equivalent — not
   exportable, private key never leaves the device).
2. `@capacitor/push-notifications` registers with APNs/FCM as normal,
   yielding a device token.
3. The app sends `{platform, deviceToken, publicKey}` to its **own**
   instance's new registration endpoint (below) — the relay URL used is
   whatever that instance is currently configured with.
4. On receipt of a push, native platform code (an iOS **Notification
   Service Extension** — required to run code before the OS displays a
   banner; Android's FCM background handling needs no separate extension)
   decrypts the payload with the stored private key and populates the
   notification content, reusing the `notifications.native` display path
   from workstream 0003.
5. Sign-out or instance removal calls the revocation endpoint, deleting the
   `push_device_tokens` row; a token the relay reports as invalid (device
   uninstalled the app) is pruned the same way `push_subscriptions` already
   is on a 410/404.

### Server-side: registration API and fan-out extension (`runtime`)

- `POST /api/account/push-device-token` — registers `{platform, deviceToken,
publicKey}` for the current session's user, storing the instance's
  currently configured relay URL alongside it. Mirrors
  `/api/account/push-subscription`'s existing shape and auth handling.
- `DELETE /api/account/push-device-token/:id` — revokes one token
  (sign-out, instance removal, or explicit opt-out).
- `fanOutPushToUser` (`runtime/src/push.ts`) gains a second branch: for
  each row in `push_device_tokens` for the recipient, encrypt `payload`
  against `public_key` (see "Encryption" below) and POST the result to
  `relay_url`. Both branches run inside the same `Promise.allSettled` fan-
  out already there — a user with a browser tab, a PWA, and the native app
  installed gets all three delivered independently, exactly as a user with
  two browsers already does today.

### Encryption

The relay must never be able to decrypt a payload — this is the whole point
of the design, not an optional hardening pass. Reuses the same _concept_
RFC 0016 already implements (public-key encryption against a
client-generated keypair, no shared secret ever transmitted), but not its
exact wire format: Web Push's `aes128gcm` framing (RFC 8291) exists to
satisfy browser `PushManager` internals, a constraint that doesn't apply
here since Sovereign controls both the encrypting server and the decrypting
native client. Proposed: ECDH (P-256, the same curve already in use for
VAPID) to derive a shared secret with the device's public key, HKDF to
derive an AES-256-GCM key, standard authenticated encryption of the JSON
payload. All primitives have first-class support in Node's `crypto` module
(server) and native `CryptoKit`/`javax.crypto` (client) — no exotic
cross-platform crypto library dependency needed. Exact framing (nonce
handling, associated data) is an implementation detail for the workstream,
not re-litigated here, but must be specified in code review before this
ships, given the security stakes.

### The relay service (`apps/push-relay`)

A new, minimal, mostly-stateless Next.js app, following `apps/auth`'s
existing precedent (own `package.json`, `Dockerfile`,
`scripts/next-server.mjs` dev/start scripts) rather than introducing a new
framework or deployment pattern to this monorepo. Two responsibilities:

- `POST /v1/push` — accepts `{deviceToken, platform, encryptedPayload,
instanceKey}`. Validates `instanceKey` (see "Relay authentication"
  below), forwards to APNs (HTTP/2, JWT signed with `sovereignfs`'s `.p8`
  key) or FCM (HTTP v1 API, `sovereignfs`'s service-account credential)
  depending on `platform`, returns the outcome — including a distinct
  "token invalid" result so the calling instance can prune it the same way
  a 410 from `web-push` already prunes `push_subscriptions`.
- Nothing else. No payload inspection, no logging of decrypted content (it
  never receives any), no persistent notification history. The smaller
  this service's surface area, the smaller the blast radius of it being
  compromised — it should hold exactly the Apple/Firebase credentials and
  nothing else sensitive.

**Relay authentication.** Each self-hosted instance obtains a lightweight
API key from the relay at enrollment (`POST /v1/enroll`, one-time, before
first use) and includes it as `instanceKey` on every `/v1/push` call. This
is deliberately minimal — not a full OAuth flow — since the credential
being protected here is "ability to trigger opaque pushes," not user data;
its job is basic abuse prevention (rate-limiting per instance, revocable if
an instance is misbehaving), not strong authorization. Full design
(enrollment flow, key rotation, rate-limit thresholds) is left to
implementation, flagged here so it isn't skipped.

### Relay URL configurability (the operator escape hatch)

An instance's configured push-relay URL is a normal admin-configurable
setting (Console, alongside other operator configuration), defaulting to
`sovereignfs`'s relay. Changing it does nothing by itself — a different
relay only works if the app talking to it was built with credentials that
relay is actually authorized to use, which (per Research 0010's findings)
means a _different, separately signed app build_ on iOS, and either a
different app build or a dynamically-registered second Firebase project on
Android. This RFC does not build tooling for that path — it only ensures
the relay URL is never hard-coded, so the path remains open to an operator
who wants to take it, matching Bitwarden's precedent exactly (`push.bitwarden.com`
by default, `push.bitwarden.eu`, a self-hosted relay, or disabled entirely
— all first-class supported configurations, not one blessed path with
everything else unsupported).

## Alternatives considered

See [Research 0010](../research/0010-native-mobile-push-notifications.md#options-considered)
for the full option comparison (A–E) that preceded this RFC. Summary of what
was rejected and why:

- **Unencrypted full-payload relay** — simpler, but means every self-hosted
  instance's notification content transits a `sovereignfs`-operated server.
  Rejected once the Nextcloud precedent showed the encrypted version costs
  little extra and has no meaningful reliability downside.
- **Silent-wake-then-fetch** (rather than a directly encrypted payload) —
  the originally proposed design before precedent research; depends on
  iOS/Android's unpredictable background-execution budget for the
  content-fetch step, a real reliability risk. Superseded by delivering the
  encrypted payload directly in one push, per Nextcloud's design.
- **Operator-supplied credentials via Console, no relay** — investigated in
  depth (Research 0010): structurally impossible for iOS (Apple's Bundle
  ID / Developer-account binding), partially possible but asymmetric for
  Android (a per-operator Firebase project), and doesn't reduce the design
  space since iOS would still need a central mechanism regardless. Not
  pursued as the primary path; the "build your own app" escape hatch
  remains available for operators who want it.
- **A third-party push SaaS (OneSignal, Pushwoosh, Airship, etc.) instead
  of building the relay in-house** — confirmed these platforms still
  require `sovereignfs`'s own APNs/Firebase credentials to be supplied to
  them; they don't remove the credential-ownership constraint, and adding
  one introduces a new external company with visibility into device tokens
  without buying back any capability. Rejected.

## Open questions

- Exact enrollment/key-rotation design for relay authentication (see
  "Relay authentication" above) — deferred to implementation, not a
  blocker to accepting this RFC's overall shape.
- Whether to also build the Android operator-supplied-Firebase-project path
  as a second escape hatch (Research 0010 leans toward deferring this
  indefinitely — it only covers one platform).
- Home Assistant's local-network WebSocket fallback (bypass the relay
  entirely when phone and instance share a network) is a plausible future
  latency improvement, explicitly out of scope for v1.
- Rate-limit thresholds and abuse-response behavior for the relay (block
  an instance, notify its admin, or both) — needs a concrete policy before
  the relay goes live, not before this RFC is accepted.

## Adoption path

Documentation-first now. Sequenced by
[workstream 0005](../workstreams/0005-native-push-relay.md) across two
repositories: this monorepo (new `apps/push-relay` service, `packages/db`
schema, `runtime` registration API and fan-out extension — epic task 4.7)
and `sovereign-mobile` (client registration, encryption, iOS Notification
Service Extension — epic task 20.5, rescoped from its current unscoped
form the same way task 20.3 was rescoped for the device bridge). No
semver-breaking change to any published package; `@sovereignfs/sdk` is
unaffected since this is a server + relay + shell-native feature, not a
plugin-facing SDK surface — plugins keep calling `sdk.notifications.send()`
exactly as they do today, unaware of which channel(s) actually deliver it.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
