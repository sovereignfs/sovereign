# Encrypting an app's data

For the author of a Sovereign app that keeps what people give it (documents, notes, files) so that nobody who reads the server, its disk
or its backups can read it. What is promised is [RFC 0005](rfcs/0005-end-to-end-encryption.md)'s, and no more; how core does its part is
core-app §5; what the SDK gives an app is sdk §9.3 to §9.5.

> **Not yet audited.** The design has not yet been reviewed by a cryptographer, and the code has not been audited. Until both have
> happened, an app says nothing that suggests its data is proven safe, and keeps the words "not yet audited" wherever it describes
> the feature.

## What it protects, and what it does not

- **It protects against someone who reads the server**: a copy of its disk, its database or a backup holds ciphertext, wrapped keys
  and public keys. A guessed password can be tried against a wrap, at the password derivation's cost (Argon2id).
- **It does not protect against whoever runs the server.** A web app's code comes from the server, so a server that sends changed code
  gets everything at the next unlock. Never write that the operator "cannot" read people's data, or that the server knows nothing
  about it.
- **The server still sees** who has keys for which app, who shares with whom, the sizes of things, and when they change.
- **A forgotten password, every passkey that unlocks and the recovery kit lost together lose the data for good**, unless the owner
  turned recovery (escrow) on, in which case the owner can open everyone's data. Both are said to people by core; an app that runs
  with no core says it itself.

## Which shape is yours

- **Signing in through core** (the app template's shape). The operator allows the app to use encryption: the manifest's `encryption`
  (manifest 4) names the key return address, and `sv app add` registers it. The page gets the app's key from core once each browser
  session, with `appKeys` from `@sovereignfs/sdk/keys` (sdk §9.3), and shares with other people of the instance through core's `keys`
  calls (sdk §9.4). Passkeys that unlock, the recovery kit and escrow are core's, and work for every encrypted app.
- **With no core.** The app keeps the keys in a vault of its own (sdk §9.5): see [Building an app](building-an-app.md), "People's
  data, encrypted, with no core". It unlocks at the app's own sign-in, or with a passphrase when its sign-in is another provider's,
  and offers the kit. Passkeys that unlock, escrow and sharing need core.

## In the page

1. **The key.** `open()` gives the app key, or `{ state: 'locked' }`. Locked, show `LockedState` from `@sovereignfs/ui`, with
   `unlock()` (core) or a request for the password or passphrase (no core) as its action. Never show ciphertext.
2. **A document key for each document.** `newDocumentKey()` makes 32 random bytes. Seal it to each reader, the writer included, with
   `share({ documentKey, documentId, to, identity })`, after `checkPerson` has checked the reader's keys; keep the sealed records
   beside the document. Overwrite the bytes once used.
3. **The content.** `importDocumentKey(documentKey)` gives the content key. `encryptContent(contentKey, { documentId, version },
stream)` encrypts the document in 64 KiB chunks, as a stream; `encryptBytes` encrypts a small value whole. Encrypt the name, type
   and size a person sees as one small value too, under its own id: the server stores `application/octet-stream` and a length.
4. **Reading back.** `openShared` checks the sharer's signature, then opens the sealed key; `decryptContent` gives the document a
   chunk at a time and refuses a blob read under another id or version, or cut short. Which version is current is the app's to know.
5. **A changed key.** `checkPerson` refuses a person whose account signing key changed (`changed`) until the person using the app
   says to go on (`trustChanged`). Say what it means: the server, or that person, has new keys.

## The rules an encrypted app keeps (RFC 0005 §8)

- **Nothing of a document goes into a notification, an activity entry or mail** sent through core. Core keeps their text. Say "Ana
  shared a document with you", never its title or a line of it.
- **Never show ciphertext.** Where this browser cannot open something, show `LockedState`.
- **Removing a reader** removes their sealed document key, and makes a new document key at the next write, sealed only to those who
  remain. Tell the person that what the removed reader already read cannot be taken back.
- **Deleting a person** deletes their sealed document keys when the app is told their account was deleted, as it deletes their files
  (`handleAccountDeleted`, or `vault.deleteAccount` with no core).

## On the server

- It stores what the page sends, and opens nothing. It has no key, and never asks for one.
- Logs, errors and analytics never carry a document, its name or its type: the server has only ciphertext, so the rule is that it
  never decrypts anything to "help".
- The pages that unlock need `'wasm-unsafe-eval'` in `script-src` only with no core (the password derivation is WebAssembly); never
  `'unsafe-eval'` or `'unsafe-inline'`.

## Testing it

Check what your database and stored files hold after a test run, as core's own acceptance does (core-app §5.10.8): write a document
whose text, name and type carry a random marker, then look for the marker, in plain text, base64 and hex, in every row of every
table and in every stored file. Finding none is the test.
