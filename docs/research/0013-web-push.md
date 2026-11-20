# Research 0013 — Web Push, the same in every app

|            |                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Decided: designed in [RFC 0009](../rfcs/0009-web-push.md); the platform claims marked _(to confirm)_ are seen on devices in task [19.6](../epics/push.md)                                                 |
| **Date**   | November 2026                                                                                                                                                                                             |
| **Author** | Claude Code (design discussion with `kasunben`)                                                                                                                                                           |
| **Scope**  | `@sovereignfs/pwa`, `@sovereignfs/ui`, a new `@sovereignfs/push`; the app template; the apps that push (Tusk, Waymark) and plan to (Tally, Shopper, Wallet); [RFC 0001](../rfcs/0001-installable-core.md) |

---

## Question

Every Sovereign app installs from one package (`@sovereignfs/pwa`). An installed app is expected to notify a person when it is
closed, and two apps already do, each with its own code. What should one Web Push implementation, the same in every app, look like:
what is shared and published, what stays the app's, and which parts of the interface belong in `@sovereignfs/ui`?

**Out of this research, by decision:** core sending pushes for apps, mirroring pushes into core's bell, reading in one place reaching
the other, core's own notices, and messages between servers. They are the later milestones of push, listed at the end, and nothing here
closes them off.

## Method

- **Legacy:** `sovereign-legacy` RFC 0016 (Web Push, implemented), `runtime/src/push.ts`, `runtime/worker/index.ts`,
  `runtime/app/api/account/push-subscription/route.ts`, the Account notifications page and the `push_subscriptions` table.
- **The apps that push:** Tusk (`src/push/`, `src/sw/source.ts`, DESIGN.md §25.2) and Waymark (`src/push/`, DESIGN.md §17.3); and
  the designs of Tally (§21.4), Shopper (§22.2) and Wallet (epic `notices`, task 10.4).
- **What is shared now:** `@sovereignfs/pwa` (`worker.ts`, `client.tsx`), `@sovereignfs/ui`'s `InstallPrompt` and `Toggle`, the SDK's
  store pattern (sdk §9.1: the app gives the store, the SDK ships one only in `/testing`), and the template (`tools/create/template/app`).
- **Public sources**, listed at the end, were **not re-read for this document**. §3 and §4 give what is generally known and what
  legacy, Tusk and Waymark met in practice. The claims the design rests on are marked _(to confirm)_ and are seen on devices in 19.6.

## Findings

### 1. Legacy did it once, for one origin

Legacy (RFC 0016) was one origin with plugins that never touched push: they wrote a notification, and the platform decided on a push.

- **Keys:** `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, optional, both or neither (unset: no push, the bell alone), and
  `VAPID_CONTACT`, with a warning when it is unset or `localhost` because Apple's push service refuses such a subject.
- **Sending:** the `web-push` library, straight after the notification was written, `Promise.allSettled` over the person's devices;
  `404` and `410` deleted the subscription; every send, skip and prune logged to a `push_delivery_log`.
- **Payload:** `{ title, body, url, icon }`, encrypted to the device.
- **Worker:** `push` shows it (`icon` defaulting to the app's), `notificationclick` focuses a window at the address or opens one.
- **Store:** `push_subscriptions` (`endpoint` unique, `p256dh`, `auth`, the user, a time), keys stored as text.
- **Interface:** "Push notifications" on the Account notifications page: not supported here, HTTPS needed, enable, enabled on this
  device with Disable; the iPhone told to install first. `DELETE` removed the account's subscriptions on every device.

What worked and carries over: optional keys with no default, a payload with words in it, pruning, a worker that always shows
something, the iPhone's install-first message. What did not fit now: one origin, a library around its own HTTP client, keys as text,
`DELETE` reaching every device, and sending inside the request.

### 2. Two apps built it again, and three have designed it

| App     | State    | Keys                                                                  | Sends                                                                    | Payload                                                                | Store                                                               |
| ------- | -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Tusk    | Built    | `TUSK_VAPID_PUBLIC_KEY`, `_PRIVATE_KEY`, `_SUBJECT`; `web-push` 3.6.7 | From its reminder job, after the notice is written                       | `{ title, body, path, key }`, and `{ kind: 'wake' }` for a sealed Desk | One row per device, keys sealed under the instance key, at most ten |
| Waymark | Built    | `WAYMARK_VAPID_PRIVATE_KEY` (public derived); `web-push` 3.6.7        | An outbox written in the change's transaction, a lease, back-off, expiry | `{ k, p }`: a kind and a path; the worker writes the words             | Subscriptions and `push_outbox`; only push services' hosts          |
| Tally   | Designed | `TALLY_VAPID_PRIVATE_KEY`, generated or given                         | Beside the mail job                                                      | —                                                                      | `push_subscription`, a channel in `notice_pref`                     |
| Shopper | Designed | As Tally                                                              | As Tally                                                                 | —                                                                      | As Tally                                                            |
| Wallet  | Designed | `WALLET_VAPID_PRIVATE_KEY`                                            | Reminders                                                                | Content-free                                                           | Sealed under the server's key; off by default                       |

They agree on the shape (per-device subscriptions for the signed-in account, optional keys, iPhone needs installing, dead
subscriptions removed) and drift on the details: two variable layouts, a payload of words against a kind against nothing, sending
inline against an outbox, sealed keys against text. Each also wrote its own `push` and `notificationclick` handlers, its own
subscribe code and its own Settings control. **This is research 0004's finding again, for push:** the same infrastructure, copied and
drifting, and three more copies to come.

### 3. How Web Push works

- **A subscription belongs to one origin and its worker.** A page asks its worker's `PushManager` to subscribe with the app's public
  key and gets an endpoint and two keys (`p256dh`, `auth`). Every app is its own origin, so every app subscribes for itself.
- **The payload is encrypted to the device** (RFC 8291, `aes128gcm`: ECDH P-256, HKDF, AES-128-GCM). The push service sees the
  endpoint, timing and size. The sender signs a short JWT (RFC 8292, ES256) with a `sub` naming a contact.
- **Every push must show something** (`userVisibleOnly: true`). A push that shows nothing costs the subscription in Safari: **seen on
  an installed iPhone app, and worse than expected** (§6): after a few, Safari dropped every subscription of the app's origin, not only
  the one that showed nothing, though it kept the permission. Chrome's tolerance is _(to confirm)_. Tusk's worker shows something for
  every push for this reason, and so does `@sovereignfs/pwa`'s.
- A notification's `tag` replaces an earlier one with the same tag on that origin, so a retried push replaces itself.
- `TTL` bounds how long the push service holds a push for a device that is off; `Urgency` lets a device save battery. `404` and `410`
  mean the subscription is gone.

### 4. Platforms

- **iPhone and iPad (16.4 and later)**: an app added to the Home Screen receives pushes, **seen on the current release** (§6); that a
  Safari tab never does is _(to confirm)_. Asking for permission must follow a tap; each installed app asks for itself.
- **Apple's push service refuses a VAPID `sub` that is `localhost` or not a real address** with `403 BadJwtToken`, while Google's
  accepts almost anything (legacy's warning). "Push works except on iPhone" is the symptom to design out. Apple accepted the app's own
  `https` address as `sub`, with a token that lives an hour (§6).
- **Desktop Chromium, Firefox and Safari, and Android:** a tab or an installed app receives pushes; the worker is woken with no window
  open while the browser runs.
- Permission once denied cannot be asked again by the page; the person must change it in the browser's settings.

### 5. What the shared packages already hold

- `@sovereignfs/pwa` builds the worker's text (`serviceWorkerSource`) and registers it (`ServiceWorkerRegistration`). The worker is
  a string, evaluated as served by its tests. Its rule is that it keeps only what is the same for everyone and handles nothing else.
  It is the natural home for the `push` and `notificationclick` handlers and for the browser's side of subscribing.
- `@sovereignfs/ui` has `InstallPrompt` (Share → Add to Home Screen on iPhone) and `Toggle`. A per-device push control is a
  component of the same kind: the person's choice, on this device, with the platform's limits said plainly.
- `@sovereignfs/database` is private; a published package cannot depend on it. The SDK solved the same problem: an app gives the SDK
  its stores (`SessionStore`, `TokenStore`), the SDK ships an in-memory one under `/testing`, and the template implements them in SQL
  with its own sealing (`lib/stores.ts`, `lib/crypto.ts`).

## Options

### A. The code that encrypts and sends

1. **`web-push`**, as legacy, Tusk and Waymark use. Proven, but a published package would carry its tree (its own HTTPS client, JWT
   and ASN.1 libraries) into every app, around Waymark's rule that a push goes only to a push service's host and the rule that every
   outbound call has a timeout.
2. **Our own on `node:crypto`:** RFC 8291 encryption and an RFC 8292 JWT, sent with `fetch` and a timeout. About two hundred lines,
   checked against RFC 8291's worked example and by decrypting what it sends in the tests. **Recommended.** No dependency in a
   published package, and the same outbound discipline as everything else.

### B. Where a subscription and a waiting push are kept

1. **Tables in the package** (Drizzle, a peer dependency). The template uses `pg` and SQL, not Drizzle, and Tusk's and Waymark's
   schemas are their own.
2. **A store the app gives**, as the SDK's: `PushStore` (subscriptions and the outbox), an in-memory store under
   `@sovereignfs/push/testing`, a conformance suite each app runs against its own, and the SQL for PostgreSQL and SQLite in the
   package's README. **Recommended**: the pattern apps already follow for the SDK.

### C. When a push is sent

1. **Inline**, as legacy and Tusk.
2. **An outbox**, as Waymark: a row written in the transaction of the change that raised it, claimed by a lease, retried with
   back-off, given up when too old, and sent by whichever process runs the job. **Recommended**: a change rolled back sends nothing,
   two processes never send one push twice, and a slow push service never slows a request.

### D. What a push says

1. **Words** (legacy, Tusk): `{ title, body, path, tag }`, encrypted. **Recommended as the default.**
2. **A kind and a path** (Waymark): the worker writes the words.
3. **A wake** (Tusk, Wallet): nothing; the worker finds what to show.

The worker shows the first by itself and hands a push with `kind` to the app's own handler, if it gave one. Waymark and Tusk keep what
they do, and an app with nothing special writes nothing. An address is a **path** on the app's own origin (Tusk's `ownPath`), never
another site.

### E. Keys

1. Two variables, both or neither (legacy, Tusk).
2. **One private key, the public key derived** (Waymark, Tally): `<PREFIX>_VAPID_PRIVATE_KEY` and `<PREFIX>_VAPID_SUBJECT`, the
   subject required whenever the key is set, and refused at start-up unless it is a `mailto:` or an `https:` address that is not
   `localhost`. Unset, the app has no push and says so. **Recommended.** It keeps the names two apps already use, and Tusk's public
   key variable becomes redundant.
3. Generated at first start and kept in the database. One more secret for a backup to carry, and a different answer per app.

A small command in the package makes a key: `npx @sovereignfs/push keys`.

### F. The interface

1. **Each app's own**, as now.
2. **One `PushControl` in `@sovereignfs/ui`**: "Notifications on this device", with every state the browser can be in (unsupported,
   needs installing on iPhone, needs HTTPS, blocked in the browser, off, on, working, failed). It is framework-agnostic and takes its
   state and actions from the app, which gets them from `@sovereignfs/pwa/client`. **Recommended.**

### 6. Seen on devices

What task 19.6 saw on devices, with an app generated from the template (`@sovereignfs/push` 0.2.0, `@sovereignfs/pwa` 0.2.0,
`@sovereignfs/ui` 0.104.0), served over `https` through a tunnel, its `sub` the app's own `https` address. Sends through the app's
outbox and directly with `sendPush` from a throwaway page (not committed), which also registered a second worker, scoped to a
folder of its own, that showed nothing for a push. Each cell says what was seen; _not tried_ is not a result.

| Device and browser                                     | Turn on                  | Push with the app closed                                     | Opening it                       | Two with one tag     | Pushes that show nothing                                                                                                                                                  | Denied    | Key changed |
| ------------------------------------------------------ | ------------------------ | ------------------------------------------------------------ | -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| iPhone, Safari 27.2, installed (Home Screen), Nov 2026 | Works (permission asked) | Arrives (sent 30 s later)                                    | Opens the app at the push's path | Only the second left | Nothing shown. Five accepted (`201`) with the subscription kept; after more, Safari dropped **every** subscription of the origin, the app's own included; permission kept | not tried | not tried   |
| iPhone, Safari tab, not installed                      | not tried                | not tried                                                    | not tried                        | not tried            | not tried                                                                                                                                                                 | not tried | not tried   |
| Android, Chrome (installed and tab)                    | not tried                | not tried                                                    | not tried                        | not tried            | not tried                                                                                                                                                                 | not tried | not tried   |
| macOS, Chrome (tab)                                    | Works                    | not tried (with the page open: arrives, shown by the worker) | not tried                        | not tried            | not tried                                                                                                                                                                 | not tried | not tried   |
| Desktop Firefox, Safari                                | not tried                | not tried                                                    | not tried                        | not tried            | not tried                                                                                                                                                                 | not tried | not tried   |

- **iPhone:** its user agent says `iPhone OS 18_7` beside `Version/27.2`; Safari reports a frozen OS number, so the Safari version is
  the one recorded. After the subscriptions were dropped, the page found none and the control showed off by itself; turning it on
  again made a working subscription. The second worker would not subscribe again.
- **macOS Chrome** was driven by Playwright with a fresh profile, so its permission was granted by the tool, not asked: headless
  Chrome, and Chrome with `--disable-background-networking`, refuse push registration (`AbortError: Registration failed - permission
denied`).
- What this changes: a worker that shows nothing for a push is not a lost push but a lost app on iPhone, so "every push shows
  something" is a rule, not advice (RFC 0009 §2.1). The rest of this section is for whoever has the other devices.

## Recommendation

Write [RFC 0009](../rfcs/0009-web-push.md): one implementation in three published places, used the same way by every app.

- **`@sovereignfs/push`** (new, published, server only): keys from the environment (E2); RFC 8291 and 8292 on `node:crypto` (A2);
  parsing a browser's subscription (Tusk's rules: https, no credentials in the address, the keys' shapes); a `PushStore` the app gives
  (B2) with sealing of the device's keys left to the app's store; an outbox with lease, back-off, expiry and pruning (C2); the
  subscription route's three answers as framework-free handlers; a key command.
- **`@sovereignfs/pwa`** (minor): the worker's `push` and `notificationclick` handlers, opt-in, with a hook for an app's own kinds
  (D); `@sovereignfs/pwa/client` gains the browser's side (is push possible here, subscribe, unsubscribe, the state for the control).
- **`@sovereignfs/ui`** (minor): `PushControl` (F2), with a story and a gallery entry.
- **The template** uses all three, so a new app has push when its operator sets a key; `docs/building-an-app.md` says how.
- **The apps:** Tusk and Waymark move onto the packages, keeping their wake and kinds through the hook; Tally, Shopper and Wallet name
  them in their designs and build on them.

Core is not a consumer in this milestone: it sends no push of its own until core-app §4.1 is amended, a later milestone.

## Later, not now

What the first discussion of push raised, kept so it is not lost: core sending pushes for apps in a suite (an app's page subscribes
with core's public key, published in the branding document); a push an app sent itself mirrored into core's bell (`sendNotification`
with `delivered: true`); reading in core reaching the app (signed events from core, generalised from logout notices); core's own
security notices; and amending §4.1, whose "No push in Phase 2" rests on a relay Web Push does not need. Each is a later RFC and builds
on the packages above.

## Open questions

1. **A locked screen.** The payload's words show on a locked device. Should `PushControl` offer "Hide what notifications say" per
   device, the app sending only its name and "a new notification"? Left to each app in this milestone.
2. **Signing out.** The page unsubscribes before the sign-out form is sent, and the app's store removes the account's subscription
   for that endpoint. A device that never comes back keeps receiving until the push service drops it. A list of the account's devices,
   to turn one off from another, is left for later.
3. **Key rotation.** A new key ends every subscription made with the old one; the page finds its subscription made with another key
   and subscribes again on its next visit. Keeping two keys for a while is not proposed.
4. **An unread count on the installed icon** (`setAppBadge`): useful, and supported unevenly _(to confirm; not tried in §6)_. Not in
   this milestone.

## Sources

- RFC 8030, _Generic Event Delivery Using HTTP Push_; RFC 8291, _Message Encryption for Web Push_; RFC 8292, _Voluntary Application
  Server Identification (VAPID) for Web Push_.
- MDN, _Push API_, _PushManager.subscribe()_, _ServiceWorkerRegistration.showNotification()_, _Clients.openWindow()_.
- WebKit, _Web Push for Web Apps on iOS and iPadOS_ (2023); Apple Developer, _Sending web push notifications in web apps and
  browsers_.
- `sovereign-legacy`: RFC 0016; `runtime/src/push.ts`; `runtime/worker/index.ts`.
- Tusk DESIGN.md §25.2; Waymark DESIGN.md §17.3; Tally DESIGN.md §21.4; Shopper DESIGN.md §22.2; Wallet `docs/epics/notices.md`.
