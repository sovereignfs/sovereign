---
rfc: 0061
title: Sovereign Wallet platform plugin
status: Draft
date: July 2026
author: kasunben
scope: plugins/wallet, packages/sdk, runtime, docs; depends on RFC 0060 and RFC 0044
incorporated_into_plan: 'Yes - epic tasks 21.1-21.4'
---

## Summary

Add Sovereign Wallet as a first-party platform plugin for storing QR/barcode
loyalty cards and encrypted snapshots of sensitive personal documents such as
IDs and passports.

Wallet is intentionally conservative in phase 1. It is not a payment wallet,
credential issuer, passkey store, or government-ID verification system. It is a
private personal vault for cards and document images, built on Sovereign's core
client-side encryption capability.

## Motivation

Users often need a simple place to keep loyalty cards and reference images of
important documents. These are useful on mobile and desktop, but document images
are highly sensitive. Storing them as plaintext files or Base64 blobs in the DB
would contradict Sovereign's privacy posture.

Wallet provides a concrete product use case for RFC 0060. It should prove that
Sovereign can support operator-unreadable plugin data through a reusable core
surface rather than plugin-specific crypto.

## Current state

- RFC 0060 defines the core client-side encryption model this plugin depends on.
- RFC 0044 defines plugin file storage and backend-neutral binary object
  storage.
- RFC 0052 defines plugin portability hooks for export/import/delete.
- Mobile app planning exists in RFC 0058, but Wallet must work in the web/PWA
  runtime first.

## Proposed design

### Data classes

Wallet supports two item classes in phase 1:

| Class              | Examples                         | Storage default                        |
| ------------------ | -------------------------------- | -------------------------------------- |
| Loyalty card       | QR code, barcode, membership ID  | private record; encryption recommended |
| Sensitive document | passport photo, ID photo, permit | client-side encrypted object required  |

The plugin should bias toward encryption for all user-created wallet items, but
sensitive document snapshots must always use client-side encryption.

### Loyalty cards

Wallet stores:

- display name;
- card issuer;
- QR/barcode payload;
- barcode type where known;
- optional front/back card image;
- notes.

The card screen renders the QR/barcode locally in the browser. If the payload is
encrypted, the user must unlock Wallet before rendering.

### Sensitive document snapshots

Document images are encrypted in the browser before upload:

```text
Browser selects image
  -> optional client-side normalization/compression
  -> encrypt binary bytes with per-object DEK
  -> upload ciphertext through sdk.storage
  -> store encrypted metadata and wrapped DEK references
```

The server stores no plaintext image, no plaintext original filename, and no
plaintext human-readable document metadata unless the user explicitly chooses a
non-sensitive hint.

Display flow:

```text
User opens Wallet
  -> Wallet sees encrypted item
  -> user unlocks client-side encryption profile
  -> plugin downloads ciphertext
  -> browser decrypts bytes
  -> browser renders Blob URL in <img>
```

No decrypted image is sent back to the runtime.

### Metadata minimization

Plaintext metadata should be minimal:

- item ID;
- owner user ID;
- created/updated timestamps;
- storage object key;
- encryption version;
- optional coarse `kind_hint` such as `card` or `document`.

Encrypted metadata includes:

- title;
- issuer;
- document type;
- country;
- document/card number;
- original filename;
- notes;
- thumbnail metadata.

### Recovery UX

Wallet must explain that encrypted documents cannot be recovered after password
reset unless the user has a recovery secret or another enrolled device. Wallet
should not allow sensitive-document upload until client-side encryption setup is
complete.

### Export, import, and deletion

Wallet participates in RFC 0052 portability hooks:

- export includes encrypted metadata, wrapped keys, and ciphertext objects;
- import preserves ciphertext and remaps storage object IDs;
- delete removes plugin rows, encrypted metadata, wrapped keys, and storage
  objects;
- export never includes decrypted document bytes unless a future explicit
  plaintext export option is designed.

## Non-goals

- payment cards or payment processing;
- Apple Wallet / Google Wallet pass generation;
- government ID verification;
- OCR/search of document contents;
- server-side thumbnails for encrypted documents;
- sharing encrypted wallet items with other users;
- operator escrow of recovery material.

## Alternatives considered

### Store images as encrypted Base64 in the database

Rejected. It wastes space and makes DB backup/migration heavier. Encrypted
binary objects belong in plugin storage; DB rows hold metadata and references.

### Implement Wallet crypto inside the plugin

Rejected. Wallet should consume the core client-side encryption surface. One-off
crypto would be hard to audit and would not help future sensitive plugins.

### Server-side encryption only

Rejected for sensitive documents. Server-side encryption protects disk/backups
but not a compromised operator or runtime.

## Open questions

1. Whether loyalty cards are encrypted by default or only when the user enables
   Wallet lock.
2. QR/barcode rendering library and supported formats.
3. Whether client-side image compression is in phase 1.
4. Whether a mobile-optimized scan/import flow waits for the native mobile app.
5. Whether Wallet should support a plaintext emergency export mode, and how to
   warn users if it does.

## Adoption path

1. Build RFC 0060 core client-side encryption.
2. Scaffold `plugins/wallet` as a first-party platform plugin.
3. Add loyalty card CRUD and QR/barcode rendering.
4. Add encrypted document snapshot storage and display.
5. Add export/import/delete hooks.
6. Add mobile/PWA ergonomics and later native-mobile capture integration.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
