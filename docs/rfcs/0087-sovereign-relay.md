# RFC 0087 — Sovereign Relay: native push notifications and WebRTC signaling

**Status:** Implemented\
**Date:** August 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Scope:** `packages/db` (new device-token schema), `runtime` (registration
API, extends RFC 0015/0016's fan-out, relay-URL configuration), a new
standalone service `apps/relay` (this monorepo), `sovereign-mobile` (external
repo — client registration, encryption, native decrypt-and-display; tracked
there via that repo's own epic 20 task 20.5), `sovereign-desktop` (external
repo, per the "Desktop native push" addendum below — client registration,
encryption, native decrypt-and-display; tracked there via this monorepo's
own epic 17 task 17.11), the `sovereign-infra` /
`openfs-infra` deployment repositories (external — relay deployment playbook)\
**Incorporated into plan:** Yes — epic task 4.7 (this monorepo) and epic task
20.5, rescoped (`sovereign-mobile`'s client-side half); epic tasks 4.8 and
17.11 (the desktop addendum). Sequenced by
[workstream 0005](../workstreams/0005-native-push-relay.md) for the mobile
push feature and [workstream 0010](../workstreams/0010-desktop-push-relay.md)
for the desktop addendum; WebRTC signaling's own implementation is
intentionally not sequenced yet (see "Feature: WebRTC signaling" below).

---

## Summary

This RFC introduces **Sovereign Relay** (`apps/relay`): one small piece of
`sovereignfs`-operated infrastructure, shared by every feature that needs a
neutral, centrally-reachable rendezvous point but must not be able to read
what it relays. It starts with two independent features:

1. **Native mobile push notifications** (APNs for iOS, FCM for Android) —
   the fully-designed feature this RFC originally covered, unchanged in
   substance. APNs/FCM require credentials tied to one app identity, and
   `sovereign-mobile` is one published app used by many independent
   self-hosted instances that cannot each hold that credential — so a relay
   is structurally required, not just convenient. Content-blind by design
   (Nextcloud's proven pattern): every self-hosted instance encrypts the
   notification payload against the recipient device's own public key
   before it ever leaves the instance, so the relay only ever forwards an
   opaque blob it cannot read.
2. **WebRTC signaling** (offer/answer/ICE candidate exchange) — a much
   lighter feature, design-sketched only, for future real-time
   peer-to-peer capabilities (the first planned consumer is a decentralized
   chat app, not designed here — see "Feature: WebRTC signaling" below).
   Two peers behind NATs need a reachable third party to exchange
   connection metadata before they can talk directly; unlike push, this
   has no app-identity credential binding, so it is structurally easier to
   self-host.

Both features — and any relay-shaped feature added later — share one
deployable app, one deployment story, and one operator opt-out/self-host
path, rather than each reinventing its own. See "Deployment topology" for
why this is a genuinely different kind of service from every other app in
this monorepo (`runtime`, `apps/auth`): it is not something every
self-hosted operator deploys, so it does not belong in the default
`docker-compose.yml`/`docker-compose.prod.yml` stack.

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

While designing push's deployment story, it became clear the same shape of
problem — a self-hosted instance needs a centrally-reachable, content-blind
intermediary it doesn't fully trust with plaintext — will recur. The
clearest near-term case is WebRTC signaling: two devices, each behind a NAT
neither controls, need a reachable rendezvous point to exchange connection
offers before they can attempt a direct peer-to-peer connection. This RFC
generalizes the relay concept now, while only push's feature-level design is
final, so the second feature doesn't have to re-litigate the deployment
question push already answered.

This ties directly to Sovereign's self-hosted, privacy-first positioning:
every other device capability (RFC 0083's `haptics.impact`,
`notifications.native`, `secureStorage`) is architected so the shell talks
only to the user's own instance and the OS, never to a `sovereignfs`-run
server. Native push is the first capability that cannot honor that pattern
completely — Apple/Google's push transport requires a credentialed sender
in the loop by design — so this RFC's central design goal is minimizing
what that sender can see, not just making push work. WebRTC signaling
doesn't share push's credential constraint, but benefits from the same
minimize-what-the-relay-can-see discipline and the same deployment
machinery.

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
  `scripts/next-server.mjs`-driven dev/start scripts. `apps/relay` follows
  the same code-structure shape (see "Shared relay platform" below) — but,
  critically, **not** `apps/auth`'s deployment shape. `apps/auth` is a
  per-instance service every operator deploys; `apps/relay` is a shared,
  centrally-operated service almost no operator deploys themselves. See
  "Deployment topology."
- **`sovereign-mobile`** already has a `notificationPermissionLauncher`-style
  runtime-permission flow (Android `POST_NOTIFICATIONS`, iOS
  `UNUserNotificationCenter`) from workstream 0003 leg 4 — this RFC's
  client-side permission handling extends the same pattern rather than
  introducing a new one.
- **`sovereign-infra`** (public, forkable template) and **`openfs-infra`**
  (private, `sovereignfs`'s own production deployment) are the two
  operator-facing deployment repositories, external to this monorepo. Both
  already document an "Adding a New App" playbook (per-app `docker-compose.yml`
  - Caddy vhost + encrypted `.env`, deployed independently of the
    special-cased `sovereign` app whose compose is fetched from this
    monorepo's own releases) — `apps/relay` is deployed as exactly that kind
    of app, not as part of the `sovereign` app's stack. See "Deployment
    topology."

## Proposed design

### Shared relay platform (`apps/relay`)

A new, minimal, mostly-stateless Next.js app, following `apps/auth`'s
existing _code_ precedent (own `package.json`, `Dockerfile`,
`scripts/next-server.mjs` dev/start scripts) rather than introducing a new
framework or deployment pattern to this monorepo. Its own deployment
_topology_ is different from `apps/auth`'s — see "Deployment topology."

Design principles that apply to every feature hosted here, not just push:

- **Content-blind wherever technically possible.** The relay forwards
  opaque, already-encrypted payloads (push) or short-lived connection
  metadata that is useless without the peer completing a direct connection
  (signaling). It should never be the thing holding a plaintext
  notification, a message, or a call's actual media/data.
- **Minimal, revocable per-instance authentication.** Each self-hosted
  instance obtains a lightweight API key from the relay at enrollment
  (`POST /v1/enroll`, one-time, before first use) and includes it on every
  relay call. This is deliberately minimal — not a full OAuth flow — since
  the credential being protected is "ability to use this relay," not user
  data; its job is basic abuse prevention (rate-limiting per instance,
  revocable if an instance misbehaves), not strong authorization. One
  enrollment covers every feature the instance uses on the relay — an
  instance doesn't re-enroll per feature.
- **No persistent state beyond what a feature strictly needs to function.**
  Push needs none (pure forward). Signaling needs a short-TTL session
  record (see below), not a durable one. Neither needs logging of the
  content it relays.
- **Small surface area.** The smaller this service's surface, the smaller
  the blast radius if it's ever compromised — it should hold exactly the
  credentials/state each feature strictly requires (push: Apple/Firebase
  credentials) and nothing else sensitive.

### Feature: Push notifications

The fully-designed feature. Unchanged from this RFC's original scope.

#### Device-token schema

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

#### Client-side flow

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

#### Server-side: registration API and fan-out extension (`runtime`)

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

#### Encryption

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

#### The relay push endpoint

- `POST /v1/push` — accepts `{deviceToken, platform, encryptedPayload,
instanceKey}`. Validates `instanceKey` against the shared platform
  enrollment (above), forwards to APNs (HTTP/2, JWT signed with
  `sovereignfs`'s `.p8` key) or FCM (HTTP v1 API, `sovereignfs`'s
  service-account credential) depending on `platform`, returns the
  outcome — including a distinct "token invalid" result so the calling
  instance can prune it the same way a 410 from `web-push` already prunes
  `push_subscriptions`.
- Nothing else. No payload inspection, no logging of decrypted content (it
  never receives any), no persistent notification history.

### Feature: WebRTC signaling

Design-sketched only — enough to confirm it fits the shared relay's shape
and doesn't force a deployment redesign later, not enough to start
building. The first planned real consumer (a decentralized chat app) is not
designed here; its concrete requirements (offline delivery, group
fan-out, possible TURN relay for media/data) are deferred to that work, per
this RFC's "Alternatives considered."

- **What it does:** relays the connection-negotiation messages (SDP offer,
  SDP answer, ICE candidates) two peers exchange before attempting a direct
  WebRTC connection. It never sees the peer-to-peer traffic itself once a
  direct connection succeeds — only the short-lived handshake metadata.
- **Why it needs a relay at all:** two devices behind NATs generally can't
  reach each other's signaling channel directly without a third,
  reliably-reachable party to exchange that handshake through first — the
  same shape of "someone has to be reachable" problem push has, minus the
  app-identity credential binding.
- **Rough contract sketch (not final):** short-TTL session records, keyed
  by an ephemeral session/room identifier the two participating instances
  already agree on out-of-band (mechanism TBD by whatever feature consumes
  this first). Likely `POST`/long-poll or a short-lived WebSocket per
  session for offer/answer/ICE exchange; the session record expires and is
  discarded shortly after both sides have exchanged what they need, or
  after a timeout if one side never shows up.
- **Explicitly not decided here:** exact endpoint shapes, session addressing
  scheme, whether a WebSocket or HTTP long-poll is used, TURN/relay-of-last-resort
  for peers that can't connect directly at all, and anything specific to a
  chat use case (message storage, offline delivery, group fan-out). These
  belong to the feature that actually needs them.

### Deployment topology

This is the section that didn't exist in this RFC's original push-only
draft, and the reason `apps/relay` doesn't yet have a `Dockerfile` or a
`docker-compose.yml` entry as of this RFC's Draft status.

- **Not part of the default self-hosted stack.** `docker-compose.yml` and
  `docker-compose.prod.yml` model what _every_ self-hosted operator runs —
  `auth` and `runtime`. The relay is different: one `sovereignfs`-operated
  instance serves every self-hosted instance by default, the same way one
  `push.bitwarden.com` serves every self-hosted Bitwarden install. Adding
  it to those compose files would incorrectly imply every operator should
  run their own — most operators never need to, and doing so without also
  taking the two steps below accomplishes nothing (see "Operator opt-out
  paths").
- **Own Dockerfile, published image.** `apps/relay/Dockerfile` follows
  `apps/auth/Dockerfile`'s standalone-Next.js pattern. The image is added
  to `.github/workflows/publish-images.yml`'s GHCR matrix
  (`ghcr.io/sovereignfs/sovereign-relay`), tagged the same way as
  `sovereign-runtime`/`sovereign-auth` on every `v*.*.*` release. This
  matters for two distinct consumers: `sovereignfs` itself, deploying its
  own default relay instance, and any operator taking the self-host escape
  hatch (below) — neither should have to build the image from source.
- **Instance-side configuration, not compile-time.** Each self-hosted
  instance gets an admin-configurable relay URL (Console setting, backed by
  an env var default) — never hard-coded. It ships with a default pointing
  at `sovereignfs`'s relay (`relay.sovereign.openfs.io`), can be overridden
  to a different relay, and can be **fully disabled** with a single
  opt-out (an explicit "off" value, distinct from an unset/default value)
  — an instance with the relay disabled simply never registers push device
  tokens or signaling sessions; Web Push and every other feature are
  entirely unaffected.
- **Deployed via the existing operator-facing infra playbook, not new
  tooling.** Both `sovereign-infra` (public, forkable template) and
  `openfs-infra` (private, `sovereignfs`'s own production infra) already
  document a generic "Adding a New App" flow: a per-app `docker-compose.yml`
  - Caddy vhost + encrypted `.env`, deployed independently of the
    `sovereign` app itself (whose compose is special-cased, fetched from this
    monorepo's releases). `apps/relay` is deployed as exactly that kind of
    app in both repos:
  * `openfs-infra` gets an `apps/relay/` entry for `sovereignfs`'s actual
    production relay at `relay.sovereign.openfs.io` (port `4002`, already
    reserved in that repo's port registry).
  * `sovereign-infra`'s template gains an **optional** step (a single
    prompt in `configure.sh`, off by default) for an operator who wants to
    self-host their own relay instance as part of the escape hatch below.
- **Operator opt-out paths — two, with different requirements:**
  - **Disable the feature entirely.** One `.env`/Console toggle. No relay
    dependency, no credentials, no separate deployment. Push notifications
    (and, later, signaling-dependent features) simply don't work for that
    instance; everything else is unaffected.
  - **Full self-host, no `sovereignfs` dependency.** For push, this
    requires _three_ things together, not any one alone: (1) a separately
    signed app build under the operator's own Apple Developer account /
    Firebase project — required because APNs/FCM tokens are permanently
    bound to whichever app identity generated them, so there is no way to
    point the standard App Store build at different credentials; (2) the
    operator's own APNs `.p8` key and FCM service-account credential,
    obtainable only because they now own that app identity; (3) their own
    deployed `apps/relay` instance, configured with those credentials, with
    their instance's relay URL pointed at it. **For WebRTC signaling, only
    the third step applies** — self-hosting the relay is sufficient on its
    own, since signaling has no app-identity credential binding the way
    push does. This asymmetry is worth remembering when documenting the
    escape hatch: it's a real, low-effort option for signaling and a
    deliberately higher-effort one for push.

## Alternatives considered

See [Research 0010](../research/0010-native-mobile-push-notifications.md#options-considered)
for the full option comparison (A–E) that preceded this RFC's push design.
Summary of what was rejected and why:

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
- **Designing WebRTC signaling's full contract (and any chat-specific
  capability — offline mailbox, group fan-out, TURN) now, alongside push**
  — deliberately not done. The only concrete near-term need for signaling
  is a not-yet-designed decentralized chat app; speculatively designing its
  storage/fan-out/TURN requirements today risks building the wrong thing.
  This RFC only commits to the parts that affect the shared relay's
  deployment shape (which, per the design sketch above, are minimal): a
  short-TTL, content-blind rendezvous endpoint. Everything chat-specific is
  explicitly deferred to when that work starts.
- **Bundling the relay into `auth`/`runtime`'s default compose stack, with
  a local-first-then-central-fallback hop for every feature** — considered
  and rejected for push specifically: there is no locality benefit to a
  local relay hop for push (the destination is always Apple/Google's cloud
  regardless of which relay forwards the request), so a bundled,
  always-running local relay would sit idle for the large majority of
  instances that never obtain their own push credentials, at real resource
  cost with no functional benefit. The same local-first pattern may be
  worth revisiting specifically for WebRTC signaling or a future
  same-network delivery optimization (see Research 0010's "Home Assistant
  local push" note), where locality genuinely helps — but that is a
  per-feature decision, not a property of the shared relay's default
  deployment.

## Open questions

- Exact enrollment/key-rotation design for relay authentication (see
  "Shared relay platform" above) — deferred to implementation, not a
  blocker to accepting this RFC's overall shape.
- Whether to also build the Android operator-supplied-Firebase-project path
  as a second push escape hatch (Research 0010 leans toward deferring this
  indefinitely — it only covers one platform).
- Home Assistant's local-network WebSocket fallback (bypass the relay
  entirely when phone and instance share a network) is a plausible future
  latency improvement for push, explicitly out of scope for v1.
- Rate-limit thresholds and abuse-response behavior for the relay (block
  an instance, notify its admin, or both) — needs a concrete policy before
  the relay goes live, not before this RFC is accepted.
- WebRTC signaling's actual endpoint/session design, and whether it needs a
  TURN-capable relay-of-last-resort for peers that can't connect directly —
  both deferred to whichever feature (expected: the future decentralized
  chat app) first needs signaling for real. Note that a TURN component, if
  ever needed, is very likely **not** something that fits inside
  `apps/relay`'s Next.js process — TURN relays raw UDP/TCP media/data and
  needs a different runtime (e.g. `coturn`) — so it would run as a sibling
  process on the same relay infrastructure, not a route inside this app.

## Adoption path

Documentation-first now. The push feature is sequenced by
[workstream 0005](../workstreams/0005-native-push-relay.md) across two
repositories: this monorepo (`apps/relay` service, `packages/db` schema,
`runtime` registration API and fan-out extension — epic task 4.7) and
`sovereign-mobile` (client registration, encryption, iOS Notification
Service Extension — epic task 20.5, rescoped from its current unscoped
form the same way task 20.3 was rescoped for the device bridge). Workstream
0005 also covers the shared deployment topology (`apps/relay`'s
`Dockerfile`, its `publish-images.yml` entry, and the operator-facing infra
playbook in `sovereign-infra`/`openfs-infra`), since push is the feature
that needs it first — the relay app is _built_ generalized so a later
WebRTC-signaling workstream can add a second feature to the same deployable
without redoing that work, but no signaling implementation is sequenced by
this RFC or workstream 0005.

No semver-breaking change to any published package; `@sovereignfs/sdk` is
unaffected since this is a server + relay + shell-native feature, not a
plugin-facing SDK surface — plugins keep calling `sdk.notifications.send()`
exactly as they do today, unaware of which channel(s) actually deliver it.

## Addendum: Desktop native push (macOS APNs, Windows WNS; Linux out of scope)

**Status:** Implemented — [workstream 0010](../workstreams/0010-desktop-push-relay.md)'s
3 legs are all merged (epic tasks 4.8 and 17.11). Extends the
already-Implemented mobile leg (epic task 4.7 / workstream 0005) to
`sovereign-desktop`, reusing the same schema, relay, and fan-out machinery
rather than building a parallel system. Real gaps remain (revocation,
real-credential/real-hardware verification, a macOS Notification Service
Extension equivalent) — see workstream 0010's own "Definition of done" for
the full, honest list.

### Motivation

`sovereign-desktop` epic task 17.2 already ships local, foreground-triggered
OS notifications (`notifications.native`, RFC 0083) — but, like
`sovereign-mobile` before this RFC, has no path to notify a user once the
app is fully quit. Unlike mobile, a desktop process isn't OS-suspended by
default and a tray-resident app could in principle stay connected — but
users do quit desktop apps, and when they do, only real OS-level push closes
the gap, the same way it did for mobile.

### Current state (desktop-specific)

`sovereign-desktop` is a Tauri 2 app, identifier `fs.sovereign.desktop`,
macOS-first, shipping as an unpackaged `.dmg`/`.exe`/`.AppImage` — no MSIX,
no Mac App Store (that's the still-parked epic task 17.6). Its device bridge
(RFC 0083, `src-tauri/src/bridge.rs`) already implements
`notifications.native` via `tauri-plugin-notification`'s `NotificationExt` —
foreground/locally-triggered only, unrelated to this addendum's
server-initiated delivery except that the native app reuses the same
display path once a push is decrypted, mirroring how `sovereign-mobile`
leg 4 reused its own `notifications.native` display path.

### Proposed design

**Schema.** `push_device_tokens.platform` gains `'macos'` and `'windows'`
alongside the existing `'ios'`/`'android'`. The column is untyped `text` in
both dialects — no migration needed. TypeScript-level validation widens in
the registration API (`runtime/app/api/account/push-device-token/route.ts`)
and the relay's push route.

**macOS uses APNs** — the same service as iOS, under the same Apple
Developer Team, but a distinct app identity (`fs.sovereign.desktop` vs.
`fs.sovereign.mobile`) and therefore a distinct `apns-topic`. The relay's
`apnsConfig()`/`sendApnsPush()` (`apps/relay/src/apns.ts`,`config.ts`)
generalize to take an explicit topic per call instead of reading one fixed
`config.bundleId` internally; a new `APNS_BUNDLE_ID_MACOS` env var is
additive alongside the existing `APNS_BUNDLE_ID` (which keeps meaning iOS,
unchanged). The shared JWT credential (`APNS_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`)
still gates whether APNs works at all; a platform-specific bundle-id var
being unset gates only that platform, returning the same
`platform_not_configured` the push route already returns for FCM.

**macOS decrypt-and-display — proposed to ship without a Notification
Service Extension equivalent in v1.** iOS's NSE exists because Xcode
projects have first-class tooling (this RFC's mobile leg used the
`xcodeproj` gem) for adding an extension target and an "Embed Foundation
Extensions" build phase. Tauri's build output is a plain `.app` bundle
produced by `tauri-bundler`, with no Xcode-project equivalent — embedding a
macOS `.appex` (the same `UNNotificationServiceExtension` mechanism exists
on macOS 10.14+, per Apple's docs) would mean new, unprecedented build
tooling: a custom `tauri.conf.json` bundle hook that builds a second binary
plus its own `Info.plist`/entitlements and copies it into the produced
`.app`'s `Contents/PlugIns/` post-build. Proposed instead: deliver a generic
placeholder banner (mirroring the `aps.alert` title-space placeholder
`sendApnsPush` already sends for the mutable-content path) while the app is
closed; the app decrypts and shows real content once opened, reusing
`fanOutPushToUser`'s already-encrypted payload the same way a reopened
mobile app's inbox would. Content still never transits the relay or Apple
in plaintext either way — the only difference from iOS is a generic vs.
specific banner while quit. A real NSE-equivalent is a plausible later leg,
not ruled out, just not undertaken here.

**Windows uses WNS (Windows Notification Service)** — a different protocol
from APNs/FCM with no existing relay client. New `apps/relay/src/wns.ts`:
OAuth2 client-credentials token fetch against
`https://login.live.com/accesstoken.srf`, authenticating with a Partner
Center-issued Package SID (as `client_id`) and its client secret — this
identity step works for an unpackaged Win32 app via a free Partner Center
app reservation, it does not require MSIX/Store publishing. The resulting
bearer token (~24h validity per Microsoft's docs) is cached and proactively
refreshed, mirroring `apnsJwt`'s own caching shape. Sends are **raw**
notifications only (`X-WNS-Type: wns/raw`), POSTed directly to the device's
channel URI — WNS has no separate "device token"; the channel URI Windows
generates client-side _is_ the value stored in `push_device_tokens.device_token`
for `'windows'` rows, a full HTTPS endpoint the relay calls directly rather
than a host + opaque-token pair.

Raw-only is a deliberate scope decision, not an oversight: WNS's other
notification type ("toast") can render a system banner even while the app
is fully quit, but only because Windows itself renders the banner from
plaintext XML in the push body — there is no app code running on a quit,
unpackaged app to decrypt anything first. That directly conflicts with this
RFC's non-negotiable content-blind guarantee, so it's rejected (see
"Alternatives considered"). The practical consequence: Windows push only
reaches a **running** app (tray-resident is sufficient — it does not need
to be foregrounded), and a fully-quit Windows app receives nothing, the
same outcome as the Linux gap below for a different underlying reason.

Config: `WNS_PACKAGE_SID`, `WNS_CLIENT_SECRET`, gated by a `wnsConfigured()`
check with the same "structurally complete, environment-gated" posture
`apnsConfigured()`/`fcmConfigured()` already established — real credentials
require a Partner Center registration unavailable in this environment.

**Push route dispatch** (`apps/relay/app/v1/push/route.ts`) widens:
`'ios'`/`'macos'` → APNs (topic selected per platform), `'android'` → FCM,
`'windows'` → WNS.

**`runtime/src/push.ts`'s fan-out needs no change.** `fanOutPushToUser`
already forwards `token.platform` to the relay opaquely, with no branching
on its value — confirmed by reading the current implementation before
writing this addendum, not assumed from the mobile leg's shape.

**Linux is permanently out of scope for OS-level closed-app push** — no
Linux desktop push primitive exists, packaged or not (unlike Windows, there
isn't even a raw-only fallback). `sovereign-desktop` continues to offer only
foreground/loaded-instance notifications there, exactly as it does today.
This is a documented platform gap, not a deferred task — nothing in this
addendum's adoption path attempts it. (UnifiedPush, a self-hostable open
push protocol, is a plausible future answer to this specific gap and fits
this project's self-hosted ethos well, but is a materially bigger,
open-ended question that belongs in its own `docs/research/` doc if ever
picked up — not scoped here.)

**Desktop client** (new epic task 17.11, tracked in
[docs/epics/desktop.md](../epics/desktop.md)): on-device P-256 keypair
generated in Rust (`p256`/`aes-gcm`/`hkdf` crates), producing the exact same
65-byte SEC1/X9.63 public-key point and the same ECDH + HKDF-SHA256 +
AES-256-GCM wire format this RFC already specifies — the relay and
`runtime/src/push-encryption.ts` need zero changes to support a third
client language. The private key is persisted via each OS's native
credential store rather than anything Rust-portable: macOS Keychain via the
`security-framework` crate (mirroring `PushKeychain.swift`'s approach from
the mobile leg), Windows Credential Manager via the `windows` crate
(mirroring `PushKeystore.java`'s "store both public and private key at
generation time" discipline, since deriving a public key back out of an
opaque stored private key isn't portably possible there either).
Registration happens entirely in native Rust — not the bundled onboarding
page's JS, and not routed through `bridge.json`'s one narrow remote grant —
reading the active instance URL from the same `tauri-plugin-store`
`instances.json` `store.ts` already writes and the session cookie via
Tauri's webview cookie API, then `POST`ing to
`/api/account/push-device-token` directly. This mirrors
`sovereign-mobile` leg 4's "entirely native, zero new bridge capability"
decision for the identical reasons: RFC 0083 §7 (`secureStorage`-shaped
capabilities must never be plugin-facing) and this repo's own hard rule
against widening `bridge.json`'s remote grant beyond `allow-bridge-invoke`
both apply here without modification.

Two genuinely open integration points, neither blocking this addendum's
acceptance but both real enough to name rather than hand-wave:

- **macOS device-token registration** needs
  `NSApplication.registerForRemoteNotifications()` plus the
  `NSApplicationDelegate` callbacks
  (`didRegisterForRemoteNotificationsWithDeviceToken:` /
  `didFailToRegisterForRemoteNotificationsWithError:`). These are
  `NSApplicationDelegate`-only methods — Tauri (via the `tao` windowing
  crate it's built on) does not surface them as a Tauri-level event, and
  `tao` already owns the application delegate for its own window
  management. The implementation leg's first task is a spike: adding these
  selectors to `tao`'s existing Objective-C delegate class at runtime via
  the Objective-C runtime (`objc2`, already a dependency here for Touch ID
  in epic task 17.10), not assumed solved by this addendum.
- **Windows device-channel registration** needs
  `Windows.Networking.PushNotifications.PushNotificationChannelManager`
  (via the `windows` crate) to obtain a channel URI, which for an
  unpackaged app requires associating the process with the Partner
  Center-issued identity (Package SID) at runtime — the exact current API
  for that association on an unpackaged Win32 app needs verification during
  implementation. Real verification is blocked on both a Windows machine
  and real Partner Center credentials, the same posture already documented
  for epic task 17.10's Windows Hello code (`src/biometrics/windows.rs`):
  type-checked via cross-compile, never built or run for real here.

### Security considerations

The end-to-end encryption guarantee is unchanged and unweakened by any of
the above — the relay never receives plaintext regardless of platform.
macOS's placeholder-banner tradeoff and Windows's running-app-only tradeoff
both reduce _availability_ while the app is quit, never _confidentiality_.
The Windows raw/toast decision specifically exists to keep it that way —
see "Alternatives considered."

### Alternatives considered

- **Windows toast notifications with plaintext payloads** — would achieve
  real closed-app banners on Windows, the same outcome iOS/Android get.
  Rejected: it requires notification content to reach WNS (and therefore
  Microsoft) unencrypted, directly conflicting with this RFC's central
  design goal. Not pursued even as an opt-in mode, since a per-platform
  exception to the content-blind guarantee would be a confusing, easy-to-
  misconfigure promise to make to self-hosted operators.
- **Building a macOS Notification Service Extension equivalent now** —
  deferred rather than rejected. No existing Tauri build tooling supports
  it; the investment (custom bundle-hook tooling, a second signed binary)
  is real and separable from the rest of this addendum's scope.
- **UnifiedPush for Linux** — a legitimate, self-hosted-friendly answer to
  the Linux gap, explicitly not scoped here; too open-ended for an
  addendum, would need its own research doc first per this repo's own
  "research precedes RFCs" convention.

### Open questions

- The exact Tauri/`tao`/`objc2` mechanism for receiving
  `didRegisterForRemoteNotificationsWithDeviceToken:` — the desktop leg's
  first task, not resolved here.
- The exact unpackaged-app identity-association API for
  `PushNotificationChannelManager` on Windows — same posture.
- Whether a later leg should build a real macOS NSE equivalent once the
  rest of this ships.
- Real Partner Center / Apple Developer Team credential acquisition for
  the desktop app's own APNs bundle ID and Windows Package SID —
  operational, not a design blocker, same category as the existing "real
  Apple/Firebase credentials" gap already documented for the mobile leg.

### Adoption path

Sequenced by a new workstream (`docs/workstreams/`) covering both
repositories: this monorepo (schema/registration-API widening, relay APNs
generalization, new `wns.ts` client — new epic task 4.8) and
`sovereign-desktop` (native macOS/Windows registration, on-device crypto,
decrypt-and-display — new epic task 17.11). Both tasks ship
environment-gated, same as the mobile leg: real delivery is unverifiable
without real Apple/Microsoft credentials and, for Windows, a real Windows
machine.

## Changelog

| Version | Date        | Change                                                                                                                                                                  |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft (push notifications only)                                                                                                                                 |
| 0.2     | August 2026 | Renamed `apps/push-relay` → `apps/relay`; broadened to a shared "Sovereign Relay" platform with a design-sketched WebRTC signaling feature; added "Deployment topology" |
| 0.3     | August 2026 | Added "Desktop native push" addendum — macOS APNs, Windows WNS (raw-only, encrypted), Linux explicitly out of scope                                                     |
