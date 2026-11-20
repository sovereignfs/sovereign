# Workstream 0010 — Every app sends Web Push the same way

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governs:** [RFC 0009](../rfcs/0009-web-push.md), [epic 19](../epics/push.md) (19.1 to 19.7)\
**Research:** [0013](../research/0013-web-push.md)

---

## Goal

Any Sovereign app can notify a person on a phone or a computer where it is not open, with one implementation shared by all of them.
The server's side is a published `@sovereignfs/push`, the worker's and the page's sides are in `@sovereignfs/pwa`, and the switch
people see is `PushControl` in `@sovereignfs/ui`. An app made from the template has push once its key exists, and in a suite the
instance makes that key. Tusk and Waymark keep no copy of their own, and Tally, Shopper and Wallet build theirs on the packages.

## Definition of done

- [ ] `@sovereignfs/push` is release-ready: it encrypts to RFC 8291's worked example, signs to RFC 8292, and sends through an outbox
      from a store the app gives
- [ ] `@sovereignfs/pwa`'s worker shows every push and opens only its own paths; its client turns push on and off
- [ ] `PushControl` is in `@sovereignfs/ui`, with a story for each state and a gallery entry
- [ ] A generated app turns push on, sends a test notification and opens it, with and without `--encryption`
- [ ] Research 0013's _(to confirm)_ marks are resolved from devices
- [ ] Tusk and Waymark use the packages and no longer depend on `web-push`; the three designs name the packages
- [ ] RFC 0009 says Implemented; epic 19 is ✅

## Decisions locked

| Decision                      | Choice                                                                                                   | Rejected alternative and why                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Scope of this workstream      | Every app's own push, from shared packages                                                               | Core sending for apps, mirroring into core's bell, events between servers: later RFCs that build on these packages |
| Core                          | Not a consumer here; core-app §4.1 is unchanged                                                          | Core pushing its bell now: it needs §4.1 amended and a design of its own                                           |
| Encryption and signing        | Our own, on `node:crypto`, checked against RFC 8291's worked example                                     | `web-push`: its own HTTPS client and libraries in a published package, around the host list and timeout rules      |
| Where devices and pushes live | A `PushStore` the app gives, with an in-memory store and a conformance suite in `/testing` (sdk §9.1)    | Drizzle tables in the package: the template has no Drizzle, and `@sovereignfs/database` is private                 |
| When a push is sent           | An outbox written in the change's transaction, claimed by a lease                                        | Inline, as legacy and Tusk: a rolled-back change still notifies, and two processes can send twice                  |
| Keys                          | `<PREFIX>_VAPID_PRIVATE_KEY` alone (public derived), made by the manifest's `generate` with `bytes: 32`  | Two variables, both or neither (legacy, Tusk): the public key follows from the private one                         |
| Subject                       | `<PREFIX>_VAPID_SUBJECT`, defaulting to an `https` `<PREFIX>_URL`; `localhost` refused when a key is set | A required variable: the app's own address is a valid contact; a `localhost` subject fails only on Apple, silently |
| What a push says              | `{ title, body?, path?, tag?, kind?, data? }`, shown as is; `kind` goes to the app's `onPushKind`        | Kinds only (Waymark), or wakes only (Wallet): both kept as an app's choice through the hook                        |
| Where opening a push goes     | A path on the app's own origin                                                                           | Any address (legacy's `url`): a push would become a way to send a person to another site                           |
| The device's keys at rest     | Sealed by the app's store under its own key                                                              | Text in a column (legacy)                                                                                          |
| The interface                 | `PushControl` in `@sovereignfs/ui`, state from `usePush` in `@sovereignfs/pwa/client`                    | Each app's own control: the same states and iPhone sentence, written differently                                   |

## Prerequisites

- RFC 0009 accepted by the goal owner.
- `@sovereignfs/pwa` and `@sovereignfs/ui` published (task 11.15's precondition), or local tarballs for legs 3 and 4 as 11.12 used.
- For leg 4, a person with an iPhone, an Android phone, and a desktop with Chrome, Firefox and Safari, and an https host for the
  generated app (the suite's domain will do).
- For leg 5, local checkouts of Tusk, Waymark, Tally, Shopper and Wallet on `develop`, and the packages published.

## Legs

| Leg | Name                             | Epic tasks | Gate? | Done when                                                                  |
| --- | -------------------------------- | ---------- | ----- | -------------------------------------------------------------------------- |
| 1   | `@sovereignfs/push`              | 19.1, 19.2 | Yes   | The package is release-ready; its own and the conformance tests pass       |
| 2   | The worker, the page, the switch | 19.3, 19.4 | Yes   | `pwa` and `ui` carry push, each with a minor bump                          |
| 3   | The template                     | 19.5       | Yes   | A generated app sends and opens a push in a desktop browser, both variants |
| 4   | On the devices                   | 19.6       | Yes   | Research 0013's device table is filled and RFC 0009 corrected where needed |
| 5   | The apps                         | 19.7       | Yes   | Tusk and Waymark are on the packages; the three designs point at them      |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Leg 2 has no dependency on leg 1 and can run beside
it. Leg 4 needs no code here beyond what it records. Leg 5 is one change in each app repository, not a branch here.

## Leg detail

### Leg 1 — `@sovereignfs/push`

**Epic tasks:** 19.1, 19.2

**Why here:** everything else calls it, and its encryption is the part that must be right before anything else is built on it.

**Technical notes:** the encryption and the JWT follow RFC 8291 §3 and Appendix A, and RFC 8292 §2 and §3; `node:crypto`'s
`createECDH('prime256v1')`, `hkdfSync`, `createCipheriv('aes-128-gcm')` and `sign` with `dsaEncoding: 'ieee-p1363'` cover them. Read
Tusk's `src/push/store.ts` (`parseSubscription`, the sealed credential, ten devices) and Waymark's `src/push/outbox.ts` (the lease,
`BACKOFF_MS`, `TTL_MS`, the host rule) and keep what they learnt. The store's shape follows the SDK's (`packages/sdk/src/testing`).
A new published package is listed in the places `docs/releasing.md` names, and the Dockerfile copies its manifest (a test fails
otherwise).

**Do not proceed if:** the worked example does not reproduce byte for byte, or the package would need a runtime dependency.

### Leg 2 — The worker, the page, the switch

**Epic tasks:** 19.3, 19.4

**Why here:** both are needed by the template and neither needs the server's package, so they can be built beside leg 1.

**Technical notes:** the worker is text (`packages/pwa/src/worker.ts`) evaluated as served by its tests; Tusk's handlers in
`tusk/src/sw/source.ts` (`ownPath`, focus then navigate, always showing something) are the model. `usePush` lives in the client entry,
which already carries React. `PushControl` reuses `InstallPrompt`'s iPhone steps and `Toggle`; its words follow
`docs/design-system.md` and the `sv-ui-design` skill.

**Do not proceed if:** the worker would need to store anything to show a push, or the control would need a framework's router.

### Leg 3 — The template

**Epic tasks:** 19.5

**Why here:** it is the first place all three packages meet, and it gives leg 4 an app to try on devices.

**Technical notes:** the template is `tools/create/template/app` (`lib/stores.ts` and `lib/crypto.ts` show how a store is written and
sealed; `instrumentation.ts` runs once at start; `migrations/` are SQL). The two tables come from `@sovereignfs/push`'s README. Its
tests are `tools/create/src/app.test.ts`. Check the CSP (`lib/csp.ts`): a push needs no new directive, but say so in a test.

**Do not proceed if:** the generated app cannot pass the conformance suite with its own store, or a rolled-back change sends a push.

### Leg 4 — On the devices

**Epic tasks:** 19.6

**Why here:** before any deployed app moves, so they move on facts rather than on research 0013's _(to confirm)_.

**Technical notes:** the app from leg 3 on an https host. Record browser and OS versions in each cell. The push that shows nothing
is sent from a throwaway page that is not committed.

**Do not proceed if:** the iPhone does not receive a push in an installed app at all: then stop and revisit RFC 0009 before leg 5.

### Leg 5 — The apps

**Epic tasks:** 19.7

**Why here:** the packages are published and seen working, so each app is changed once.

**Technical notes:** Tusk keeps its key (a device subscribed before still receives); its `TUSK_VAPID_PUBLIC_KEY` is compared with the
derived one for a release. Tusk's wake reads IndexedDB in its worker and stays the app's code, passed in as `handlers`. Waymark's kinds
become `onPushKind`. Each app commits on its own `develop` with its own version.

**Do not proceed if:** moving an app would end its existing subscriptions.

## Risks

- **Hand-written cryptography.** A wrong byte means pushes that never arrive, not a security hole (the push service and the browser
  check), but it is silent. The worked example and a decrypting test are the guard; leg 4 is the proof.
- **Apple's push service is strict** about the JWT's `sub`, `aud` and expiry (legacy's `403 BadJwtToken`). Leg 4 checks it on an
  iPhone before any app relies on it.
- **A worker that shows nothing loses its permission.** Every path through `push` shows something; the tests evaluate them all.
- **The outbox runs in the app's process.** A deployment that runs several copies relies on the lease; the conformance suite tests
  two runners.

## Kill criteria

If browsers stop delivering to installed web apps on iPhone, or the hand-written encryption cannot be made to interoperate, the
workstream stops after leg 1 with `@sovereignfs/push` built on `web-push` instead (one dependency, the same API), and the rest
continues unchanged. Legs 2 and 3 stand on their own: the worker's handlers and the control are useful to any sender.

## Changelog

| Version | Date          | Change        |
| ------- | ------------- | ------------- |
| 0.1     | November 2026 | Initial draft |
