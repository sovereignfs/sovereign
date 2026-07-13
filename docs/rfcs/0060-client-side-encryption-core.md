---
rfc: 0060
title: Client-side encryption core
status: Implemented
date: July 2026
author: kasunben
scope: packages/sdk, packages/manifest, runtime, packages/db, docs; builds on RFC 0008, RFC 0044, RFC 0052
incorporated_into_plan: 'Yes - epic task 8.9'
---

## Summary

Define a core client-side encryption capability for Sovereign so plugins can
store sensitive user data that the runtime, operator, and server-side plugin code
cannot decrypt. The first motivating consumer is Sovereign Wallet, but the
capability is platform-level: any approved plugin should be able to use the same
key-management and encrypted-object patterns.

This RFC makes Tier 4 from RFC 0008 concrete. Server-held at-rest and
field-level encryption remain useful, but they do not protect against a
compromised operator or server process. Client-side encryption does: plaintext is
encrypted in the browser before upload and decrypted in the browser after
download.

## Motivation

Some Sovereign data is too sensitive for a server-readable model. Passport and
ID-document images, recovery codes, high-value personal records, and similar
assets should remain private even if an operator account, VPS snapshot, database,
or runtime process is compromised.

The wrong implementation path is for each plugin to invent its own crypto. That
would create inconsistent recovery behavior, weak metadata practices, and
plugin-specific APIs that are hard to audit. Sovereign should provide one core
client-side encryption model and make sensitive plugins consume it through a
stable SDK boundary.

## Threat model

In scope:

- compromised or curious operator;
- compromised server process or runtime route;
- leaked database dump;
- leaked storage volume or object-store bucket;
- leaked backup/export bundle;
- compromised server-side plugin code.

Out of scope for this RFC:

- compromised client device after unlock;
- malicious browser extensions reading the page;
- phishing that captures the user's recovery secret;
- server-side indexing, OCR, thumbnailing, or email rendering of encrypted
  plaintext.

Client-side encryption changes the product contract. If the user loses every
enrolled device and their recovery secret, encrypted data is unrecoverable.

## Current state

- RFC 0008 charts zero-knowledge/E2EE as Tier 4, but does not specify the API or
  key model.
- RFC 0044 defines plugin file storage and says bytes can live outside the DB.
- RFC 0052 defines portability hooks that can include storage objects.
- `sdk.crypto` is reserved for server-side field encryption, where the runtime
  can decrypt.
- No core SDK surface exists for client-side encryption.

## Proposed design

### Separate server-side crypto from client-side crypto

Sovereign should keep two distinct concepts:

| Capability               | Runtime can decrypt? | Primary purpose                               |
| ------------------------ | -------------------- | --------------------------------------------- |
| Server-side field crypto | Yes                  | Protect disk/backups; runtime-mediated fields |
| Client-side encryption   | No                   | Protect data from operator/server compromise  |

The SDK names must make this distinction obvious. The exact final shape is an
implementation decision, but this RFC assumes a separate client-side namespace
such as:

```ts
sdk.crypto.client;
```

or an equivalent `sdk.e2ee` surface. It must not be confused with
`sdk.crypto.encryptField()`, which is server-mediated field encryption from RFC 0008.

### Key hierarchy

Each user has a client-side encryption profile:

```text
Recovery secret / enrolled device secret
  -> unlocks Client Master Key (CMK)
       -> wraps Data Encryption Keys (DEKs)
            -> encrypt objects and encrypted metadata
```

Recommended primitives:

- random 256-bit Client Master Key generated in the browser;
- random per-object DEK for each encrypted object or document;
- AES-GCM for content encryption using WebCrypto;
- HKDF for contextual subkeys where needed;
- Argon2id or PBKDF2-derived key only for recovery-secret wrapping, depending
  on browser/runtime support and implementation constraints;
- explicit algorithm/version metadata stored with each encrypted object.

The server stores only wrapped keys, ciphertext, non-sensitive routing metadata,
and audit/export/deletion metadata. The server never receives plaintext CMKs,
DEKs, document bytes, or decrypted metadata.

### Recovery and device enrollment

Phase 1 supports two recovery paths:

1. **Recovery secret:** user records a generated recovery phrase or passphrase
   during encryption setup. The recovery secret wraps the CMK.
2. **Device enrollment:** an already-unlocked device can enroll another device by
   wrapping the CMK for the new device.

Operator escrow is rejected as a default because the threat model assumes
operators can be compromised. A future enterprise policy may add escrow as an
explicit, visible, opt-in mode, but it must not be the default.

Password reset does not recover client-side encrypted data. The UX must state
this plainly before enabling encryption.

### Encrypted objects

Large encrypted payloads should be stored as binary ciphertext through
`sdk.storage` or the storage backend from RFC 0044. Do not Base64-encode images
for DB storage by default.

Metadata is split:

- **plaintext routing metadata:** object ID, owner user ID, plugin ID, storage
  key, created/updated timestamps, encryption version;
- **encrypted metadata:** human-readable title, document type, loyalty card
  name, issuing country, document number, original filename, notes, thumbnail
  metadata.

Plugins may keep a small plaintext `kind_hint` only when it is essential for
navigation, such as `card` versus `document`. Sensitive values should default to
encrypted metadata.

### SDK responsibilities

The client-side crypto SDK should provide helpers for:

- checking whether encryption is set up for the current user;
- creating a new encryption profile;
- unlocking the CMK with a recovery secret or device key;
- wrapping/unwrapping object DEKs;
- encrypting/decrypting `Blob`, `ArrayBuffer`, and JSON metadata;
- returning normalized unsupported/locked/error states;
- exposing algorithm/version metadata for portability.

The SDK should not hide the recovery model. Plugins must be able to detect
locked state and show UX that asks the user to unlock encrypted data.

### Platform responsibilities

The platform owns:

- encrypted profile metadata tables;
- wrapped CMK and device enrollment records;
- optional recovery-secret wrapper metadata;
- storage of encrypted object metadata needed for export/delete;
- manifest permission and capability gating;
- Account UX for setup, recovery warning, device enrollment, and recovery-secret
  rotation where appropriate.

The platform does not own plugin-specific plaintext fields. Plugins decide what
to encrypt, but the SDK makes the safe path straightforward.

### Plugin responsibilities

Plugins using client-side encryption must:

- encrypt sensitive bytes and sensitive metadata before upload;
- avoid sending plaintext to server actions, route handlers, logs, or analytics;
- treat server-side processing of encrypted data as impossible unless the user
  explicitly decrypts locally;
- implement locked-state UX;
- participate in export/delete through RFC 0052 hooks;
- document recovery implications.

## Wallet as first consumer

Sovereign Wallet should be the first real consumer of this core capability. It
has a clear need: ID/passport images and sensitive card metadata should not be
readable by the operator or runtime.

Wallet must not implement a one-off crypto system. If the core client-side
encryption model is not ready, Wallet can ship only non-sensitive private cards
or must remain blocked for sensitive documents.

## Alternatives considered

### Core user keypair in the platform user model

Deferred. A public/private keypair is useful for sharing, multi-device key
wrapping, and recovery contacts, but it is not required for single-user encrypted
objects. Starting with a symmetric CMK plus device/recovery wrappers is simpler.
A keypair can be added later without changing the object encryption model.

### Store encrypted Base64 images in the database

Rejected. Base64 adds size overhead and DB blobs make backup/migration behavior
heavier. Encrypted binary bytes belong in the storage backend; metadata belongs
in the DB.

### Plugin-owned custom encryption

Rejected. It is difficult to audit, gives inconsistent recovery UX, and creates
future migration debt when a platform E2EE surface lands.

### Operator escrow by default

Rejected. It contradicts the threat model. If operators can be compromised, they
must not hold default recovery material for client-side encrypted data.

## Open questions

1. Exact SDK namespace: `sdk.crypto.client`, `sdk.e2ee`, or another name.
2. Browser KDF choice and parameters for recovery-secret wrapping.
3. How to store device enrollment material across browsers and native shells.
4. Whether Account owns all setup/recovery UX or plugins can trigger scoped setup.
5. How much plaintext routing metadata is acceptable by default.
6. Whether sharing between users belongs in the first implementation or a later
   keypair-based phase.
7. How encrypted exports are packaged when the export bundle already has optional
   bundle encryption from RFC 0008.

## Adoption path

1. Add manifest permission/capability for client-side encryption use.
2. Add encrypted profile metadata tables and SDK types.
3. Add Account setup/unlock/recovery-secret UX.
4. Add SDK helpers for encrypting/decrypting binary payloads and JSON metadata.
5. Integrate with `sdk.storage` for encrypted binary object storage.
6. Add export/delete behavior through RFC 0052 hooks.
7. Build Sovereign Wallet on top of the core surface.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2     | July 2026 | Implemented (epic task 8.9), adoption steps 1–6: `sdk.e2ee` profile/recovery-wrapper/device-enrollment persistence, Account setup/unlock/recovery UX, CMK/DEK generation and wrap/unwrap, `Blob`/JSON object encryption (`e2ee-crypto`/`e2ee-object`/`e2ee-device`/`e2ee-state`), `sdk.storage` integration via its `metadata` field, and export/delete via `sdk.portability` (platform export includes wrapped ciphertext + metadata; account deletion removes it unconditionally). Step 7 (Wallet built on top of this core) is Sovereign Wallet's own separate roadmap, not part of this epic. |
| 0.1     | July 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
