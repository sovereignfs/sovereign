# Epic 21: Sovereign Wallet

> First-party platform plugin for QR/barcode loyalty cards and encrypted
> snapshots of sensitive personal documents.

## Status

📋 Planned

## Overview

Sovereign Wallet is the first consumer of the platform's client-side encryption
model. It lets users store QR/barcode loyalty cards and snapshots of sensitive
documents such as IDs and passports. Sensitive document bytes and human-readable
metadata are encrypted in the browser before upload, so the runtime and operator
cannot read them.

Wallet is a platform plugin, not a generic payment wallet. Phase 1 deliberately
excludes payment cards, government verification, Apple/Google Wallet pass
generation, server-side OCR, and sharing.

## Tasks

#### 📋 21.1 — Sovereign Wallet scaffold (RFC 0061)

**Goal:** Create the first-party Wallet platform plugin with routing, manifest,
navigation, empty states, and data model scaffolding.

**Deliverables:**

- `plugins/wallet` platform plugin scaffold.
- Manifest identity, icon, permissions, and shell placement.
- Wallet home view with empty state and item categories.
- Plugin DB schema/migrations for wallet items and encrypted object references.
- Navigation and basic responsive layout using `@sovereignfs/ui` primitives.
- Documentation describing Wallet scope and non-goals.

**Dependencies:** Plugin runtime, design-system primitives, RFC 0061.

**SRS reference:** RFC 0061.

**Review checklist:**

- Wallet appears as an installed platform app.
- Empty state renders on desktop and mobile viewports.
- Plugin schema is user-scoped and migration-backed.
- No sensitive document upload is available before client-side encryption exists.

#### 📋 21.2 — Loyalty card storage and QR/barcode rendering

**Goal:** Let users create, view, edit, and delete QR/barcode loyalty cards.

**Deliverables:**

- CRUD for loyalty card records.
- QR/barcode payload, issuer, display name, notes, and format metadata.
- Browser-side QR/barcode rendering.
- Optional front/back card image support when plugin storage is available.
- Locked-state path if the card payload is encrypted.

**Dependencies:** Task 21.1; Task 8.7 for image storage if card images are in
scope.

**SRS reference:** RFC 0061.

**Review checklist:**

- User can add and display a QR/barcode card.
- User can edit and delete a card.
- Card data is user-scoped.
- QR/barcode rendering does not send payloads to an external service.

#### 📋 21.3 — Encrypted document snapshots

**Goal:** Add client-side encrypted document snapshot storage and display for
sensitive images such as passports and IDs.

**Deliverables:**

- Sensitive document upload gated on RFC 0060 client-side encryption setup.
- Browser-side binary encryption before upload.
- Ciphertext stored through `sdk.storage`; plaintext image bytes never reach the
  runtime.
- Human-readable document metadata stored encrypted.
- Browser-side decrypt-and-display flow using Blob URLs.
- Locked/recovery UX explaining data-loss implications.

**Dependencies:** Task 8.9 (client-side encryption core), Task 8.7 (plugin file
storage), Task 21.1.

**SRS reference:** RFC 0060, RFC 0061.

**Review checklist:**

- Uploaded document images are ciphertext at rest and in storage.
- Runtime route handlers never receive plaintext document bytes.
- User can unlock, decrypt, and view a document in the browser.
- Password reset/recovery limitations are visible before upload.
- Deleting a document removes metadata, wrapped keys, and storage objects.

#### 📋 21.4 — Wallet portability and deletion hooks

**Goal:** Integrate Wallet with platform export/import/delete flows without
leaking plaintext encrypted data.

**Deliverables:**

- RFC 0052 export hook for wallet records, encrypted metadata, wrapped keys, and
  ciphertext storage objects.
- Import hook that remaps object IDs and preserves encrypted payloads.
- Delete hook that removes wallet rows, wrapped keys, and storage objects
  idempotently.
- Documentation for encrypted export behavior and recovery requirements.

**Dependencies:** Task 8.8 (plugin portability hooks), Task 21.2, Task 21.3.

**SRS reference:** RFC 0052, RFC 0061.

**Review checklist:**

- Export contains no plaintext document images or decrypted sensitive metadata.
- Import restores encrypted items and remaps storage references.
- User deletion removes all Wallet-owned rows and objects.
- Delete hook is idempotent.

## Related RFCs

- [RFC 0061 — Sovereign Wallet platform plugin](../rfcs/0061-sovereign-wallet.md)
- [RFC 0060 — Client-side encryption core](../rfcs/0060-client-side-encryption-core.md)
- [RFC 0044 — Plugin file storage](../rfcs/0044-plugin-storage.md)
- [RFC 0052 — Plugin portability hooks](../rfcs/0052-plugin-portability-hooks.md)
- [RFC 0058 — Native mobile app shell](../rfcs/0058-native-mobile-app-shell.md)

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [security.md](../security.md)

## Cross-references

- Epic 8 (Data Sovereignty) owns the core client-side encryption and storage
  primitives.
- Epic 20 (Mobile App Shell) may later provide native camera/photo picker
  ergonomics for Wallet.
