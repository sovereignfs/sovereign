# RFC 0005 — Encryption the server cannot read: keys, signing in, and the vault

|              |                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Accepted on 2026-11-16; not yet built. Step 3 of the rollout onwards waits for a cryptographer's review                                                                                                                                                                                                                                                                |
| **Date**     | November 2026                                                                                                                                                                                                                                                                                                                                                          |
| **Author**   | Claude Code, for review                                                                                                                                                                                                                                                                                                                                                |
| **Scope**    | `docs/specs/core-app.md` (§3.3.2, §3.4, §3.5, §3.6.2, §3.7, §3.16, a new section); `contracts/core-api/`; `contracts/app-manifest.md` (manifest 4) and its schemas; `docs/specs/sdk.md` §9; `docs/specs/design-system.md`; `AGENTS.md` and `docs/architecture-rules.md` (one rule retired); `packages/crypto`, `packages/sdk`, `packages/ui`, `apps/core`, `tools/cli` |
| **Research** | [0008](../research/0008-end-to-end-encryption.md), which builds on [0006](../research/0006-data-at-rest.md)                                                                                                                                                                                                                                                            |
| **Tasks**    | [16.1–16.14](../epics/encryption.md), in milestone M15 of the roadmap, run as [workstream 0003](../workstreams/0003-encryption.md)                                                                                                                                                                                                                                     |

## Summary

An app can keep what people give it so that nobody who reads the server can read it, and people use it as they use any app: they
register once, keep a recovery kit, and sign in. Research 0008 settled the direction. This RFC is the design it left:

1. **The algorithms**, one for each job, and the formats they are stored in.
2. **Signing in without the password reaching core**, which is what lets the password unlock a person's keys.
3. **The vault**: what core stores, and the two calls an app makes.
4. **Key release**: how an app's page gets the app's key from core's page.
5. **Staying unlocked until the session ends**, including when no page is open at the time.
6. **The manifest and the operator's part**, the locked state in the design system, and escrow in the toolkit.

What is promised is what the research says: data is safe from anyone who **reads** the server, its disk or its backups. It is not
promised against an operator who changes the code a server sends.

## Motivation

- People's documents, notes and files are plain on the server's disk, and nothing done on the server protects them from root while it
  runs (research 0006).
- The services people trust with such data ask for nothing unusual: one password, one recovery key. An encryption that asks for a
  second secret, or for a prompt in every app, will be turned off.
- An app must be able to run with no core and behave the same ([RFC 0003](0003-apps-of-their-own.md)), so the model cannot belong to
  core alone.

## Current state

- `@sovereignfs/crypto` encrypts fields on the server with a key from the environment (`sv1:` envelopes). It has no browser side.
- Core receives the password in plain and checks the policy where it hashes it (`policedHash`, `apps/core/src/auth/auth.ts`).
- Core's passkeys are discoverable and user-verified. The passkey plugin's client accepts WebAuthn extensions, removes their results
  before answering the server, and returns them to the page (`returnWebAuthnResponse`).
- Core's `script-src` has no `'wasm-unsafe-eval'` (`apps/core/src/csp.ts`).
- An app's session is its own; core tells the app's server when it ends (back-channel logout). No page is told.

## Goals

- One model, in `@sovereignfs/crypto`, used the same by core, by a connected app and by an app with no core.
- Signing in is all a person does. Nothing about keys is shown until an encrypted app needs something.
- Core's OpenID Connect provider is unchanged, so an app that only signs in, Sovereign's or not, sees no difference.
- The stored formats detect a server that swaps a key or a file, from the first version.
- An operator's ordinary work is unchanged; what they can no longer do is said to them.

## Non-goals

- Protection from a server that sends altered code. It needs a client the server does not deliver.
- Encrypting core's own data (names, addresses, roles): research 0006 stands.
- Groups as readers, search on the server, a split escrow key, post-quantum key wrapping, moving an app's vault into core's.

## Design

### 1. Algorithms

One for each job. All but the first are in WebCrypto, so keys can be held as keys that cannot be exported.

| Job                               | Algorithm                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| A secret from a password          | Argon2id, 64 MiB, 3 passes, 1 lane, 16-byte salt, 32 bytes out (RFC 9106), from libsodium |
| One secret into several           | HKDF-SHA-256, with a different `info` for each purpose                                    |
| Encrypting a key or a small value | AES-256-GCM, a random 96-bit nonce, the record's context as associated data               |
| Encrypting a document or a file   | AES-256-GCM in chunks of 64 KiB (§1.3)                                                    |
| Encrypting a key to a person      | HPKE (RFC 9180), base mode: X25519, HKDF-SHA-256, AES-256-GCM                             |
| Signing                           | Ed25519                                                                                   |
| A secret from a passkey           | The WebAuthn PRF extension's output, through HKDF                                         |

- **Suite 1** is this table. Every stored record names its suite, so a second one (a post-quantum key wrap, say) is read beside it.
- **Argon2id is WebAssembly**, built into `@sovereignfs/crypto` and served from the app's own origin, never fetched from another
  site. The same build runs in Node, for the seed and `sovereign-admin`. Its cost is measured before it is fixed (§1.4).
- **As little cryptography as possible is written here.** Step 1 begins by looking for implementations of Argon2id and HPKE that
  have been audited and can be shipped from the app's own origin; one is written over WebCrypto only where none fits. Either way it
  is held to the published test vectors (RFC 9106, RFC 9180).
- **The package ships test vectors for every format here**, and a second implementation's answers are checked against them.

#### 1.1 From the password

```
address   = the sign-in address, trimmed and in lower case
salt      = first 16 bytes of SHA-256("sovereign/1/password" ‖ instance id ‖ address)
master    = Argon2id(NFKC(password), salt)
sign-in   = "svp1." ‖ base64url( HKDF(master, info = "sovereign/1/sign-in") )
unlock    = HKDF(master, salt = the vault's random salt for this account, info = "sovereign/1/unlock")
```

- **One Argon2id run gives both values.** The sign-in value goes where the password goes today. The unlock key never leaves the
  browser. HKDF is one-way in both directions, so the value core receives gives nothing towards the unlock key.
- **The instance id is 32 random bytes that core makes once**, before its first account, keeps as a setting and never changes. It
  is the same for every account, so giving it out tells nothing about who has one. Core's pages are given it when they are rendered,
  and it is in the public instance document (`/.well-known/sovereign-instance`) for any other client.
- **It is not the instance's address**, so an instance that moves to another address keeps every sign-in value and every unlock key.
  It is in the database, so it comes back with a restore; a copy of an instance has the same id and the same values, as it has the
  same accounts.
- **Nothing is asked about an address before signing in**, and nothing tells whether one has an account. The same password and
  address on two instances give unrelated values.
- **A server that gives a wrong id** makes signing in fail and learns nothing it could not learn by sending altered code. What is
  given up, against a salt made from the address bar, is that a copy of the site at another address can ask for the real instance's
  id and so collect values that work on it: no worse than a password typed into such a copy today, and no better.
- **`master` is held only as a WebCrypto key that cannot be exported**, its bytes overwritten as soon as it is imported, and is
  dropped once the unlock key is made: that needs the vault's salt, which core gives only after signing in.

#### 1.2 Records

Every record is JSON with `suite`, and every encryption has associated data that names what it is: its kind, the person's `sub`, and
what it belongs to. A record moved to another person, another app or another document does not open. As built in
`packages/crypto/src/web`, with frozen vectors of every format:

- **Associated data, HPKE `info` and every signed message** are one encoding: a label (`sovereign/1/<kind>`), then each field as its
  length in four bytes big-endian and its bytes. Without the lengths a byte could move from a `sub` into a client id and read the
  same.
- **A wrap** is `{ "suite": 1, "nonce", "ciphertext" }` (AES-256-GCM, a random 96-bit nonce); **a sealed key** is
  `{ "suite": 1, "enc", "ciphertext" }` (HPKE), with `"signature"` when it is a shared document key. Every value is unpadded
  base64url, and a record with another field, or a missing one, is refused.
- **A private key is wrapped as PKCS#8**, and opened again as a key that cannot be exported.

| Record            | Encrypted with                             | Associated data                                             |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Account key wrap  | the unlock key, a passkey's key, the kit's | `account-wrap`, `sub`, the wrap's kind and id               |
| Escrow wrap       | HPKE to the instance's escrow public key   | `escrow-wrap`, `sub`, the escrow key's id                   |
| App key           | the account key                            | `app-key`, `sub`, the app's client id                       |
| Account signing   | the account key                            | `account-signing`, `sub`                                    |
| Identity privates | the app key                                | `identity`, `sub`, the app's client id, `receive` or `sign` |
| Document key      | HPKE to the reader's receiving key         | `document-key`, the document's id, reader's `sub`           |

- **A passkey's key** is `HKDF(PRF output, info = "sovereign/1/passkey-unlock")`. The PRF input is 32 random bytes made for that
  passkey and kept with its wrap: no input is shared between passkeys or people.
- **The recovery kit** is 32 random bytes, and `HKDF(kit, info = "sovereign/1/kit")` is its key. It has full strength, so it needs
  no Argon2id. It is shown once, as **groups of four letters and digits** from an alphabet with no look-alikes (no `I`, `L`, `O` or
  `U`: Crockford's base32), ending in a check group, so a mistyped kit is refused as mistyped and not as wrong. Thirteen groups hold
  the 256 bits, with four spare bits that are always zero; the fourteenth is the first 20 bits of SHA-256(`sovereign/1/kit-check` ‖
  kit). It reads the same in every language and needs no word list. Typing it ignores case, spaces and hyphens, and reads `O` as `0`
  and `I` and `L` as `1`, as Crockford's decoding does.
- **A person's public keys are signed.** The account has one signing key. It signs each app's two public keys (one to receive, one
  to sign) with the `sub` and the client id: `app-keys`, `sub`, client id, receiving key, signing key. A document key's record is
  signed by the person who shared it with their signing key for the app, over `document-key-signature`, the document's id, the
  reader's `sub`, `enc` and the ciphertext.

#### 1.3 Documents and files

```
header  = "SVE1" ‖ suite (1 byte) ‖ chunk size (4) ‖ version (4) ‖ id length (2) ‖ document id (UTF-8) ‖ 32 random bytes
key     = HKDF(document key, salt = the header's random bytes, info = "sovereign/1/content")
chunk i = AES-256-GCM(key, nonce = i in 11 bytes ‖ last (1 byte, 0 or 1), associated data = header)
```

- **A key for each stored blob**, so counting nonces is safe and no two blobs share one.
- **The header is authenticated with every chunk**: a blob returned under another document's id, or with a version other than the one
  the browser asked for, does not open. Which version is current is the app's to know; a server that returns an older, valid version
  when asked for "the latest" is not caught by this alone (a question put to the reviewer).
- **The last chunk is marked**, and a reader holds a chunk back until it knows whether more follows, so a file cut short, even at a
  chunk's edge, does not open. Every number is big-endian; a chunk is 64 KiB, and a reader takes at most 1 MiB.
- A browser decrypts and shows a chunk at a time; a large file is never whole in memory.
- The name, type and size a person sees are encrypted the same way, as one small value. The file store sees
  `application/octet-stream` and a length.

#### 1.4 The cost of the password derivation

- **It starts at 64 MiB and 3 passes** (RFC 9106's second recommendation) and is measured, as the first piece of step 1, on real
  phones: about one second on an ordinary one, two at most on a slow one.
- **If it is slower, memory comes down before passes do, and never below OWASP's minimum** (19 MiB and 2 passes).
- **Every account on an instance has the same cost**, and the code knows which costs are in use; the number after `svp` names the derivation, its cost included.
  Nothing is asked of the server before signing in.
- **When the cost changes**, the browser derives a value for each cost in use and sends them in one request, newest first. The server
  accepts whichever matches. When an older one matched, the same sign-in stores the newer value and the browser re-wraps the account
  key. A known and an unknown address are answered alike, so a change tells nothing about who has an account. Signing in is slower
  until the older cost is retired. This is built when a second cost exists, not before.

### 2. Signing in

Every instance signs in this way, with encrypted apps or none.

- **The browser sends the sign-in value where it sends the password**: at sign-up, sign-in, accepting an invitation, a reset, a
  change, and wherever the password is asked again (`confirmPassword`). better-auth hashes what it receives as it does now, so a copy
  of the database cannot sign in, and a guess at a password costs Argon2id and then better-auth's own hash.
- **The server checks the shape and nothing else.** `policedHash` refuses anything that is not `svp1.` and 43 base64url characters.
  **The password policy is checked in the browser** by the same `passwordProblems`, before anything is derived. The rule that the
  policy is enforced where the hash is made (AGENTS.md, core-app §3.3.2) is retired, and its replacement says: _core never receives
  a password, so the policy is the browser's to hold, and the server refuses anything that is not a derived value._ A person who
  goes round the browser to set a weak password weakens their own account only.
- **`sovereign-admin` and the seed derive the same way**, in Node, from the address and the instance id they read from the database.
- **The reset page is told the address** of the account its link belongs to when it is rendered, and shows it, since the page holds
  only the token and the derivation needs the address. Whoever holds the link received it at that address.
- **Signing in needs JavaScript**, and takes about a second longer, during which the form says it is working.
- **Accounts from before set their password again through the reset link**, after a backup. No second way of signing in is kept.
  better-auth's stored hashes are of a different input from then on; the populated-store fixtures are made again for it.
- **`script-src` gains `'wasm-unsafe-eval'`.** It allows WebAssembly to be compiled and nothing else: `'unsafe-eval'` stays out, and
  the rule against `'unsafe-inline'` is untouched.

### 3. The vault in core

Core stores wrapped keys and public keys. It can open none of them.

| Table                 | Holds                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `key_accounts`        | For each account: the suite, the unlock salt, the signing public key, the signing private key wrapped              |
| `key_wraps`           | The account key, wrapped once for each way in: `password`, `passkey` (with its credential), `kit`, `escrow`        |
| `key_apps`            | For each account and app: the app key wrapped, the two public keys and their signature, the private halves wrapped |
| `key_session_secrets` | For each session: 32 random bytes (§5), removed with the session                                                   |

- **Core's own pages read and write these for the session's own account**, through server actions that call `requireCapability` and
  never take an account from a request. They are not part of the Core API.
- **An account's rows go in the one transaction that deletes the account.** With them gone, everything encrypted for that person is
  unreadable, in every backup too.
- **Setting up** happens the first time a person signs in after this ships, in the browser: the account key and signing key are
  made, wrapped by the unlock key, and the recovery kit is shown and must be confirmed before going on.
- **A passkey gets its wrap when it is added**, which needs an unlocked browser, and loses it when it is removed. The passkey page
  marks those that unlock and warns before the last way in but the password is removed.
- **A changed password** sends the new sign-in value and the re-wrapped account key in one request, applied together or not at all.
- **A reset by email** removes the `password` wrap. The next sign-in finds none and asks for a passkey that unlocks, the kit, or, on
  an instance with escrow, says to ask the owner. Once unlocked, the new password gets its wrap.

#### 3.1 For apps: two calls

In `contracts/core-api/openapi.yaml`, with a person's token carrying the new scope **`keys`** (core-app §3.6.2), which only an app
the operator allowed may be granted (§6):

| Call                            | Answers                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/keys/me`           | The caller's own record for this app: both public keys, their signature, the private halves wrapped, and the account's signing public key       |
| `GET /api/v1/keys/people/{sub}` | Another person's public keys for this app, their signature and that account's signing public key; `404` when that person has not opened the app |

- **An app only reads.** Core's own page writes an app's record, when it first releases the app's key (§4).
- **Document keys are the app's to keep**, beside its documents. Core's vault stays small and knows nothing of documents.
- **A person can be shared with only after they have opened the app once**, since their keys for it are made then. An app says so,
  and may hold a share until they do.
- **The app's page remembers** each person's account signing key the first time it sees it, and refuses a different one until the
  person using it says to go on. That is what makes a swapped key visible.

### 4. Key release

An app's page needs its app key, which only core's page can unwrap. Core's OpenID Connect flow is left alone: when a person already
has a session, core answers an authorization request with a redirect and no page of its own runs. So release is a step of its own,
taken when an app's page finds it has no key: once for each browser session, not at each sign-in.

1. **The app's page** makes an X25519 key pair that cannot be exported and 16 random bytes of `state`, keeps both in IndexedDB, and
   sends the browser to core:

   `https://<core>/keys/release?client_id=…&return_to=…&request=<the public key>&state=…`

2. **Core's page** requires a session, and checks that the app exists, is switched on, may use encryption, and that `return_to` is
   exactly the address registered for it (§6). Anything else gets the page that is not there.
3. **If this browser is not unlocked**, core asks: the password, or a passkey. Both are checked in the browser alone, by whether the
   account key opens; the passkey ceremony's answer is sent nowhere.
4. **Core's page** unwraps the app key, making it and the app's key pairs first if this is the person's first time in the app. It
   seals `{ app key, sub, client id, state, time }` with HPKE to the app's public key, with the client id, `return_to` and `state` as
   HPKE's `info`, signs the result with the account's signing key, and sends the browser to

   `return_to#sv_key=<sealed>&sv_sig=<signature>&state=…`

5. **The app's page** takes the fragment and removes it from the address at once. It finds the pending record for `state` and
   deletes it, opens the answer with its private key, and refuses unless the client id and `state` inside match, the `sub` is its own
   session's, the time is within two minutes, and the signature is by the signing key it remembers for this person (or the first it
   has seen). Then it keeps the app key as §5 says.

Why it holds:

- **The answer is in the fragment**, which no server receives or logs, and it is sealed to a key only the asking page holds, so it
  is unreadable even to something that saw it.
- **One use.** The pending record and its private key are deleted when used; an answer replayed finds nothing to open it.
- **A page that did not ask cannot be made to accept a key**: an answer whose `state` it does not hold is discarded. So a site that
  sends a person to core's release address learns nothing and changes nothing.
- **An app gets its own key and no other**, whatever it asks: the key is chosen by the client id, and the answer goes only to that
  client's registered address.
- **A different person at core than in the app** is caught by the `sub`.
- **A server that puts a key of its own in the answer** fails the signature, once the app's page has seen the person's signing key.
  On the very first release a lying server is not caught: that is within the promise made, and is where fingerprints would come in.

`@sovereignfs/sdk` does steps 1 and 5 and gives the app a route for `return_to`. An app with no core has no release: its page
unlocks its own vault at its own sign-in.

### 5. Staying unlocked until the session ends

A key is kept in a browser so that a reload or a new tab asks nothing, and is made useless when the session ends, with or without a
page open to see it.

- **The server keeps half.** For each session the server makes 32 random bytes, the session secret, and gives them only to that
  session. They are removed with the session, however it ends: signing out, expiry, an operator ending it, a password reset.
- **The browser keeps the key wrapped twice:** by a device key that cannot be exported, and by a key made from the session secret.
  Both are in IndexedDB; the session secret is not.
- **When a page loads** it asks for the session secret. With it, the key is unwrapped into memory as a key that cannot be exported.
  Without it (no session), the page deletes what it kept.
- **So when a session ends while no page is open, nothing needs to be told.** What the browser holds can never be opened again,
  because the half that opened it is gone from the server. The server's half alone opens nothing either.
- **On core's origin** this holds the account key, and the secret is `key_session_secrets`. **On an app's origin** it holds the app
  key, and the SDK keeps the secret with the app's own session, which core ends by back-channel logout as now.
- This is the first thing of a person's that core keeps in a browser beyond its cookie. The service worker still stores nothing of
  a person and never sees these keys.

### 6. The manifest, the operator, and the toolkit

- **Manifest 4** is manifest 3 and one more field:

  ```json
  "encryption": { "return": "/auth/keys" }
  ```

  It needs `signIn`. `return` is a path, held to the rules of `signIn`'s paths (app-manifest §2.1). `sv app add` shows it to the
  operator with the scopes, registers `https://<name>.<domain><return>` as the app's key return address, and allows the `keys` scope. An app with no `signIn` uses the library with its own vault and declares
  nothing.

- **In the Console**, an app's technical settings say whether it may use encryption and show its key return address, written
  through `ClientRegistry` as every other field is. Switching it off stops new releases; it cannot make stored data readable or
  unreadable.
- **People are not asked app by app.** An app gets only its own key.
- **Escrow** is off unless the owner turns it on. `sv key escrow` makes an X25519 key pair on the operator's machine, keeps the
  private half there (as it keeps the recovery key, operator-cli §9.4) and gives core the public half as an instance setting, changed only
  by `InstanceManager` with the owner-only capability. From then on each person's browser adds an escrow wrap, and their security
  page says that the owner can recover their data. `sv key escrow open` opens one person's account key offline and wraps it for a
  new kit, which the person uses once to get back in.
- **What an operator is told**, in the operating guide and before the act: resetting someone's password does not give back their
  encrypted data, and without escrow nobody but that person can.

### 7. In the design system

- **`LockedState`**, for a page or a part of one that this browser cannot open: what it is, and a `ButtonLink` to unlock. It takes
  its link from the consumer, as every component does.
- **The recovery kit page**: the kit in groups, a way to print or save it, and a box that confirms it was kept.
- Both get stories and Component Gallery entries.

### 8. An app's rules

- An encrypted app puts no content into notifications, activity entries or mail it sends through core: core keeps their text.
- It never shows ciphertext, and shows `LockedState` where it cannot open something.
- Removing a reader removes their document key and makes a new document key at the next write. The app tells the person that what
  was already read cannot be taken back.
- It deletes a person's document keys when told their account was deleted, as it deletes their files.

## Security and privacy

| Someone who                                     | Gets                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| copies the disk, the database or a backup       | Ciphertext, wrapped keys, public keys. Passwords can be guessed against a wrap at Argon2id's cost                                                                                            |
| reads the running server's memory               | No key and no password, but each sign-in value as it arrives, before it is hashed: a password can be guessed against it at Argon2id's cost alone, and a right guess gives the unlock key too |
| swaps a public key, a document or a version     | A refusal in the browser (a signature, a remembered key, the header)                                                                                                                         |
| steals an unlocked laptop                       | Use of the keys until the session is ended from elsewhere, and, by running code on the page, what they open                                                                                  |
| takes a browser profile after the session ended | Nothing that opens                                                                                                                                                                           |
| holds the escrow private key                    | Every account's data on that instance; this is why it is off by default and said to people                                                                                                   |
| changes the code core or an app sends           | Everything, at the next unlock. Not covered                                                                                                                                                  |

- **What the server still sees:** who has keys for which app, who shares with whom, sizes and times.
- **A weak password is a weak key.** The policy is in the browser now, so the sign-up page's guidance matters more than it did.
- **Cross-site scripting in an app** can use that app's key while the page is open, and with it open every record that key wraps,
  to their bytes; it cannot reach another app's key. A key that cannot be exported cannot be copied out as an object; it does not
  stop a script on the page from doing what the page can do with it.
- **Core's hardening is unchanged**: origin and CSRF checks, the nonce policy, no fresh-session rule. `/keys/release` is a per-person
  page, never cached, never framed.

## Alternatives considered

- **SRP or OPAQUE in place of a derived value.** Stronger against a server that watches sign-ins, and it replaces better-auth's
  password sign-in, with every flow that touches a password. The derived value gets the property that matters here (core never has
  the password) and changes one function.
- **Releasing the key inside the OpenID Connect redirect.** One round trip fewer, but no page of core's runs when a session exists,
  so core would have to put a page into every authorization, and its provider would stop being the plugins as configured.
- **An invisible frame of core's in the app's page.** Browsers partition storage for a frame on another site, so the frame would not
  find core's key, and core refuses to be framed.
- **App keys derived from the account key.** Nothing to store, and an app's key could then never be replaced or moved (research
  0008).
- **A library that is not WebCrypto** (libsodium in WebAssembly). One dependency for everything, but its keys are bytes any script
  can read. WebCrypto's cannot be exported.
- **Keeping the unlocked key in memory only.** Nothing to protect at rest, and a prompt at every reload.

## Testing

- **Vectors** for every format, checked in, and the published ones for Argon2id, HKDF and HPKE.
- **Each refusal has a test**: a record moved between people, apps or documents; a truncated or reordered file; an older version; a
  replayed, mis-addressed or wrongly signed release; a changed signing key.
- **Sign-in against a populated store**, as every better-auth change is: the fixtures are made again with derived values.
- **A test fails if a password reaches a server**: the e2e suite reads the requests of each password flow and finds no value that is
  not `svp1.`.
- **e2e**: sign up and keep the kit; open an encrypted app in a second browser with the password alone; the same with a passkey;
  reset by email and recover with the kit; end a session elsewhere and find the first browser locked.
- **The CSP test** holds `'wasm-unsafe-eval'` in and `'unsafe-eval'` out.

## Rollout

Each step is useful by itself and is a task or a few.

1. **`@sovereignfs/crypto`'s browser side**: the algorithms, the formats, the vectors. Nothing uses it yet. **A cryptographer
   reviews this RFC before step 3** (see "The review").
2. **Signing in with a derived value**, on every instance. A breaking change for accounts (the reset link), with a note in
   `docs/upgrade.md`.
3. **Core's vault**: setting up, the kit, unlocking by password and by passkey, staying unlocked.
4. **Key release**, the SDK's part, manifest 4, the Console's setting, `LockedState`.
5. **Sharing**: an app's key pairs, the two calls, remembered keys.
6. **Escrow**, in core and `sv`.
7. **The vault for an app with no core.**

## The review

- **The design is reviewed first, the code later.** One cryptographer reads this RFC before step 3 is begun: it is days of work,
  and it finds the mistakes that would otherwise cost a format. A code audit follows when the library and core's vault exist (after
  step 4), and before the guides say the feature protects anything.
- **Until the audit, the feature is labelled as not yet audited**, in the guides and where an operator allows an app to use it.
- What a reviewer is asked, and where the design is least sure of itself, is in the [review brief](0005-review-brief.md).
- Who does each is the developer's to arrange. Programmes that fund audits of open-source software are worth asking; none has been
  approached.

## Settled in review

- **Argon2id's cost** is set by measurement against a rule, and a later change of it is designed (§1.4).
- **The recovery kit is letter groups**, not words (§1.2).
- **No preference for a prompt at each new browser session.** Signing out protects a shared computer, and it can be added later
  without changing anything stored.
- **Review in two parts**, the design and then the code (above).
- **The timing page is the first piece of step 1**, not built before this is accepted.
- **The reset page is given the account's address** by core when it is rendered (§2), settled after acceptance on 2026-11-16, over
  asking the person to type it or putting it in the link.
- **Argon2id is libsodium's** (`libsodium-wrappers-sumo`), decided with the goal owner on 2026-11-16 when no browser Argon2id was
  found to be fully audited: libsodium's C library was audited in 2017 with password hashing in scope, and its WebAssembly build was
  not. libsodium takes a 16-byte salt, so the salt is the first 16 bytes of its SHA-256 (§1.1). The reasons and sources are in the
  package's README.
- **The salt is made from an instance id, not the instance's address** (§1.1), settled after acceptance, on 2026-11-16: with the
  address, an instance that moved would have locked everyone out of their accounts and their data.
- **Step 2 is built before the design review, and step 3 is not.** Core never receiving a password is worth having at once, and
  what the review might change in it costs little: the number after `svp` names the whole derivation and not only its cost, so a
  derivation the review replaces is moved from at each person's next sign-in, as a change of cost is (§1.4), with no second reset.
  From step 3 keys and data are stored, and a format found wrong there is not so cheaply left.

## Decision requested

Accept the design, with steps 1 and 2 buildable now and step 3 onwards waiting on a cryptographer's review of this document.

**Accepted on 2026-11-16**, as written.
