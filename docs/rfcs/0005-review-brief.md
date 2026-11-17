# RFC 0005 — brief for a cryptographic design review

For the person asked to review [RFC 0005](0005-end-to-end-encryption.md). It says what is asked, what the design promises and does
not, where we are least sure, and what we would like back. It can be read without the rest of the repository.

## What is asked

A review of a **design document**. The goal owner chose to have the feature built before the review, so the review may be read
against the code as well; a finding that changes a stored format becomes a new suite beside the old. The library that makes every stored format is
`packages/crypto/src/web`, with tests and frozen vectors of each format.

- **To read:** RFC 0005 (about 380 lines). [Research 0008](../research/0008-end-to-end-encryption.md) explains why it is shaped as
  it is, and is optional.
- **Effort we have in mind:** three to five days.
- **The one thing we most need to know:** which findings change a **stored format or a derivation**, because those are cheap to fix
  now and expensive once people's data exists.

## What Sovereign is, in five lines

- An open-source, self-hosted sign-in server (**core**, an OpenID Connect provider) and a set of web apps that sign in through it.
- Whoever deploys an instance, the **operator**, has root on its server. An instance is typically one family, team or small company.
- Each app is its own web origin with its own server. An app may also run with no core at all.
- Everything is a web app today: the server delivers the JavaScript on each visit. Native clients are planned, not built.
- The design adds encryption in the browser, so that what an app stores for a person is unreadable on the server.

## What the design promises

Data an app encrypts this way cannot be read by someone who **reads** the server:

- a copy of the disk, the database or a backup;
- the hosting provider, through a snapshot or the hypervisor;
- an intruder or an operator who looks and changes nothing.

Beyond that promise, the stored formats are meant to **detect** a server that swaps a public key, a document or a version, so that
the promise can be raised later without changing what is stored.

## What it does not promise

- **A server that sends altered code.** It gets the keys at the next unlock. This is stated to operators and people, and the word
  "zero-knowledge" is not used. Please do not spend time on it, except to say if the design makes it worse than it must be.
- **Hiding metadata:** who has keys, who shares with whom, sizes and times.
- **Core's own data** (names, email addresses, roles), which core must read.
- **A weak password.** It is the person's key.

## The design in one page

- **Signing in (RFC §1.1, §2).** The browser runs Argon2id once over the password, with a salt made from a random id of the
  instance and the address. HKDF splits the result into a **sign-in value**, sent to the server in place of the password and hashed there again,
  and an **unlock key**, which stays in the browser.
- **Keys (§1.2, §3).** A random **account key** is wrapped once for each way in: the unlock key, each passkey (through the WebAuthn
  PRF extension), a printed recovery kit, and optionally an operator's escrow key. The account key wraps a random **app key** for
  each app. The app key wraps that app's two private keys (X25519 to receive, Ed25519 to sign). An account-level Ed25519 key signs
  each app's public keys.
- **Documents (§1.3).** A random key for each document, wrapped with HPKE to each reader, and the content encrypted with AES-256-GCM
  in chunks.
- **Key release (§4).** An app's page gets its app key from core's page by a top-level redirect there and back. The answer is sealed
  with HPKE to a one-use key the app's page made, signed by the account's signing key, and returned in the address fragment.
- **Staying unlocked (§5).** A key kept in the browser is wrapped by a device key that cannot be exported and by a secret the server
  holds for that session and deletes with it.

## Decided since the RFC was accepted

Each is recorded in the RFC under "Settled in review".

- **The salt** is made from a random id the instance publishes, not its address, so that an instance can move (§1.1).
- **The reset page is told the account's address** by core, since it holds only the token and the derivation needs the address.
- **Argon2id is libsodium's WebAssembly build** (`libsodium-wrappers-sumo`). No browser Argon2id was found to be fully audited:
  libsodium's C library was audited in 2017 with password hashing in scope, Argon2id reviewed as a diff; its WebAssembly build was
  not. libsodium fixes one lane and a **16-byte salt**, so the salt is the first 16 bytes of the RFC's SHA-256.
- **The Argon2id cost is 19 MiB and 3 passes**, about one second on an iPhone 15 Pro (64 MiB took 3.4 s).
- **The PRF input is one per instance, the salt one per passkey** (§1.2): a random input per passkey cannot be given to a
  discoverable sign-in.
- **The Argon2id output is held as a WebCrypto key that cannot be exported** until the unlock key is made, since the unlock key's
  salt is given only after signing in.

## Where we are least sure

In the order we would like them looked at.

1. **Key release (§4).** It is the newest part and has no precedent we could verify.
   - Is returning the sealed answer in the fragment sound, given that it is sealed to a one-use key?
   - Are the `info` and the checks in step 5 enough to stop a release being replayed, redirected to another app, or accepted by a
     page that did not ask?
   - The signature is checked against a signing key the app's page remembers from first use. On the first release a lying server is
     not caught, and a new browser starts again from nothing. Is there a better anchor that needs no screen for comparing
     fingerprints, such as keeping what was remembered encrypted in the vault?
     While building it we found that the request's public key is the asker's to choose, so a site sending a signed-in person to the
     release page gets an answer sealed to its own key, safe only while nothing on the app's page reads the fragment. Release is now
     silent only when the `Referer` is the app's origin, and asks otherwise. Is that enough, or should the page always ask?

2. **The password derivation (§1.1, §1.4).**
   - The server sees the sign-in value in memory, before it hashes it. Someone who reads that memory can guess passwords against it
     at Argon2id's cost alone, and a right guess gives the unlock key too. Is one Argon2id run with an HKDF split the right shape, or
     should the two values cost separately?
   - The salt is the same each time for an account: a random id the instance publishes, and the address. Nothing is asked about an
     address before signing in. The id is not the page's origin, so that an instance can move; that gives up what binding to the
     origin would add against a copy of the site. Is that the right trade?
   - Is the plan for changing the cost later (§1.4: send a value for each cost in use, in one request) sound?
3. **Versions and rollback (§1.3).** The header, with the document's id and version, is authenticated with every chunk. But a server
   can return an **older, valid** version, and the design does not say how a browser knows which version to expect. We think the
   claim "an older version does not open" is stronger than what is designed. What is the least that would make it true?
4. **AES-256-GCM everywhere (§1).** It was chosen because WebCrypto has it and can hold its keys so they cannot be exported.
   - It does not commit to its key. Does that matter where one key is wrapped for several ways in, or where a document key is
     wrapped for several readers?
   - Are random 96-bit nonces for wraps, and a counter with a fresh key for each blob, used safely?
5. **Sharing (§1.2, §3.1).** A document key is sealed with HPKE in base mode, and the record is signed separately by the person who
   shared it. Is that binding right, or should it be HPKE's authenticated mode, or something else? Can a reader pass on a share as
   if it came from the first person?
6. **What "cannot be exported" buys.** A WebCrypto key that cannot be exported cannot be copied out as an object, but any script on
   the page that can use it can decrypt what it wraps and so recover the bytes, and `unwrapKey` lets the caller choose `extractable`.
   We now state it that way (Security and privacy). Is there more the design should do about a script on the page, short of a
   client the server does not deliver?
7. **Staying unlocked (§5).** Does wrapping twice give what is claimed: nothing that opens once the session has ended, and nothing
   for the server alone?
8. **Passkeys (§1.2, §4 step 3).** One PRF input for every passkey of an instance, since a discoverable sign-in cannot be given one per
   passkey; the output through HKDF with a random salt for each passkey; and an unlock ceremony whose answer is checked nowhere but by
   whether the account key opens, with the page reading the user-verified flag itself. Does a public, shared input lose anything
   against a random one per passkey, given a page under the same relying party id can ask any passkey for its output?
9. **Escrow and the recovery kit (§1.2, §6).** Whether anything about them weakens an account that does not use escrow.
10. **What is missing.** The design has no way to replace an account key or a signing key after a compromise, and puts off
    post-quantum key wrapping, although wrapped document keys sit on a server for years. Which of these should not wait?

## What we would like back

- **Findings in order of severity**, each naming the RFC section.
- For each, **whether it changes a stored format or a derivation**, or can be fixed later without one.
- **Anything we did not ask about** that you would not ship.
- A short written report is enough. It will be published with the RFC unless you would rather it were not.

## Constraints worth knowing

- **Browsers only, for now**, and keys should be WebCrypto keys that cannot be exported wherever possible. That is why the choices
  lean on what WebCrypto has; Argon2id is the one exception, in WebAssembly.
- **Core's sign-in library is kept.** The server goes on hashing whatever it receives as the password, which is why the design sends
  a derived value where a protocol such as OPAQUE would replace the password sign-in.
- **Core's OpenID Connect provider is not changed**, so that apps which only sign in are unaffected. That is why key release is a
  step of its own.
- **We intend to write as little cryptography as possible** and to use audited implementations where they exist. Recommendations of
  which are welcome.

## After the review

A code audit follows when the library and core's vault are built, before the feature is described as protecting anything.
