# Research 0008 — Encrypting what apps keep so the server cannot read it

|                   |                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Recommended and accepted on 2026-11-16; the design is [RFC 0005](../rfcs/0005-end-to-end-encryption.md), accepted the same day                                                                                                                                                  |
| **Date**          | November 2026                                                                                                                                                                                                                                                                   |
| **Author**        | Claude Code                                                                                                                                                                                                                                                                     |
| **Scope**         | [core-app](../specs/core-app.md) §3.3.2, §3.4, §3.5, §3.9, §3.16, §4.6; [operator-cli](../specs/operator-cli.md) §9.4, §10; [sdk](../specs/sdk.md); `packages/crypto`, `packages/storage`; [research 0006](0006-data-at-rest.md); [RFC 0003](../rfcs/0003-apps-of-their-own.md) |
| **Versions read** | Platform 0.97.1, toolkit 0.14.0, better-auth and `@better-auth/passkey` 1.7.13                                                                                                                                                                                                  |

---

## Question

[Research 0006](0006-data-at-rest.md) found that nothing done on a server protects people's data from root on that server while it runs,
and left end-to-end encryption to research of its own. This is that research. How should what apps keep for people (documents, notes,
files) be encrypted so that someone who reads the server cannot read it, and so that an operator who tampers is, as far as possible,
found out, without making an operator's ordinary work hard? The answer must hold for three kinds of app:

- a Sovereign app **connected to core**;
- a Sovereign app **running with no core**, which must behave the same for the person using it ([RFC 0003](../rfcs/0003-apps-of-their-own.md));
- an app that is **not Sovereign's** and uses core only to sign people in.

## Method

- **Research 0006**, for what each reader of the server reads today and what core's own data needs.
- **The code:** the field cipher and its envelope (`packages/crypto/src/field-cipher.ts`, `keyring.ts`); how core signs people in
  (`apps/core/src/auth/auth.ts`: `emailAndPassword`, `policedHash`, `passkey`; `password-policy.ts`); core's content security policy
  (`apps/core/src/csp.ts`); how the file store judges a file (`packages/storage/src/types.ts`, `fs.ts`, `response.ts`).
- **`@better-auth/passkey` 1.7.13's source** (`dist/client.mjs` and its types), for whether a passkey can give a secret to the page.
- **How services that offer this to the public do it**, from what they publish: Proton's account of its sign-in and of recovery, and
  Bitwarden's security paper and its notes on unlocking with a passkey ([Sources](#sources)).
- **What browsers and devices support**, from MDN and a vendor's published tests ([Sources](#sources)).
- **The specs:** core-app §3.16 (what Phase 1 leaves out) and the toolkit's age keys (operator-cli §9.4, §10).
- **Two documents the developer brought:** a concept paper on keeping encrypted files in a Docker volume, and a technical specification
  for a zero-knowledge document store (a key per document, wrapped for each person who may read it). They are the proposal this research
  tests against Sovereign.

**Not done:** nothing was built or measured. What browsers and devices support was read, not tested on devices, and the fullest account
of passkey support is a vendor's (Corbado), not a standards body's. The version of Chrome that turned X25519 on was not confirmed. That
Proton passes a key from its account page to its apps was not confirmed from what it publishes. The passkey plugin's handling of the PRF
extension was read in its source and not run. No cryptographer has reviewed the recommendation; one should before the RFC is accepted.

## Findings

1. **The proposal's shape is right.** A fresh key for each document, the document encrypted with it, and that key wrapped once for each
   person who may read it: sharing is one more wrapped key and no re-upload. Its storage conclusion (ciphertext can live in a local
   volume) is what `@sovereignfs/storage` already does ([RFC 0004](../rfcs/0004-file-storage.md)).
2. **A key made from the sign-in password does not work as core signs people in today.**
   - Core receives the password in plain at every sign-in and hashes it on the server (`policedHash`). A server that sees the password
     can make the key from it.
   - A person who signs in with a passkey has typed no password (§3.4).
   - A password reset by email (`sendResetPassword`) would leave the person signed in and unable to read anything they own.
   - An app never sees the password at all: it gets a code from core.

   The services people know solve the first of these, and accept the third (finding 13).

3. **Core and each app are different origins.** A key unlocked on core's pages is not in the app's page, and a passkey belongs to core's
   `rpID`, so an app cannot ask the passkey for anything. How an app's page comes to hold a key is the central design problem, and the
   proposal does not have it.
4. **The server hands out the public keys.** A person's browser asks the server for a colleague's public key and believes the answer. A
   server that answers with its own key reads the next thing shared. Nothing in the proposal detects it.
5. **Deleting a wrapped key is not revocation.** Someone who already unwrapped a document's key may have kept it. The document needs a
   new key the next time it is written.
6. **The ciphertext is bound to nothing.** A server could return another document, or an older version, under the same id. The field
   cipher already avoids this for settings: its context is authenticated with the value (`field-cipher.ts`).
7. **Smaller points in the proposal.**
   - It offers X25519 or RSA-4096. A format names one.
   - One AES-GCM operation over a whole file holds the file in memory and has a size limit; files need to be encrypted in chunks.
   - It keeps the private key in session storage, which any script on the page can read. WebCrypto can hold a key that cannot be
     exported.
   - Argon2 is not in WebCrypto and needs WebAssembly, which core's policy does not allow (`script-src` in `csp.ts` has no
     `'wasm-unsafe-eval'`).
8. **What the server can no longer do with ciphertext.**
   - The file store judges a file's type from its first bytes and shows only raster images inline (`SNIFF_BYTES`, `types.ts`). Every
     encrypted file is `application/octet-stream`; the browser that decrypted it must decide how to show it, safely.
   - Search, previews and scanning on the server.
   - Helping someone by looking at their data.
   - A password reset that gives back access to data.
9. **What an operator's work keeps.** Accounts, roles, deactivation, quotas, backups (of ciphertext) and deletion are unchanged. Deletion
   gets stronger: removing a person's wrapped keys makes every copy of their data unreadable, backups included.
10. **A web app cannot be protected from the server that serves it.** The server sends the JavaScript that handles the keys. An operator,
    or an intruder with root, who changes that code gets the keys the next time someone unlocks. No encryption format prevents it; only
    a client that is not delivered by the server on each visit does (the native shells of §3.16, or a signed bundle).
11. **Core's own data stays outside this.** Core must read an address to send mail, a name to answer the Directory (§3.9) and a role to
    decide access (0006, finding 9). Research 0006's recommendation stands for it, unchanged.
12. **The toolkit already has the pattern escrow needs.** `sv backup` encrypts to the operators' age keys and not the server's, and
    `sv key recovery` makes a second key to keep offline (operator-cli §9.4, §10): the server holds a public key, the private half is
    somewhere else.
13. **One password can sign in and unlock, if it never leaves the browser.** This is what Proton and Bitwarden do, and why they feel
    like any other service: register once, keep a recovery key, and on a new device type the password.
    - The browser makes **two unrelated values** from the password. One proves who the person is; the server keeps only something to
      check it against. The other unlocks the person's key, which the server keeps encrypted and returns after sign-in.
    - Proton proves the password with the SRP protocol and makes the unlocking value with a salt the server supplies at sign-in.
      Bitwarden derives a key from the password, sends a further hash of it to sign in, and the server hashes that again.
    - **A password reset by email locks the data** in both, until the recovery phrase, a recovery file or the old password is given.
      It is a property of the method, not a fault of either.
    - Bitwarden's way suits core: the browser sends a derived value where it sends the password today, and better-auth goes on hashing
      what it receives. SRP would replace better-auth's password sign-in.
14. **The price is that the server can no longer judge the password.** `policedHash` checks the policy where the hash is made (§3.3.2),
    which is a hard rule today (AGENTS.md); a derived value has no length or character classes to check. The policy
    (`passwordProblems`) can only run in the browser. Everything that asks for the password again (`confirmPassword`), sets one
    (sign-up, reset, change) or makes an account with one (`sovereign-admin`, the seed) must derive it the same way.
15. **A passkey can unlock too, and the plugin core uses already allows it.** `@better-auth/passkey`'s client takes WebAuthn
    `extensions` for both ceremonies, **removes the extensions' results before it sends the answer to the server**, and returns them to
    the page when asked (`returnWebAuthnResponse`). So the PRF extension's secret reaches core's page and never core's server, with no
    change to the plugin.
    - **Passkeys people already have mostly work.** iCloud Keychain and Google Password Manager answer PRF for a passkey made without
      asking for it; some security keys do not, and would need to be added again.
    - **Support is wide and uneven:** iOS and macOS from 18 and 15 (18.4 for use across devices), Android, Windows 11 from its February
      2026 update, Firefox from 139 on macOS and 148 on Windows. Security keys in Safari are unreliable.
    - **A co-editor of the WebAuthn specification warns against a passkey being the only way to data:** people delete passkeys without
      knowing what they protect. His advice is the design here: the passkey wraps a key that other things wrap too, its output goes
      through a key derivation with a stated purpose, and no salt is shared between people.
    - **The password is never removed** (§3.4), so every account has the password as its other way.
16. **WebCrypto has what the rest needs, except the password derivation.** X25519 and Ed25519 are in Firefox (130), Safari (17 for
    Ed25519; X25519 from early 2025) and Chrome. Its only derivation for passwords is PBKDF2; Argon2id needs WebAssembly (finding 7).

## Who is stopped by what

| Level                           | What it adds                                                           | A copy of the disk | A reader of the running server | A server that swaps keys or files | A server that serves altered code |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------ | ------------------------------ | --------------------------------- | --------------------------------- |
| 0. Disk encryption (0006 A, B)  | The disk is unreadable when the server is off                          | stopped            | reads everything               | n/a                               | n/a                               |
| 1. Sealed mode (0006 C)         | The secrets are not on the disk                                        | stopped            | reads everything               | n/a                               | n/a                               |
| 2. End-to-end, against readers  | Keys exist only in people's browsers                                   | stopped            | stopped                        | succeeds, unseen                  | succeeds                          |
| 3. End-to-end, against swapping | A signing key per person, remembered keys, ciphertext bound to its id  | stopped            | stopped                        | detected                          | succeeds                          |
| Beyond 3                        | A client the server does not deliver on each visit (native, or signed) | stopped            | stopped                        | detected                          | stopped                           |

"A reader of the running server" is an intruder who dumps the database, the hosting provider through a snapshot or the hypervisor, a
backup, and an operator who looks but changes nothing.

## Options

- **A. Readers only (level 2).** The proposal, corrected for findings 2, 3 and 7. The simplest format. Swapped keys and swapped files
  stay invisible (findings 4, 6), and closing them later changes the format of every stored key and document, a migration only people's
  browsers can do.
- **B. Build for level 3, promise level 2.** The format carries a signing key for each person, each browser remembers the keys it has
  seen, and each ciphertext is bound to its document and version, from the first version. What operators and people are told is only that
  the data is safe from anyone who reads the server. The promise rises, with no change to stored data, when a client that closes finding
  10 exists.
- **C. Level 3 complete before anything ships.** Wait for the screens on which people compare key fingerprints and for a native or signed
  client. The strongest promise and the longest wait, for a gap that readers-only protection does not have.

And, for where a person's keys are kept:

- **V1. Only in core.** One unlock for every app, but an app with no core has no encryption: against RFC 0003.
- **V2. Only in each app.** Core stays identity alone, but a person has an unlock, a recovery kit and an escrow for every app.
- **V3. One model, two homes.** The library is the same; an app with no core keeps its people's wrapped keys itself, and a connected app
  uses core's vault.

## Recommendation: B with V3

### 1. The model lives in a library, and core is one home for it

`@sovereignfs/crypto` gains a browser side: the keys, the formats, the recovery kit and escrow. It talks to a **vault**, which stores
only wrapped keys and public keys, through one interface with two implementations, as `@sovereignfs/storage` has `fs` and `s3`:

- **the app's own vault**, tables in the app's database, for an app with no core;
- **core's vault**, a new part of the Core API, for a connected app.

An app that only signs in through core, Sovereign's or not, is unaffected: nothing about keys is in an ID token, an access token or the
userinfo answer. Keys are reached only through the vault's own endpoints, which an app must be allowed to call.

### 2. Keys

| Key                | Made                                                     | Kept                                                        | For                                                    |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Account key        | at random, in the person's browser                       | in the vault, wrapped once for each way to unlock           | the root; never leaves the origin that unlocked        |
| Ways to unlock     | the password, each passkey (PRF), the kit, escrow        | each wraps the account key                                  | changing one re-wraps the key; no data is re-encrypted |
| App key            | at random, the first time a person uses the app          | in the vault, wrapped by the account key                    | everything one app encrypts for one person             |
| Identity key pairs | at random, with the app key: one to sign, one to receive | private halves wrapped by the app key; public halves signed | sharing between people                                 |
| Document key       | at random, for each document and each re-key             | wrapped for each reader, beside the document                | the document, in chunks                                |

- **The account key is random**, so changing a password or a passkey re-wraps one key and re-encrypts nothing.
- **An app receives its own key, never the account key**, so an app that is compromised exposes that app's data only, and no app sees the
  kit or the escrow key.
- **An app key is random and stored wrapped, not derived from the account key.** It costs one stored key for each person and app. In
  return an app key can be replaced, and an app that ran alone and is then connected to core moves by re-wrapping one key for each
  person, in their browser, with their identity keys and everything others remembered about them unchanged.
- **A reader is a person.** A document key is wrapped for people, one by one; the wrapped key's record says what kind of reader it is
  for, so a group can be added later.
- **One algorithm for each job**, named in a versioned envelope read beside `sv1:` (the field cipher's), so a later one, a post-quantum
  key wrap among them, can be added without ambiguity. Which algorithms is the RFC's to settle, with review.

### 3. Signing in unlocks

A person registers once, keeps the recovery kit, and from then on signs in as they do anywhere. Nothing about keys is shown until an
encrypted app is opened, and then only if something is missing.

- **The password never reaches the server, on any instance** (finding 13). The browser derives two values from it:
  - the **sign-in value**, sent where the password is sent today and hashed by better-auth as now, so a copy of the database still
    cannot sign in. Its salt is made from the address and the instance, so nothing is fetched before signing in and nothing tells
    whether an address has an account;
  - the **unlocking value**, which never leaves the browser and unwraps the account key. Its salt is random, kept with the wrapped
    key, and given only to someone who has signed in.

  One way of signing in for every instance, encrypted apps or none: two ways are twice as much to get wrong.

- **The derivation is Argon2id.** Someone with a copy of the database can guess passwords against the wrapped key at the derivation's
  cost and no other, so that cost is the protection. It needs `'wasm-unsafe-eval'` in core's `script-src` (finding 7); the parameters
  are the RFC's.
- **The password policy is checked in the browser**, and the rule that it is enforced where the hash is made is retired, with its
  reason, in the RFC (finding 14). The server still refuses a value that is not the derivation's shape.
- **Signing in with a passkey stays as it is**, and the same touch unlocks where the passkey answers PRF (finding 15): each passkey
  wraps the account key with its own secret. Where it does not, the person is asked for the password once on that device, when they
  first open an encrypted app. A passkey is added while unlocked, so that it can be given its wrap.
- **Changing the password** re-wraps the account key and replaces the sign-in value in one request. **Changing an address**, when
  core has that (§3.16), does the same, since the sign-in value's salt comes from the address; it asks for the password, as every
  sensitive action does.
- **A password reset by email gives back the account and not the data.** The password's wrap is gone with the old password; the data
  opens again with a passkey that unlocks, the recovery kit, or escrow. The same is true when an operator resets a password. It is
  said where it matters: when the kit is shown, on the reset page, and to the operator before they do it.
- **An app with no core** does the same at its own sign-in, with the same library. One whose sessions are someone else's (RFC 0003)
  has no password to derive from, and asks for a passphrase.
- **Accounts that exist are few.** No second way of signing in is kept for them: after a backup (`sv backup`), each sets its password
  again through the reset link, which stores the new sign-in value, and gets its kit then.

### 4. From core's page to an app's

- **Core's page unlocks, and gives each app its own key as part of signing in** (finding 3). The app's page makes a key pair for that
  one request and sends the public half with it; core's page encrypts the app's key to it. Only the page that asked can open the
  answer, so whatever carries it, the server included, learns nothing. Which app's key is given follows the app core already
  identified by its exact redirect address.
- **A person is never asked to type core's password into an app.** It would teach them to type it anywhere, and show the app the
  secret that unlocks everything.
- **The operator decides which apps may use encryption, and people are not asked app by app.** An app says so in its manifest and the
  operator allows it, as an app scope is given today. An app receives only its own key, so a question to each person would add a
  screen and no protection.
- **A browser stays unlocked until its session ends.** The account key, on core's origin, and an app's key, on the app's, are kept as
  keys the page can use and cannot copy out (WebCrypto keys that are not extractable, in IndexedDB), and are removed on signing out
  and when the session is found to have ended. Nothing is asked again on a reload or in a new tab. This is the first thing of a
  person's that core keeps in a browser beyond its cookie, and the spec will say so.
- **An app that cannot open something says so, one way.** `@sovereignfs/ui` gets a locked state: that the data is encrypted and the
  browser is not unlocked, with the way to core to unlock and back. An app never shows ciphertext and never shows nothing. Access that
  was taken away has its own words.
- **Core's passkey page marks the passkeys that unlock data** and warns before one is removed (finding 15).

### 5. Which apps

- It is opt-in for each app. It suits documents, notes and files; an app that must search or process on the server should not use it.
- **An encrypted app puts no content into what it sends through core.** Core keeps the text of notifications and activity entries in
  plain (0006, finding 1), so they say that a document was shared and never its name.
- An app that is not Sovereign's can use the vault too, if the operator allows it and it uses the library; nothing in it is ours alone.

### 6. Recovery

- **A recovery kit by default:** a key shown once, to print, which wraps the account key.
- **Escrow, if the instance turns it on:** the account key is also wrapped to an escrow public key. The private half is made and kept
  off the server, as the toolkit's recovery key is (finding 12). A person sees that escrow is on, and it is one of the recipients their
  browser remembers, so turning it on silently is a change the browser reports.
- **Apps reuse both without code of their own**, because kit and escrow wrap the account key and the account key wraps each app's. An app
  with no core runs the same library against its own vault, with an escrow key of its own instance.
- Stated plainly: whoever holds the escrow private key can read what it covers. It is for an organisation that must not lose a
  departed person's documents, not a default.

### 7. Against a server that lies

- Each person's public keys are **signed by their signing key**, and a browser **remembers** the keys it has seen for each person and
  warns when one changes.
- Each ciphertext is **bound to its document id and version**, and each wrapped key to its document and reader.
- **Revoking is removing the wrapped key and re-keying on the next write** (finding 5). What someone already read cannot be taken back,
  and the interface says so.
- **The key core's page gives an app is signed** by the person's signing key, so a server cannot put a key of its own in its place.

### 8. What is promised

Data an app encrypts this way cannot be read by anyone who reads the server, its disk or its backups, and core never receives a
password. It is **not** promised against an operator who changes the app's code or the sign-in page (finding 10); the guides say so in
those words, and the word "zero-knowledge" is not used.

### 9. Core's own data

Research 0006 stands: disk encryption, its three fixes, the sealed mode as an opt-in. Core's names, addresses and roles are readable by
whoever runs the instance.

## Not now

- Native or signed clients, and with them the higher promise.
- Screens for comparing key fingerprints; remembering keys is automatic and comes first.
- An escrow key split among several owners.
- A separate encryption passphrase for accounts in core; the password and passkeys cover them.
- SRP in place of better-auth's password sign-in.
- Groups or roles as readers: a shared key, and rules for joining and leaving, are a design of their own.
- The procedure for moving an app's vault into core's; the keys are shaped so that it is one re-wrap for each person.
- Telling credential managers that core's passkeys protect data (the `prfUsageDetails` proposal), until it is a standard.
- Post-quantum key wrapping; the envelope must leave room for it.
- Search over encrypted data on the server.
- Encrypting core's own columns (0006, option D).

## To settle in the RFC

What this research leaves is design, not direction, and [RFC 0005](../rfcs/0005-end-to-end-encryption.md) takes it up:

- **The algorithms and their parameters**, Argon2id's among them, and the envelope's layout.
- **The message that carries an app's key from core's page**, and its threat review: where it travels (with the redirect, or through
  the vault), how it is tied to the one sign-in, and what the app's page checks.
- **How a browser learns its session has ended**, so that it removes its keys when no page is open at the time.
- **The vault's endpoints** in `contracts/core-api/`, and the manifest's entry for an app that uses encryption.
- **A cryptographer's review** of all of it, before the RFC is accepted.

## Sources

- Proton, [how its sign-in keeps the password from the server](https://proton.me/news/encrypted-email-authentication) and
  [recovering data after a reset](https://proton.me/support/restoring-encrypted-calendar).
- Bitwarden, [security white paper](https://bitwarden.com/help/bitwarden-security-white-paper/) and
  [unlocking with a passkey's PRF](https://contributing.bitwarden.com/architecture/deep-dives/passkeys/implementations/relying-party/prf).
- Corbado, [passkeys and the PRF extension](https://www.corbado.com/blog/passkeys-prf-webauthn), for support by browser and device.
- [Do not use passkeys' PRF extension to derive encryption keys for data](https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk),
  reporting Tim Cappalli's advice.
- MDN, [`SubtleCrypto.deriveKey`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey); Igalia,
  [secure curves in the Web Cryptography API](https://blogs.igalia.com/jfernandez/2023/06/).

## Changelog

| Date       | Change                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | First version.                                                                                                                                                             |
| 2026-11-16 | The sign-in password unlocks, derived in the browser, in place of a separate passphrase; passkey and browser support checked (13–16).                                      |
| 2026-11-16 | The open points settled: core's page gives each app its key; unlocked until the session ends; app keys random and wrapped; readers are people; the operator allows an app. |
| 2026-11-16 | Accepted. The design it left is RFC 0005.                                                                                                                                  |
