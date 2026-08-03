# Research 0010 — Native mobile push notifications (APNs/FCM)

**Status:** Decided\
**Date:** August 2026\
**Author:** Claude Code (research + design discussion with `kasunben`)\
**Scope:** `sovereign-mobile` (external repo — the Capacitor shell), a new
standalone relay service (`apps/push-relay` in this monorepo — see
[RFC 0085](../rfcs/0085-native-push-relay.md)), `runtime` (RFC 0015's
Notification Center as the delivery source of truth), `packages/db` (new
device-token schema)\
**Related:** [RFC 0015](../rfcs/0015-notification-center.md) (Notification
Center, Implemented), [RFC 0016](../rfcs/0016-web-push.md) (Web Push,
Implemented — its crypto is reused here), [RFC 0083](../rfcs/0083-device-bridge-capability-contract.md)
(device bridge, Draft), [RFC 0058](../rfcs/0058-native-mobile-app-shell.md)
(native mobile app shell), [RFC 0082](../rfcs/0082-focused-plugin-app-shell.md)
§5 (durable session sequel — the closest prior precedent for "one published
binary, arbitrary self-hosted instances" hitting a credential-ownership
wall), workstream 0003 (device bridge across surfaces, legs 1–4 done,
deliberately excluded push from its v1 slice), **graduates into**
[RFC 0085](../rfcs/0085-native-push-relay.md) and
[workstream 0005](../workstreams/0005-native-push-relay.md)

---

## Question

`sovereign-mobile` task 20.5 ("Native push notifications, APNs/FCM") is
scoped everywhere it's mentioned as if it were a client-side Capacitor
integration task, dependent only on RFC 0015/0016 (both Implemented). It
isn't one. APNs and FCM both require a **server** to hold credentials
(an APNs key/cert or an FCM server key) tied to **one app identity**, and use
those credentials to push to devices. `sovereign-mobile` is a single
published binary (one bundle ID, one Apple Developer / Firebase project)
that connects to **any** self-hosted Sovereign instance the user chooses —
and each of those instances is an independently operated server with no
built-in relationship to `sovereignfs` the project or to each other.

**So: which server holds the APNs/FCM credentials and actually calls
Apple/Google's push services, given that self-hosted instances are
independent and the app's push credentials can't be handed out to every
operator individually?** And separately, once that's answered: **how does
this coexist with Web Push (RFC 0016), which already works today for PWA
and browser-tab users and must keep working unchanged?**

## Findings

### The baseline gap

- `notifications.native` (shipped, workstream 0003 legs 3/4) is
  **foreground-only** — a plugin's own client-side JS calls
  `sdk.device.nativeNotifications.show()` directly, while the app is open.
  It never involves the server and doesn't address closed-app alerts.
- Web Push (RFC 0016, shipped) already works for browser tabs and installed
  PWAs — see below for why it does **not** extend to the Capacitor-wrapped
  native app.
- Neither covers "app fully closed, user should still get notified" for the
  native app specifically — the actual product gap task 20.5 exists to close.

### RFC 0015/0016 are implemented, but only cover web push

- Both RFCs are **Implemented**. RFC 0016 is web push only: VAPID keys, a
  `push_subscriptions` table storing the browser `PushSubscription` shape
  (`endpoint`, `p256dh`, `auth`), delivery via the `web-push` library
  (`runtime/src/push.ts`). None of this generalizes to APNs/FCM device
  tokens, which use an entirely different transport and authentication model.
- **No device-token schema, registration endpoint, or SDK surface exists
  anywhere in this monorepo.** RFC 0083 (Draft) and RFC 0058 both name
  APNs/FCM push as a line item ("a capability registry entry + Capacitor
  transport" / "a Capacitor push notifications plugin") with no design for
  who holds the credentials or how a self-hosted instance's notification
  reaches a device with no direct relationship to it. Workstream 0003
  explicitly deferred push out of its v1 slice for this exact reason.

### Web Push does not — cannot — work inside the Capacitor shell, on either platform

This was the finding that reframed the whole question. Confirmed against
primary sources, not assumed:

- **iOS**: an Apple DTS engineer, on Apple's own developer forums, states it
  directly: _"Web Push Notifications will not work in apps with a
  `WKWebView`. You can use native push notifications with an app that also
  happens to have a `WKWebView`, but not Web Push."_ He also clarified this
  is not a service-worker limitation: _"Service Workers work fine in a
  `WKWebView`. That is not the reason why Web Push is not working."_ — the
  Push API specifically is withheld from any WKWebView embedded in a
  third-party app. Capacitor's iOS shell is exactly that. (Source:
  [Apple Developer Forums thread 760767](https://developer.apple.com/forums/thread/760767).)
- **Android**: confirmed via Chromium's own public issue tracker — an open,
  unimplemented feature request titled _"Implement Push API and
  Notifications in WebView."_ Android's System WebView (what Capacitor uses
  on Android) has no `PushManager`/Push API support today. (Source:
  [Chromium Issue 40388442](https://issues.chromium.org/issues/40388442).)
- **Why it works today in the PWA and wouldn't in the shell:** the existing
  PWA runs inside Safari's own process (iOS) or Chrome's own process
  (Android) when installed to the home screen — the one execution context
  both platforms actually built Push API support for. Capacitor's shell is
  a WKWebView/WebView _embedded inside a separate native app binary_, a
  fundamentally different context both platforms exclude by design.
- **Consequence:** this is not "Web Push is a lower-reliability stopgap
  until native push ships." The native App Store/Play Store app can **never**
  receive a Web Push notification while closed, regardless of engineering
  effort. The only paths to a closed-app alert are (a) real native push via
  APNs/FCM, or (b) nothing. Web Push and native push are not competing
  solutions to the same problem — they serve two client contexts that are
  mutually exclusive per-installation (a PWA install or browser tab always
  uses Web Push; the native app always needs the new mechanism), so nothing
  about supporting both is architecturally awkward — see "Coexistence with
  Web Push" below for why this falls out of the existing design almost for
  free.

### Neither operator-supplied credentials nor a third-party push SaaS route around the credential wall

- **APNs (iOS) is a hard platform wall, not a design choice Sovereign can
  engineer around.** A device's APNs token is scoped to the app's Bundle ID
  ("topic"); Apple will only issue an authorized `.p8`/`.p12` push
  credential for a Bundle ID **from the Apple Developer account that
  registered it**. `fs.sovereign.mobile`'s Bundle ID belongs to
  `sovereignfs`'s account, since it publishes the app — there is no
  mechanism in Apple's Developer Portal for a third party to obtain a valid
  credential for a Bundle ID they don't own, and no runtime mechanism for
  the app to request a token scoped to a _different_ Bundle ID. The only way
  an operator could hold a valid APNs credential for their own users'
  devices is if those devices ran an app **built and signed under the
  operator's own Bundle ID** — i.e. a separately published app, not a
  Console setting.
- **FCM (Android) is more flexible but not free of the same shape of
  constraint.** An FCM registration token is tied to the specific Firebase
  project that generated it; sending with a different project's credentials
  produces an explicit `MismatchSenderId` rejection. Firebase's SDK _does_
  support initializing multiple `FirebaseApp` instances at runtime, so — in
  principle — an operator could supply their own Firebase project config
  via Console and the app could dynamically register a second, differently
  scoped token against it. Real complexity: every such operator needs to
  set up their own Firebase project (a real technical barrier for most
  self-hosters), and the app needs to manage per-instance registrations
  rather than one simple global token, since `sovereign-mobile` supports
  multiple simultaneous instances.
- **This is asymmetric across platforms and doesn't produce one coherent
  answer.** Pursuing operator-supplied FCM credentials would still leave
  iOS with no equivalent, meaning iOS still needs _some_ central mechanism
  regardless — so it doesn't reduce the design space, only adds an
  Android-only side path.
- **Third-party push platforms (OneSignal, Pushwoosh, Airship, Braze,
  CleverTap) don't change any of this.** Confirmed: _"services like
  OneSignal, Pushwoosh, and Airship don't eliminate the need for your own
  APNs and Firebase credentials — they sit on top of these services and
  require you to provide those credentials to function properly."_ APNs and
  FCM are the actual delivery rails; every commercial platform sits on top
  of them, not instead of them. Introducing one would add a new external
  company into the trust chain without buying back any capability, working
  against the project's stated privacy-first identity rather than for it.

### Real-world precedent: every comparable self-hosted, federated product converged on the same architecture

Checked four widely-used, directly comparable products — self-hosted or
federated software where one shared client app talks to many independent
server deployments, the exact shape of this problem — rather than treating
it as novel:

- **Nextcloud** runs a single, centrally-operated **push proxy**
  (`push-notifications.nextcloud.com`), and it is **end-to-end encrypted**:
  the mobile app generates a keypair on-device and sends only the public key
  to the user's own Nextcloud server. When a notification fires, the
  **server** encrypts the payload with that public key before it ever
  leaves the instance; the proxy — which holds the real APNs/FCM
  credentials — only ever relays an opaque encrypted blob, decrypted solely
  on-device. As a side benefit, Apple/Google don't learn which Nextcloud
  server sent a given notification either. Enterprise customers can host
  their own copy of the proxy.
- **Matrix/Element (Sygnal)** is the strongest confirmation, stated as an
  architectural fact by the protocol's own maintainers rather than a
  preference: _"It is not feasible to allow end-users to configure their
  own Sygnal instance, because the Sygnal instance needs the appropriate
  FCM or APNs secrets that belong to the application."_ Same shape:
  homeserver → push gateway (centrally run by matrix.org for the default
  Element app) → APNs/FCM. For end-to-end-encrypted rooms, the push payload
  is deliberately minimal (no content), and the client fetches the real
  event over its own encrypted sync connection.
- **Home Assistant** runs its own central relay (`mobile-apps-fcm-push`)
  that self-hosted instances call by default, holding the real credentials.
  HA is more permissive about self-hosting the entire relay yourself — but
  that still requires building your own signed companion-app variant with
  its own Bundle ID/Firebase project, the same "Option C" trade-off as
  Sovereign's. HA also has a local-network-only WebSocket fallback that
  bypasses APNs/FCM entirely when the phone and server share Wi-Fi — a
  useful supplementary idea, but it doesn't help the "notify me while I'm
  out" case that's usually the actual point of push.
- **Bitwarden** relays self-hosted mobile push through its own cloud service
  (`push.bitwarden.com`, backed by Azure Notification Hub) by default, and
  explicitly documents this as configurable: point at your own relay
  instead, or **disable push relay entirely** as a normal, first-class
  supported mode, not a degraded one.

**All four independently arrived at: a centrally-operated relay holding the
actual Apple/Google credentials, with self-hosted instances calling out to
it — because the credentials belong to the app identity, not to any
individual server.** This is the field's converged answer, not a Sovereign-
specific gap, and Nextcloud's end-to-end-encrypted variant is a strictly
better version of the "content-blind relay" idea explored below: it gets
both the privacy property (the relay never sees content) and reliability
(the full encrypted payload is delivered in one push, no dependence on
iOS/Android's unpredictable background-execution budget to fetch content
afterward).

### Coexistence with Web Push: additive, not a redesign — verified against the actual fan-out code

Checked `runtime/src/push.ts` rather than assumed. `fanOutPushToUser(userId,
payload)` already fans out to **every** registered subscription for a user
independently:

```ts
const subs = await getPushSubscriptionsForUser(pdb, userId);   // every device
...
subs.map((sub) => sendOne(pdb, sub.userId, sub.endpoint, ...)) // deliver to each
```

A user with a laptop browser tab _and_ a phone PWA already gets
independently delivered pushes to both today via this exact mechanism —
that's existing, tested behavior. Adding native-app device tokens is a
second registration type living alongside `push_subscriptions`, and
`fanOutPushToUser` gains a second delivery branch (encrypt + send to the
relay) beside the existing one (VAPID + `web-push`), in the same fan-out
loop. Client and server client type is never ambiguous — a PWA/browser tab
always registers a Web Push subscription; the native app always registers a
device token — so there is no arbitration logic needed, no user-facing
toggle, and no migration step for someone who uses both.

### Rough complexity, decomposed

- **Client-side registration** (`sovereign-mobile`): low — `@capacitor/push-notifications`
  is a mature, official plugin that already does the hard part (APNs/FCM
  registration).
- **Encryption**: low-medium — Web Push's own encryption (RFC 8291) solves
  exactly the same shape of problem (encrypt against a client-held public
  key, deliver opaquely, decrypt on-device); RFC 0016 already implemented
  this in full in `runtime/src/push.ts`. Much of it is adaptable, not new.
- **Decrypt-and-display on receipt**: medium, and the one genuinely new
  native piece — iOS requires a **Notification Service Extension** (a
  standard, well-trodden pattern for exactly this use case, but a new Xcode
  target with its own signing) to decrypt before the OS shows the banner.
  Once decrypted, display reuses the `notifications.native` capability
  already shipped in workstream 0003. Android's FCM background handling is
  simpler — no separate extension needed.
- **Server-side** (`runtime`): low-medium — a new table and two endpoints
  structurally near-identical to the existing `push_subscriptions`/
  `/api/account/push-subscription` pattern, plus extending the existing
  fan-out loop.
- **The relay service**: the one genuinely new piece of infrastructure.
  Small in scope to build (receive an encrypted blob + device token,
  forward to APNs or FCM, return) — Nextcloud's equivalent is reportedly
  lightweight — but it carries a real, **ongoing** operational cost:
  uptime expectations across the whole ecosystem (if it's down, native push
  is down for every self-hosted instance simultaneously), safeguarding a
  new class of high-value credential, and basic abuse/rate-limiting.
  `sovereign-mobile` already requires an Apple Developer Program enrollment
  for App Store distribution regardless of push, so obtaining an APNs key
  under that same account is incremental, not a new relationship.

## Options considered

**A — `sovereignfs`-operated relay, full (unencrypted) payload.** Simplest,
but every self-hosted instance's notification content transits a server
`sovereignfs` operates. Superseded by the Nextcloud-precedent design below,
which gets the same reliability without the privacy cost.

**B — `sovereignfs`-operated relay, silent wake + client fetch.** Originally
proposed here before the precedent research; the relay only ever forwards an
opaque wake signal, and the device fetches real content afterward. Superseded
by option E (below) — Nextcloud's proven design achieves the same
content-blindness without depending on iOS/Android's unreliable
background-fetch budget.

**C — Every self-hosted operator provisions their own push credentials and
app build.** Ruled out as the default: for iOS this isn't just costly, it's
structurally required (a different Bundle ID means a different app binary,
full stop) — and it conflicts with the locked "one universal binary"
decision. Kept as an **explicit escape hatch**, not the default: an operator
who wants zero dependency on `sovereignfs`'s relay can build and publish
their own signed app variant with their own credentials and (optionally)
their own self-hosted relay, and point their instance's config at it. This
costs nothing extra to support if the relay's base URL is a simple,
overridable per-instance config value — exactly Bitwarden's pattern.

**D — Don't build native push.** Rely on what's shipped: `notifications.native`
(foreground) and Web Push (PWA/browser only). Now confirmed, not merely
"plausibly poor," that this leaves the **native app** permanently unable to
notify a closed session — a real, permanent product gap for that surface
specifically. The PWA path is entirely unaffected either way.

**E — `sovereignfs`-operated relay, end-to-end encrypted, Nextcloud-style
(the finalized choice).** Combines the privacy property of option B with the
reliability of option A: the relay only ever sees an opaque encrypted blob
and a device token, never content, but delivery is a single push (no
speculative background-fetch round trip). Defaults to `sovereignfs`'s own
Apple/Firebase credentials; the relay base URL is a configurable,
per-instance value so option C remains available as a genuine opt-out, not
a hypothetical one.

## Recommendation (decided)

**Option E.** This is no longer framed as tentative — the real-world
precedent from four independent, mature projects solving the identical
problem removes most of the design uncertainty that made this "exploratory"
in the earlier draft of this doc. What remains is conventional engineering
(informed by Nextcloud's shipped design) rather than an open research
question:

- `sovereignfs` operates one relay service by default, using its own
  Apple Developer / Firebase credentials tied to `sovereign-mobile`'s
  published Bundle ID / Firebase project.
- The relay is content-blind by design: it only ever receives and forwards
  an already-encrypted payload plus a device token; it cannot decrypt
  either.
- Every self-hosted instance's `runtime` extends the existing
  `fanOutPushToUser` fan-out (RFC 0015/0016) with a second delivery branch:
  encrypt with the recipient device's stored public key, POST to the
  configured relay URL.
- The relay URL is an instance-level configuration value, defaulting to
  `sovereignfs`'s relay. An operator who wants full independence builds and
  publishes their own signed app variant (their own Bundle ID, their own
  Apple/Firebase credentials, optionally their own relay) and points their
  instance at it — a real, supported, low-cost-to-Sovereign escape hatch,
  not a promise that goes unfulfilled.
- Web Push (RFC 0016) is untouched and keeps serving PWA/browser-tab users
  exactly as it does today; the two mechanisms coexist via the same
  existing multi-target fan-out, per "Coexistence with Web Push" above.

This graduates directly into [RFC 0085](../rfcs/0085-native-push-relay.md)
(the committed design: schema, protocol, encryption scheme, relay contract)
and [workstream 0005](../workstreams/0005-native-push-relay.md) (the
cross-repo execution sequence, since this spans `sovereign` and
`sovereign-mobile`).

## Open questions

Carried into RFC 0085 for resolution there, not left open here:

- Exact relay hosting choice (a minimal Next.js app under `apps/push-relay`,
  matching `apps/auth`'s existing precedent, vs. a lighter-weight serverless
  function) — leaning toward the Next.js precedent for deployment
  consistency; not yet finalized.
- Relay authentication/anti-abuse model for the instance → relay call (a
  lightweight per-instance API key issued at enrollment is the working
  assumption, informed by how SaaS APIs conventionally handle this — not a
  large open design space, but needs to be specified).
- Whether the Android operator-supplied-Firebase-project path (from
  "Findings" above) is worth building as a second escape hatch alongside
  the "build your own app" one, or deferred indefinitely as unnecessary
  complexity given option C already exists. Current lean: defer — it only
  covers one platform and doesn't reduce the total design surface.
- Home Assistant's local-network WebSocket fallback is a plausible future
  latency/reliability improvement (deliver instantly when phone and
  instance share a network) but is out of scope for the initial relay —
  worth a note in RFC 0085 as a deferred enhancement, not a blocker.

## Next steps

Done — this doc's role (settle the design direction) is complete. Concrete
follow-through:

1. [RFC 0085](../rfcs/0085-native-push-relay.md) — the committed design:
   device-token schema, registration/revocation API, encryption scheme
   (reusing RFC 0016's crypto), the relay's own request/response contract,
   relay-URL configurability, and how this plugs into RFC 0015's existing
   fan-out.
2. [Workstream 0005](../workstreams/0005-native-push-relay.md) — sequences
   the cross-repo execution: the new `apps/push-relay` service and
   `runtime` changes (this monorepo), plus `sovereign-mobile`'s client
   registration flow and the iOS Notification Service Extension.
3. Epic task updates: `docs/epics/notification-center.md` (new task 4.7 —
   the relay + runtime-side work) and `docs/epics/mobile.md` (task 20.5
   rescoped to the `sovereign-mobile` client-side work only, matching how
   task 20.3 was rescoped for the device bridge).
