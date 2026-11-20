# Epic 19: Web Push

> Every app can notify a person on a device where it is not open, the same way in each, from shared packages.

## Status

⏳ In Progress

## Overview

[RFC 0009](../rfcs/0009-web-push.md) makes Web Push one implementation for every app. It adds a new published package,
`@sovereignfs/push`, for the server: keys, encryption and signing with no dependency, a store the app gives, an outbox, and the
subscription route. It adds the worker's handlers and the browser's side to `@sovereignfs/pwa`, a `PushControl` to
`@sovereignfs/ui`, and push to the app template. Then Tusk and Waymark move off their own copies. Core is not a consumer in this
epic's first milestone; core sending pushes, and mirroring into core's bell, are later RFCs that build on these packages.

## Related

- [docs/research/0013-web-push.md](../research/0013-web-push.md): what legacy and the apps did, the options, the recommendation
- [docs/rfcs/0009-web-push.md](../rfcs/0009-web-push.md): the design
- [docs/rfcs/0001-installable-core.md](../rfcs/0001-installable-core.md) and [epic 11](pwa.md): `@sovereignfs/pwa`, which this extends
- [docs/specs/sdk.md](../specs/sdk.md) §9.1: the store pattern `@sovereignfs/push` follows
- [contracts/app-manifest.md](../../contracts/app-manifest.md) §2.5 (`generate`) and [contracts/env.md](../../contracts/env.md) §3
  (`_FILE`): the key's variable
- [docs/releasing.md](../releasing.md): publishing a new package
- [workstream 0010](../workstreams/0010-web-push.md): the order the tasks run in

## Tasks

#### ✅ 19.1 — `@sovereignfs/push`: keys, encryption and sending

**Goal:** An app's server can encrypt and send a push to a browser with no dependency and nothing of core.

**Deliverables:**

- `packages/push`, published (MPL-2.0, ESM only, no runtime dependency, Node 22.3 or later), its first version and changelog
  section, listed wherever a published package is (Dockerfile manifests, promotion units, the publish workflow, `docs/releasing.md`,
  `packages:check`); importing it in a browser throws
- `pushSettings(prefix)`: `<PREFIX>_VAPID_PRIVATE_KEY` (and its `_FILE` form), the public key derived; `<PREFIX>_VAPID_SUBJECT`
  defaulting to an `https` `<PREFIX>_URL`; nothing when the key is unset; a throw at start-up for a key that is not a P-256 scalar
  or a subject that is `localhost` or malformed (RFC 0009 §1.1)
- `parseSubscription` and the push services' host list (§1.2); `PushMessage` and its limits (§1.3)
- RFC 8291 `aes128gcm` encryption and an RFC 8292 ES256 JWT on `node:crypto`; `sendPush` with `fetch`, a ten-second timeout, `TTL`
  and `Urgency`, answering sent, gone, try again or refused
- `npx @sovereignfs/push keys`, printing a new private key and its public key

**Dependencies:** none

**Spec reference:** RFC 0009 §1.1 to §1.3

**Review checklist:**

- Encryption reproduces RFC 8291's worked example (Appendix A) byte for byte, and a test decrypts what `sendPush` posts with the
  receiver's keys
- The JWT verifies with the derived public key; a request never goes to a host off the list; every request has a timeout
- No log line holds an endpoint, a key or a message
- The tarball holds only the built files and the README; types resolve for ESM consumers

**Not here:** the store and the outbox (19.2).

**Notes:** RFC 8291's worked example reproduces byte for byte, intermediates and all; its §5 gives `Content-Length: 145`, but the
body it shows is 144 bytes (an 86-byte header, 41 of message, the delimiter and the tag), which is what is asserted. The signed
token lives an hour, inside the RFC's twelve, since Apple's service is the strictest. A redirect from a push service is not
followed (`redirect: 'manual'`), so a request never leaves the host list.

#### ✅ 19.2 — `@sovereignfs/push`: the store, the outbox and the route

**Goal:** An app keeps devices and waiting pushes in its own database, sends after the change commits, and gives devices one route.

**Deliverables:**

- The `PushStore` interface (RFC 0009 §1.4), at most ten devices an account; an in-memory store and a conformance suite under
  `@sovereignfs/push/testing`; the PostgreSQL and SQLite tables in the README, sealed key columns
- `enqueuePush` and `runPushOutbox` (§1.5): a lease, back-off of 1, 5 and 30 minutes, expiry (four hours by default), `404`/`410`
  forgetting the device and its waiting pushes
- `pushSubscriptionHandlers` (§1.6): `GET`, `POST`, `DELETE`, the app's own `account(request)`, the `Origin` check, a 4 KiB body,
  `no-store`
- A minor version bump of the package, with its changelog section

**Dependencies:** 19.1

**Spec reference:** RFC 0009 §1.4 to §1.6

**Review checklist:**

- The in-memory store passes the conformance suite; two outbox runners over one store never send one row twice
- A row enqueued in a transaction that rolls back is never sent (shown with the template's store in 19.5)
- `DELETE` removes only the calling account's device; a cross-origin `POST` is refused

**Not here:** the browser's side (19.3).

**Notes:** a queued push names its device by endpoint and carries no keys; `claim` returns it with the device's subscription, so the
keys are sealed once, in the devices table. A store refuses to queue a push for a device that is not the account's, and saving an
endpoint another account had drops that account's waiting pushes for it: both are conformance cases. A batch is sent at once, so the
one-minute lease covers it (ten seconds a push at most). Waymark's key is an HKDF-derived secret, not a P-256 scalar: 19.7 must keep
its existing subscriptions with that in mind.

#### ✅ 19.3 — The worker shows a push, and the page turns it on `[parallel]`

**Goal:** `@sovereignfs/pwa` gives every app the worker's push handlers and the browser's side of subscribing.

**Deliverables:**

- `serviceWorkerSource({ push })` (RFC 0009 §2.1): `push` and `notificationclick`, added only when asked; a push that cannot be read,
  or whose `onPushKind` returns nothing, still shows the app's name; `path` resolved on the worker's own origin only
- `@sovereignfs/pwa/client` (§2.2): `pushState`, `turnOnPush`, `turnOffPush` (replacing a subscription made with another key), and
  `usePush`
- `docs/architecture-rules.md`'s worker rule names the two handlers; a minor version bump with its changelog section

**Dependencies:** none (it reads the route's answers as 19.2 defines them)

**Spec reference:** RFC 0009 §2

**Review checklist:**

- The worker's text, evaluated as served, shows a notification for every push (readable, unreadable, with an unknown kind) and opens
  only its own origin's paths
- Without `push`, the worker's text is unchanged
- No browser global is read in render or a state initializer

**Not here:** the control's look (19.4).

**Notes:** `onPushKind` returning nothing, or throwing, shows the message as it came (its title, or the app's name when it has none),
so "the app's name" is the floor, not the answer to every kind. `turnOnPush` asks for permission before anything else is awaited,
since Safari asks only from a tap. `usePush` adds `checking` (before it knows) and `unavailable` (the route says the app has no key) to
the device's states, so `PushControl` renders nothing in both and the server's markup is everyone's.

#### ✅ 19.4 — `PushControl` `[parallel]`

**Goal:** Every app says the same thing about notifications on a device, and offers the same switch.

**Deliverables:**

- `PushControl` in `@sovereignfs/ui` (RFC 0009 §3): every state, the iPhone's install-first steps reusing `InstallPrompt`'s, the
  `Toggle`, the busy and failed states; framework-agnostic, state and actions from the app
- A story for each state and a Component Gallery entry; a minor version bump with its changelog section

**Dependencies:** none

**Spec reference:** RFC 0009 §3; `docs/specs/design-system.md`

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck` and `pnpm design:tokens:check` pass; the words say "app", never a protocol term
- Each state reads correctly with a screen reader (the toggle's label and its description)

**Not here:** wiring it to the client (19.5).

**Notes:** the iPhone's sentence is `IOS_INSTALL_STEPS`, now one constant shared with `InstallPrompt`. The toggle's label names the
app and the device; its description is the sentence beside it, and a failure is added to the description and announced (`role=alert`).
Seen in Storybook in both themes and at phone width.

#### 📋 19.5 — The app template sends notifications

**Goal:** An app made by `npm create @sovereignfs` has push as soon as its key exists, and shows the whole path working.

**Deliverables:**

- `lib/push.ts` (settings and a `PushStore` in SQL, sealed with `lib/crypto.ts`), a migration with the two tables, the route at
  `app/api/push/subscription`, the worker's `push` option, `PushControl` with "Send me a test notification", the outbox started from
  `instrumentation.ts`, `turnOffPush` before signing out
- `{ "name": "<PREFIX>_VAPID_PRIVATE_KEY", "bytes": 32 }` in the manifest's `generate`; `_env.example` names both variables
- The template's store passes the conformance suite; `tools/create/src/app.test.ts` asserts each piece; a `create` version bump
- `docs/building-an-app.md`: "Sending notifications" under §10, and the packages in "What Sovereign publishes"

**Dependencies:** 19.2, 19.3, 19.4

**Spec reference:** RFC 0009 §4

**Review checklist:**

- A generated app builds and, in Chromium with a key set, turns push on, sends the test notification, and opens its path when it is
  clicked; with no key, the control shows nothing and the route answers `available: false`
- With and without `--encryption`

**Not here:** devices other than a desktop browser (19.6).

#### 📋 19.6 — Push seen on devices

**Goal:** What research 0013 marks _(to confirm)_ is seen, so the apps move on facts.

**Deliverables:**

- An app generated from the template, hosted on https, tried on an iPhone (installed and in Safari), an Android phone (Chrome,
  installed and in a tab), desktop Chrome, Firefox and Safari: turning on, a push with the app closed, a click, turning off, a
  denied permission, a key changed
- A push that shows nothing (deliberately, from a test page) on Chrome and Safari, and two pushes with one `tag`
- The results, with browser and OS versions, in research 0013, and its _(to confirm)_ marks resolved; RFC 0009 corrected where a
  device disagrees

**Dependencies:** 19.5

**Review checklist:**

- Every row of the device table is filled from a device, not from documentation

**Not here:** the deployed apps (19.7).

#### 📋 19.7 — Tusk and Waymark on the packages, and the designs that follow

**Goal:** No app keeps a copy of Web Push of its own.

**Deliverables:**

- Tusk (in its own repository): the packages in place of `web-push` and `src/push/`; `TUSK_VAPID_PUBLIC_KEY` read for one release
  with a warning if it does not match, then dropped, with an upgrade note; the wake as `onPushKind`; its sealed store passing the
  conformance suite; `PushControl` in Settings
- Waymark (in its own repository): its outbox and sending from the package, its kinds as `onPushKind`, `PushControl`
- Tally's, Shopper's and Wallet's designs name the packages for their push
- Each app's own version and changelog section; the results recorded in this task's notes

**Dependencies:** 19.6; 19.1 to 19.4 published

**Review checklist:**

- Each app's own tests pass; a device subscribed before the change still receives a push after it
- Neither app depends on `web-push`

**Not here:** fjord and ledger, which send no notices yet; they use the packages when they do.
