# Workstream 0005 — Native mobile push relay

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Goal owner:** `kasunben`\
**RFCs:** [0085](../rfcs/0085-native-push-relay.md) (device-token schema,
registration API, encryption scheme, relay contract — the governing
design), [0015](../rfcs/0015-notification-center.md) /
[0016](../rfcs/0016-web-push.md) (the existing fan-out this extends, not
replaces)\
**Epics touched:** 4 (Notification Center, this monorepo), 20 (Mobile, this
monorepo's task 20.5 plus the `sovereign-mobile` repository itself)\
**Research:** [0010](../research/0010-native-mobile-push-notifications.md)

---

## Goal

A `sovereign-mobile` user can receive a real, decrypted push notification
while the native app is fully closed — today only `notifications.native`
(foreground) and Web Push (PWA/browser only, structurally unable to reach
the native app) exist. At the end of this workstream: every self-hosted
instance can deliver to a registered native device via a
`sovereignfs`-operated relay that never sees notification content, PWA/
browser users are completely unaffected, and an operator who wants zero
dependency on the relay has a real, documented path to opt out (build and
publish their own signed app variant, point their instance at a different
relay URL).

## Definition of done

- [ ] A self-hosted instance can register a `sovereign-mobile` device's
      push token and public key, and revoke it on sign-out/instance
      removal.
- [ ] `fanOutPushToUser` (RFC 0015/0016's existing delivery path) delivers
      to a registered native device via the relay, alongside its existing
      Web Push delivery, in the same fan-out — verified with a user who has
      both a browser subscription and a native device token registered
      simultaneously.
- [ ] The relay (`apps/push-relay`) never receives, logs, or is otherwise
      capable of accessing plaintext notification content — verified by
      inspecting the actual network payload it receives, not just by
      reading the code that's supposed to guarantee this.
- [ ] A push is received and correctly displayed on a real device/simulator
      with real APNs/FCM sandbox credentials while the `sovereign-mobile`
      app is fully closed (not just backgrounded).
- [ ] An instance's configured relay URL is a normal admin setting, not
      hard-coded, and changing it is honored by newly registered devices.
- [ ] Web Push (RFC 0016) behavior for PWA/browser users is unchanged —
      regression-tested, not just assumed unaffected.
- [ ] Both this monorepo's and `sovereign-mobile`'s docs describe the
      relay dependency plainly, including what the operator escape hatch
      actually requires (a separately built and signed app, per RFC 0085).

## Decisions locked

Settled across [Research 0010](../research/0010-native-mobile-push-notifications.md)
and [RFC 0085](../rfcs/0085-native-push-relay.md). Full reasoning there.

| Decision              | Choice                                                                                        | Rejected alternative, and why                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Relay necessity       | A `sovereignfs`-operated relay is required                                                    | Operator-supplied credentials — structurally impossible for iOS (Apple binds APNs credentials to the Bundle ID's own Developer account); asymmetric and only partial for Android     |
| Payload privacy       | End-to-end encrypted (Nextcloud precedent) — relay only ever sees an opaque blob              | Full-payload relay (simplest, but every instance's notification content would transit `sovereignfs`'s infrastructure) — rejected once the encrypted design proved no harder to build |
| Delivery mechanism    | Deliver the full encrypted payload in one push                                                | Silent-wake-then-fetch — depends on iOS/Android's unpredictable background-execution budget for a second round trip; strictly worse reliability for no extra privacy benefit         |
| Third-party push SaaS | Build the relay in-house                                                                      | OneSignal/Pushwoosh/Airship/etc. — confirmed they still require `sovereignfs`'s own APNs/Firebase credentials; adds a new external party with zero capability gained                 |
| Operator opt-out      | Configurable relay URL + "build your own signed app" as the real escape hatch                 | No opt-out (rejected — conflicts with self-hosted positioning); "operator supplies credentials into the shared app" (rejected — see relay necessity above)                           |
| Encryption scheme     | ECDH P-256 + HKDF + AES-256-GCM, hybrid encryption, not Web Push's exact RFC 8291 wire format | Reusing RFC 8291 verbatim — that framing exists to satisfy browser `PushManager` internals, an irrelevant constraint when Sovereign controls both encrypting and decrypting ends     |
| Relay app framework   | Minimal Next.js app (`apps/push-relay`), matching `apps/auth`'s existing precedent            | A different framework/runtime (e.g. a serverless function, a lightweight Node service) — rejected for now to avoid introducing a second deployment pattern to this monorepo          |

## Prerequisites

- RFC 0085 accepted (Draft status is sufficient to begin, per this repo's
  own precedent — RFC 0083 was still Draft when workstream 0003 executed
  against it).
- `sovereignfs` needs an APNs key (`.p8`) under its existing Apple Developer
  Program account (already required for `sovereign-mobile`'s App Store
  distribution regardless of this workstream — incremental, not a new
  relationship) and a Firebase project + FCM service-account credential
  (free tier). **Owned by `kasunben`, not automatable — flag before leg 2
  starts if these aren't provisioned yet.**
- `sovereign-mobile`'s workstream 0003 leg 4 (`notifications.native`,
  already merged) — this workstream's client-side decrypt-and-display step
  reuses that display path directly.

## Legs

| Leg | Name                                      | Epic tasks    | Repo               | Gate? | Done when                                                               |
| --- | ----------------------------------------- | ------------- | ------------------ | ----- | ----------------------------------------------------------------------- |
| 1   | Device-token schema + registration API    | 4.7 (partial) | `sovereign`        | No    | Instance can register/revoke a device token; no relay dependency yet    |
| 2   | Relay service scaffold + APNs/FCM sending | 4.7 (partial) | `sovereign`        | No    | `apps/push-relay` forwards a real encrypted blob to a real device       |
| 3   | Fan-out extension                         | 4.7 (partial) | `sovereign`        | No    | `fanOutPushToUser` delivers to registered devices via the relay         |
| 4   | `sovereign-mobile` client + iOS extension | 20.5          | `sovereign-mobile` | No    | A real device, app fully closed, receives and displays a decrypted push |

**Cross-repo parallelism**, as in workstreams 0002/0003: leg 4
(`sovereign-mobile`) can start building its registration call and
encryption once leg 1's endpoint contract is fixed (not necessarily merged),
without waiting for legs 2/3 to be fully deployed — but end-to-end
verification (Definition of done) needs all four legs done. Legs 1–3 must
land in order within this repo since each depends on the previous leg's
schema/service existing.

## Leg detail

### Leg 1 — Device-token schema + registration API

**Epic tasks:** 4.7 (schema + API portion only)

**Why this leg is first:** everything else — the relay, the fan-out
extension, the mobile client — needs somewhere real to register against.
Building this first, and independently testable without the relay existing
yet, follows the same "contract before consumer" reasoning workstream
0003's leg 1 used for the device bridge.

**Technical notes:**

- `push_device_tokens` table, both SQLite and Postgres dialects
  (`packages/db/src/schema/{sqlite,postgres}/platform.ts`), alongside the
  existing `push_subscriptions` table — see RFC 0085's exact column list.
  Follow that file's existing patterns (e.g. `device_consent_grants` from
  workstream 0003 leg 2) rather than inventing new schema conventions.
- `POST /api/account/push-device-token` / `DELETE /api/account/push-device-token/:id`,
  mirroring `/api/account/push-subscription`'s existing auth handling and
  response shape exactly — do not invent a different convention for what is
  structurally the same kind of endpoint.
- `relay_url` is captured from the instance's current Console-configured
  relay setting **at registration time** and stored on the row itself, not
  read fresh from config at send time (RFC 0085's "Device-token schema"
  section explains why: a relay-URL change must not silently break already-
  registered devices before they re-register).
- No relay integration in this leg — registration and revocation must work
  and be fully tested (including the dialect-agnostic requirement) before
  leg 2 exists to call.

**Do not proceed if:** the registration endpoint's request/response shape
isn't stable enough for `sovereign-mobile` (leg 4, a different repo) to
start building against — a breaking change here after leg 4 has started is
expensive across a repo boundary.

### Leg 2 — Relay service scaffold + APNs/FCM sending

**Epic tasks:** 4.7 (relay service portion)

**Depends on:** Leg 1 only loosely (the relay itself doesn't call the
registration API) — sequenced after it mainly so this workstream's own
review order matches dependency order for a human following along.

**Technical notes:**

- `apps/push-relay` follows `apps/auth`'s exact shape: own `package.json`
  (`@sovereignfs/push-relay`, private), `Dockerfile`,
  `scripts/next-server.mjs`-driven `dev`/`start`/`build` scripts, own
  `tsconfig.json` extending `@sovereignfs/tsconfig`. See task 13 of this
  session's own work for the initial skeleton, already scaffolded ahead of
  this leg's real implementation — the skeleton is not the leg; APNs/FCM
  integration and the enrollment/auth model are.
- `POST /v1/push` (validate `instanceKey`, forward to APNs via HTTP/2 + a
  JWT signed with `sovereignfs`'s `.p8` key, or to FCM via the HTTP v1 API
  - service-account credential, depending on `platform`; return a result
    that distinguishes "delivered," "device token invalid" (for leg 3's
    pruning), and "transient failure").
- `POST /v1/enroll` — one-time, issues a per-instance API key. Exact
  auth/rate-limit model is this leg's own design decision within RFC 0085's
  stated constraints (see that RFC's "Open questions") — resolve and
  document it here, don't leave it implicit in code.
- **No payload inspection, no content logging, ever** — this is the leg
  where that guarantee is actually built, not just asserted. Structure the
  code so it's obvious from reading `POST /v1/push`'s handler alone that it
  cannot decrypt or meaningfully log the blob it forwards.
- Needs real APNs/FCM sandbox credentials to verify against — flagged in
  Prerequisites; do not fake this verification with mocked responses only.

**Do not proceed if:** `sovereignfs`'s Apple Developer / Firebase
credentials aren't actually available yet — this leg cannot be meaningfully
verified without them, and shipping unverified push-sending code is worse
than not shipping it.

### Leg 3 — Fan-out extension

**Epic tasks:** 4.7 (runtime fan-out portion)

**Depends on:** Legs 1 and 2 (needs both the schema to read from and the
relay to call).

**Technical notes:**

- `runtime/src/push.ts`'s `fanOutPushToUser` gains a second delivery branch
  reading from `push_device_tokens`, encrypting per RFC 0085's scheme, and
  POSTing to each token's stored `relay_url`. Keep the existing Web Push
  branch untouched — this is additive to the function, not a rewrite (see
  RFC 0085's "Current state" for why the existing `Promise.allSettled`
  fan-out already generalizes to a second delivery type).
- A "device token invalid" result from the relay prunes the
  `push_device_tokens` row, mirroring the existing 410/404 pruning already
  in `sendOne` for `push_subscriptions` — same pattern, don't invent a
  different one.
- Extend `push_delivery_log` (from epic task 4.6, already shipped) to
  record native-relay outcomes too, so "why didn't I get a push" stays
  answerable from Account/Console Activities for both delivery types, not
  just Web Push.

**Do not proceed if:** delivering to a native device token in the same
`Promise.allSettled` batch as Web Push subscriptions risks one delivery
type's failure affecting the other's — verify isolation before merging,
since `fanOutPushToUser` is shared, well-tested, load-bearing code that
must not regress for existing Web Push users.

### Leg 4 — `sovereign-mobile` client + iOS Notification Service Extension

**Epic tasks:** 20.5 (rescoped)

**Depends on:** Leg 1's endpoint contract (can start once that's stable,
per the parallelism note above); full end-to-end verification needs legs
2–3 deployed too.

**Technical notes:**

- `@capacitor/push-notifications` for APNs/FCM registration; on-device
  keypair generation via native `CryptoKit` (iOS) / Android `KeyStore` —
  the private key must never leave the device or be exportable.
- New iOS **Notification Service Extension** target — a new Xcode target,
  its own signing/provisioning, decrypts the payload and populates
  notification content before the OS displays it. This is the one piece of
  this workstream with no equivalent already built in this repo or
  `sovereign-desktop` — budget real time for getting Xcode's extension
  target + App Group (needed to share the keypair between the extension
  and the main app) working, and verify empirically (a real push received
  while genuinely closed, not just background-suspended) the same way
  workstream 0003's legs did for the device bridge.
- Android needs no separate extension — decrypt inline in the
  `FirebaseMessagingService` background handler.
- Once decrypted, hand off to the **already-shipped**
  `notifications.native` display path from workstream 0003 legs 3/4 —
  do not build a second native-notification-display mechanism.
- Revocation call on sign-out and on instance removal — both paths, not
  just one; verify each independently.

**Do not proceed if:** the iOS Notification Service Extension can't access
the stored private key without a shared App Group entitlement working
correctly — this is a known sharp edge in iOS extension development
(silent decryption failures if the keychain access group is misconfigured)
and deserves explicit, empirical verification before considering this leg
done, not just "it compiled."

## Risks

- **Relay availability is a new, real single point of failure** for native
  push across every self-hosted instance simultaneously — accepted per
  Research 0010's analysis, but this workstream should not silently expand
  the relay's scope beyond "forward an opaque blob" once built; scope creep
  here directly works against the reason this design was chosen over a
  full-payload relay.
- **The iOS Notification Service Extension is genuinely new native surface
  area** for this ecosystem (no `sovereign-desktop` or existing
  `sovereign-mobile` precedent) — budget for real debugging time in leg 4,
  not just implementation time.
- **Safeguarding the relay's Apple/Firebase credentials** is now a real
  operational security responsibility, not a one-time setup step — leg 2
  should not treat "put the key in an env var" as sufficient without at
  least noting a rotation/incident-response plan, even if building that
  plan fully is out of this workstream's scope.
- **Cross-repo drift**: leg 4 lives in a different repository with its own
  PR queue and its own review cadence — the "leg contract" (one branch, one
  PR, one gate) still applies per-repo, but this workstream's own
  "Definition of done" can only be fully verified once both repos' work has
  merged. Don't mark this workstream done from one repo's side alone.

## Kill criteria

If the iOS Notification Service Extension proves unreliable in practice
(leg 4's empirical verification repeatedly fails, e.g. persistent App Group
keychain-sharing issues with no clean fix), the fallback is **not** to ship
unencrypted push — it's to pause leg 4 and revisit RFC 0085's encryption
scheme or delivery model, since the whole design's value proposition rests
on the relay being genuinely unable to read content. Legs 1–3 remain valid
and shippable independently either way (the registration API and relay
service are useful infrastructure regardless of exactly how the client-side
decrypt step is implemented). If `sovereignfs`'s Apple Developer / Firebase
credentials turn out to be unobtainable or unacceptably costly to maintain
long-term, the whole workstream should be re-opened as a research question
rather than pushed through — Research 0010 documents why this was
considered the least-bad option, not the only conceivable one.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
