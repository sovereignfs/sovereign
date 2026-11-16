# Epic 16: Encryption

> An app can keep what people give it so that nobody who reads the server can read it, and people do nothing but sign in.

## Status

📋 Planned

## Overview

[RFC 0005](../rfcs/0005-end-to-end-encryption.md) is the design, and [research 0008](../research/0008-end-to-end-encryption.md) the
reasoning behind it. The tasks here build it in the RFC's order: the specifications; the password derivation and signing in with a derived
value, which every instance gets; the library's keys and formats; core's vault; key release to an app; sharing; escrow; and the same for
an app with no core.

Two things stop the work until someone outside it answers, and [workstream 0003](../workstreams/0003-encryption.md) holds both as gates:

- **The cost of the password derivation is fixed by measuring it on real phones** (after 16.2).
- **A cryptographer reviews the design before anything stores a key** (before 16.6). The [review brief](../rfcs/0005-review-brief.md) is
  what they are sent.

What is promised stays what the RFC says: data is safe from anyone who reads the server, and not from an operator who changes the code a
server sends. Until a code audit, every guide and screen that describes the feature says it is not yet audited.

## Related

- [RFC 0005](../rfcs/0005-end-to-end-encryption.md) and its [review brief](../rfcs/0005-review-brief.md)
- [Research 0008](../research/0008-end-to-end-encryption.md), [research 0006](../research/0006-data-at-rest.md)
- [docs/specs/core-app.md](../specs/core-app.md): §3.3.2, §3.4, §3.5, §3.6.2, §3.7, §3.16, and the section task 16.1 adds
- [Workstream 0003](../workstreams/0003-encryption.md): the order, the gates and the decisions already made

## Tasks

#### 📋 16.1 — The specifications

**Goal:** What RFC 0005 designs is written into the documents that hold authority, so every later task implements a specification and not
an RFC.

**Priority:** 1. Nothing is built from the RFC directly.

**Deliverables:**

- `docs/specs/core-app.md`: a new section for keys (the vault, setting up, the recovery kit, unlocking, key release, staying unlocked,
  escrow); §3.3.2 and §3.4 say that core receives a derived value and never a password, and that the policy is the browser's; §3.5 gains
  `'wasm-unsafe-eval'`; §3.6.2 gains the `keys` scope; §3.7 the two fields an app has for encryption; §3.16 loses end-to-end encryption
  and the recovery kit; a changelog row
- `contracts/app-manifest.md`: manifest 4 and `encryption` (the schema itself is task 16.9's)
- `docs/specs/sdk.md` §9: key release and the app's route for it; `docs/specs/operator-cli.md`: `sv key escrow`;
  `docs/specs/design-system.md`: the two components of task 16.5
- RFC 0005 worded to what is designed in the two places its brief questions: what a browser knows about a document's current version
  (§1.3), and what a reader of the server's memory gets (Security and privacy)
- `docs/rfcs/README.md` and the RFC's `Status:` say which tasks carry it

**Dependencies:** none

**Spec reference:** RFC 0005, all of it

**Review checklist:**

- Every MUST in the new section can be traced to a section of the RFC, and nothing in the RFC that binds an implementation is missing
- No specification says a password reaches core
- `pnpm docs:check-links` and `pnpm format:check` pass; no code changes

#### 📋 16.2 — The password derivation

**Goal:** One function turns a password, an address and an instance's id into the sign-in value and the unlock key, the same in a
browser and in Node, at a cost that was measured.

**Priority:** 2. Signing in (16.3) and every key (16.4) start from it.

**Deliverables:**

- a look for audited implementations of Argon2id that can be shipped from the app's own origin, the choice and its reason written in the
  package's README; one is built here only if none fits
- `@sovereignfs/crypto`: a browser-safe entry point (no `node:` import) beside the server's, with `derivePassword` (RFC 0005 §1.1: the
  salt, NFKC, one Argon2id run, the two HKDF outputs, `svp1.` and its shape check) running unchanged in Node
- test vectors checked in, RFC 9106's among them; a vector made in Node opens in a browser test and the reverse
- a timing page that runs the derivation at a chosen cost and shows how long it took, to open on real phones
- the cost written as a constant with the measurements beside it, by the rule of RFC 0005 §1.4

**Dependencies:** 16.1

**Spec reference:** RFC 0005 §1, §1.1, §1.4

**Review checklist:**

- The same inputs give the same two values in Node and in a browser
- Two instance ids, or two addresses, give unrelated values for one password
- The sign-in value gives nothing towards the unlock key: they are separate HKDF outputs, and a test holds that neither is derived from
  the other
- Nothing is fetched from another origin; the WebAssembly is in the package
- The timing page runs on a phone and its numbers are recorded

#### 📋 16.3 — Signing in with a derived value

**Goal:** Core never receives a password. Every place a password is typed sends the sign-in value, on every instance.

**Priority:** 3. It is worth having by itself, and the unlock key exists only once this does.

**Deliverables:**

- every form that takes a password derives before it sends: sign-up, sign-in, accepting an invitation, the reset, the change, and each
  place the password is asked again (deleting the account, handing over ownership, the two-factor pages); the form says it is working
  while it derives
- `policedHash` refuses anything that is not a sign-in value; `passwordProblems` runs in the browser before deriving
- the instance id: 32 random bytes made once, before the first account, on every dialect, never changed, given to core's pages when
  they are rendered and added to `/.well-known/sovereign-instance` in the contract, with `packages/api-client` generated again
- `sovereign-admin` and the seed derive in Node from the address and the instance id they read from the database
- `'wasm-unsafe-eval'` in `script-src`, with a test that holds `'unsafe-eval'` out
- the populated-store fixtures made again from derived values, and the store tests run against them
- a test that fails if a password reaches the server: each password flow's requests hold nothing that is not a sign-in value
- AGENTS.md and `docs/architecture-rules.md`: the rule that the policy is enforced where the hash is made is replaced by the one in RFC
  0005 §2, with its reason
- `docs/upgrade.md`: accounts from before set their password again through the reset link, after a backup; `apps/core`'s changelog

**Dependencies:** 16.2, with its cost fixed

**Spec reference:** core-app §3.3.2, §3.4, §3.5; RFC 0005 §2

**Review checklist:**

- A person signs up, signs in, changes and resets a password, and no request carries the password
- A value that is not the derivation's shape is refused wherever a password is set
- A password that breaks the policy is refused in the browser, with the policy's own words
- An account from before cannot sign in with its old password and can after the reset link
- The seed and `sovereign-admin` make accounts that sign in from a browser
- Changing `SV_URL` on an instance with accounts changes nobody's sign-in value; a restored backup has the id it was taken with
- better-auth's origin and CSRF checks, its rate limits and `confirmPassword`'s count are unchanged
- `pnpm e2e` passes on each database

#### 📋 16.4 — Keys and formats `[parallel]`

**Goal:** `@sovereignfs/crypto` makes, wraps and opens every key and record of RFC 0005, and encrypts a document in chunks, with a test
for each way a record must be refused.

**Priority:** 4. No data is stored by it, so it can be built while signing in is.

**Deliverables:**

- a look for audited implementations of HPKE over WebCrypto, as for Argon2id in 16.2
- the account key and its wraps (unlock key, passkey, kit, escrow), the app key, the two key pairs of an app, the account's signing key
  and what it signs, a document key sealed to a reader and signed by who shared it: each a record with `suite` and the associated data of
  RFC 0005 §1.2
- the recovery kit: 32 bytes to groups of letters and digits and back, the check group, and a mistyped kit told from a wrong one
- documents and files in chunks (§1.3), reading and writing as streams
- the vault as an interface, with no implementation: what core (16.6) and an app with no core (16.13) each provide
- remembered keys: what a page keeps of another person's signing key, and the refusal when it changes
- keys are WebCrypto keys that cannot be exported wherever the algorithm allows
- vectors for every format, and RFC 9180's

**Dependencies:** 16.2

**Spec reference:** RFC 0005 §1.2, §1.3; the keys section of core-app

**Review checklist:**

- A record moved to another person, app or document does not open
- A file that is cut short, reordered, or carries another document's header does not open
- A kit with one wrong character is refused as mistyped
- A changed signing key is refused until it is accepted
- Nothing in the package reads `window` or `indexedDB` at import, and its server entry point still works in Node with no change

#### 📋 16.5 — A locked state and the recovery kit, in the design system `[parallel]`

**Goal:** `@sovereignfs/ui` has what every encrypted app and core show: a place that this browser cannot open, and the recovery kit.

**Priority:** 5. Core's vault (16.6) and key release (16.10) use them.

**Deliverables:**

- `LockedState`: what is locked and a `ButtonLink` to unlock, the link from the consumer; and the words for access that was taken away
- `RecoveryKit`: the kit in groups, a way to print it and to save it, and a box that confirms it was kept before going on
- what `DeviceOnlyGate` and `DeviceStorageKeyGate` already do is read first, and reused or left alone with the reason said
- stories (default and one variant each), Component Gallery entries, the package's changelog and version

**Dependencies:** 16.1

**Spec reference:** design-system; RFC 0005 §7

**Review checklist:**

- Neither component imports from `next`, and neither reads a browser global in render
- Colours are semantic tokens only; `pnpm design:tokens:check` passes
- The kit can be read by a screen reader group by group, and printed on one page
- `pnpm --filter @sovereignfs/ui typecheck` passes

#### 📋 16.6 — Core's vault and the recovery kit

**Goal:** A person who signs in has an account key, wrapped by their password and by a recovery kit they were shown, kept by core in a form
core cannot open.

**Priority:** 6. **Not started before the cryptographer's review of RFC 0005** (workstream 0003).

**Deliverables:**

- `key_accounts`, `key_wraps` and `key_apps` in every dialect, with migrations
- setting up at the first sign-in after this ships: the account key and signing key made in the browser, wrapped by the unlock key, and
  the kit shown and confirmed before going on
- unlocking with the password in the browser; a changed password sends the new sign-in value and the re-wrapped key in one request, both
  applied or neither
- a reset by email removes the `password` wrap; the next sign-in asks for the kit, and the new password gets its wrap once unlocked
- an account's rows are deleted in the one transaction that deletes the account
- server actions for all of it that call `requireCapability`, act for the session's own account only, and never take an account from a
  request
- the reset page, the kit page and the operator's reset say what a reset does to encrypted data

**Dependencies:** 16.3, 16.4, 16.5, and the review

**Spec reference:** the keys section of core-app; RFC 0005 §3

**Review checklist:**

- Core's database holds no key and nothing a key can be made from without a password, a passkey or the kit
- A person on a second browser signs in with the password alone and is unlocked
- After a reset by email the account works, the data is locked, and the kit unlocks it
- A changed password leaves no moment at which the wrap and the sign-in value disagree
- Deleting an account leaves no row of it in the three tables
- The schema parity test passes; `pnpm test:db` passes on each dialect

#### 📋 16.7 — Staying unlocked until the session ends

**Goal:** A reload or a new tab asks nothing, and a browser whose session has ended holds nothing that can be opened, whether or not a
page was open when it ended.

**Priority:** 7.

**Deliverables:**

- `key_session_secrets`, a row for each session, removed with it however it ends
- `@sovereignfs/crypto`: a key kept in IndexedDB wrapped twice (a device key that cannot be exported, and a key from the session secret),
  unwrapped when a page loads and has the secret, deleted when it has no session
- core's pages use it for the account key
- the service worker neither stores nor sees any of it, held by a test

**Dependencies:** 16.6

**Spec reference:** the keys section of core-app; RFC 0005 §5

**Review checklist:**

- A reload and a new tab are unlocked with no prompt
- A session ended from another browser leaves the first unable to open what it kept, with no page of it open at the time
- Signing out deletes what was kept
- The session secret is given to its own session only, and never to another account's
- The key in memory cannot be exported

#### 📋 16.8 — Passkeys that unlock `[parallel]`

**Goal:** Signing in with a passkey unlocks with the same touch where the passkey can, and a person always knows which of their passkeys
do.

**Priority:** 8.

**Deliverables:**

- adding a passkey, while unlocked, gives it a wrap (a random PRF input for that passkey, its output through HKDF); removing it removes
  the wrap
- signing in with a passkey asks for the PRF extension and unlocks from its result, which never reaches the server
- unlocking an already signed-in browser with a passkey, by a ceremony whose answer is sent nowhere
- a passkey that does not answer PRF still signs in, and the person is asked for the password when something needs unlocking
- the passkey page marks the passkeys that unlock and warns before one is removed

**Dependencies:** 16.6, 16.7

**Spec reference:** core-app §3.4 and its keys section; RFC 0005 §1.2, §3

**Review checklist:**

- A passkey added before this ships signs in as before
- No request carries a PRF result
- Two passkeys of one person have different PRF inputs
- A passkey must still be user-verified, at both ceremonies
- Signing in with a passkey that cannot unlock ends in a working session and a prompt, never an error

#### 📋 16.9 — Manifest 4, and allowing an app to use encryption `[parallel]`

**Goal:** An app says it uses encryption, and an operator allows it, the way an app's scopes are shown and given today.

**Priority:** 9. It stores no key, so it does not wait for the review.

**Deliverables:**

- `contracts/schemas/app-manifest-v4.schema.json` and `@sovereignfs/manifest`: manifest 3 and `encryption.return`, a path held to
  `signIn`'s rules, refused without `signIn`
- an app's two fields in core (may use encryption, its key return address), written only by `ClientRegistry`, with the `keys` scope
  allowed only to an app that may
- the Console's technical settings show and change them
- `sv app add` shows `encryption` to the operator and registers it; a toolkit that reads 4 reads 1 to 3 as it did
- the changelogs and versions of `@sovereignfs/manifest`, the toolkit and core

**Dependencies:** 16.1

**Spec reference:** `contracts/app-manifest.md`; core-app §3.6.2, §3.7; RFC 0005 §6

**Review checklist:**

- A manifest 4 with no `signIn` is refused with the reason
- An app that may not use encryption is never granted `keys`
- Switching encryption off for an app changes what it may ask for next and nothing that is stored
- A toolkit that reads only 1 to 3 refuses a manifest 4 and names the version that reads it

#### 📋 16.10 — Key release

**Goal:** An app's page gets the app's key from core's page, once for each browser session, and the person sees nothing unless the browser
needs unlocking.

**Priority:** 10.

**Deliverables:**

- core's `/keys/release` page: the checks of RFC 0005 §4 step 2, the unlock prompt of step 3, the app key and key pairs made on a
  person's first time in the app, the answer sealed, signed and returned in the fragment
- `@sovereignfs/sdk`: steps 1 and 5, the app's route for `return`, the app's key kept as 16.7 keeps the account key (the session secret
  with the app's own session), and `LockedState` where an app cannot open something
- `@sovereignfs/crypto` is published, since the SDK now depends on it: `docs/releasing.md`, AGENTS.md's list of published packages, its
  changelog and first version
- a test for each refusal of step 5

**Dependencies:** 16.6, 16.7, 16.9

**Spec reference:** the keys section of core-app; sdk §9; RFC 0005 §4, §5

**Review checklist:**

- An app receives its own key and never another's, whatever it asks for
- An answer replayed, sent to another app, older than two minutes, for another person, or to a page that did not ask is refused
- Nothing of a release is in a request to any server: the fragment is removed from the address before anything else runs
- A site that sends a person to `/keys/release` learns nothing and changes nothing
- Core's OpenID Connect provider is unchanged, and an app that only signs in sees no difference
- `/keys/release` is rendered per request, never cached and never framed

#### 📋 16.11 — Sharing between people

**Goal:** A person shares a document with another, and the other's browser opens it, with a swapped key refused.

**Priority:** 11.

**Deliverables:**

- `GET /api/v1/keys/me` and `GET /api/v1/keys/people/{sub}` in `contracts/core-api/openapi.yaml`, behind their guard and the `keys`
  scope, each handler's answer checked against the contract; `packages/api-client` generated again
- `@sovereignfs/sdk`: both calls, and sharing and opening a document key through `@sovereignfs/crypto`
- an app's page remembers each person's signing key and refuses a changed one until the person says to go on
- removing a reader removes their document key and makes a new one at the next write

**Dependencies:** 16.10

**Spec reference:** `contracts/core-api/`; the keys section of core-app; RFC 0005 §3.1, §8

**Review checklist:**

- A person who has never opened the app answers `404`, and the app says so
- A public key the server changed is refused in the browser
- A reader who was removed cannot open what is written afterwards
- The two calls return public keys and wrapped keys only

#### 📋 16.12 — Escrow `[parallel]`

**Goal:** An instance whose owner turns escrow on can recover a person's data offline, and every person on it is told so.

**Priority:** 12.

**Deliverables:**

- `sv key escrow` makes the key pair on the operator's machine and gives core the public half; `sv key escrow open` opens one person's
  account key offline and wraps it for a new kit
- the escrow public key is an instance setting, changed only by `InstanceManager` with the owner-only capability
- each person's browser adds an escrow wrap when it is next unlocked, and their security page says the owner can recover their data
- the operating guide: what escrow is, that it is off unless turned on, and what a reset does without it

**Dependencies:** 16.6

**Spec reference:** the keys section of core-app; operator-cli; RFC 0005 §6

**Review checklist:**

- With escrow off, no account has an escrow wrap and nothing says it has
- The escrow private key is never on the server and never in a backup
- Turning escrow on is shown to a person before their data is covered by it
- A person recovered through escrow gets back in with the new kit and sets a password

#### 📋 16.13 — A vault for an app with no core `[parallel]`

**Goal:** An app that runs alone encrypts the same way, with its own sign-in unlocking its own vault.

**Priority:** 13.

**Deliverables:**

- `@sovereignfs/crypto`: the vault interface of 16.4 over `@sovereignfs/database`, with the tables for every dialect
- unlocking at the app's own password sign-in by the same derivation, and by a passphrase for an app whose sessions are someone else's
- the recovery kit and staying unlocked, as in core
- [Building an app](../building-an-app.md): how an app with no core turns it on

**Dependencies:** 16.7

**Spec reference:** RFC 0005 §1, §4 (its last paragraph); RFC 0003

**Review checklist:**

- The package imports nothing from `apps/core`
- An app with no core and an app with one store the same records
- The app's server never receives a password or a passphrase

#### 📋 16.14 — An encrypted app, end to end

**Goal:** The whole path is shown to work from a browser, an app's author has a guide, and nothing says more than is true.

**Priority:** 14.

**Deliverables:**

- the app template can be made with encryption: a document a person writes, shares and reads back, with `LockedState`
- `apps/e2e`: sign up and keep the kit; open the app in a second browser with the password alone, and with a passkey; reset by email and
  recover with the kit; end a session elsewhere and find the first browser locked; share with a second person; a third cannot read
- a guide for an app's author, with the rules of RFC 0005 §8 (nothing of a document in a notification, an activity entry or mail)
- the deploying and operating guides say what is and is not protected, in the RFC's words, and that the feature is not yet audited
- core-app's acceptance list for this phase, one named test for each item

**Dependencies:** 16.10, 16.11

**Spec reference:** the keys section of core-app; RFC 0005 §8, Testing

**Review checklist:**

- Every item of the acceptance list has a test with its number in the title
- The server's database, files and backup of the test instance hold no plaintext of a document, its name or its type
- No guide uses the word "zero-knowledge", and each says the feature is not yet audited
- `pnpm e2e` passes on each database
