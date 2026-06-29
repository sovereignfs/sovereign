---
rfc: 0044
title: Plugin file storage
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, packages/db, runtime, packages/manifest, docs; builds on RFC 0007 and RFC 0008
incorporated_into_plan: 'No — documentation-first. This RFC specifies a plugin file-storage surface; scheduling and task IDs are deferred.'
---

# RFC 0044 — Plugin File Storage

## Summary

Implement `sdk.storage` as a plugin-scoped file storage surface for user files,
generated assets, thumbnails, imports, exports, and other binary objects owned
by plugins.

The first version targets local filesystem storage under the Sovereign data
directory. The API is designed so an object-store backend can be added later
without changing plugin code.

## Motivation

Many plugins need files: images, attachments, generated documents, thumbnails,
imports, exports, cached previews, and media captured from the browser. Today
plugins either defer these features, store files in external systems, write
directly to ad hoc paths, or place files in domain-specific git repositories.

A platform storage surface gives plugins a consistent way to write and serve
files while preserving user deletion, export, access control, and future
encryption.

## Current state

- `sdk.storage` exists as a reserved surface that throws `NotImplementedError`.
- The platform has user data export/import and deletion mechanisms.
- Some runtime routes already serve specific files such as avatars and instance
  assets, but there is no general plugin file API.

## Proposed design

### SDK surface

```ts
interface StorageObject {
  id: string;
  pluginId: string;
  ownerUserId: string | null;
  key: string;
  contentType: string;
  size: number;
  checksum: string;
  createdAt: number;
  updatedAt: number;
}

sdk.storage.put(input: {
  key: string;
  body: Blob | ArrayBuffer | Uint8Array | ReadableStream;
  contentType: string;
  ownerUserId?: string;
  metadata?: unknown;
}): Promise<StorageObject>;

sdk.storage.get(key: string): Promise<StorageObject & { body: ReadableStream }>;
sdk.storage.delete(key: string): Promise<void>;
sdk.storage.list(prefix?: string): Promise<StorageObject[]>;
sdk.storage.getSignedUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string>;
```

The runtime injects the calling plugin ID. Keys are scoped under that plugin and
cannot escape through `../` path traversal.

### Storage layout

Local backend:

```text
data/plugins/<pluginId>/storage/<object-id>
```

Metadata lives in the platform DB:

```text
plugin_storage_objects
  id
  tenant_id
  plugin_id
  owner_user_id nullable
  key
  content_type
  size
  checksum
  metadata
  created_at
  updated_at
  deleted_at nullable
```

`key` is the plugin-facing logical path. The physical filename is an opaque ID.

### Serving files

Files are not public by default. Plugins should normally serve files through
their own authenticated route handlers after checking membership/ownership.

`getSignedUrl()` creates a short-lived, tokenized runtime URL for downloads or
previews. Signed URLs are read-only, expiry-bound, and scoped to one object.

Public permanent file hosting is out of scope for v1. Plugins that need public
pages should combine RFC 0042 public routes with explicit file authorization.

### Export, import, and deletion

Storage participates in user data portability:

- user-owned objects are included in export bundles when the plugin opts in;
- import remaps object IDs and keys if needed;
- user deletion hard-deletes objects where `owner_user_id` matches;
- shared objects require plugin-provided deletion policy.

The platform deletes metadata and physical objects together. Orphan repair can
be part of `sv doctor`.

### Quotas

The first version should support simple quotas:

- max object size;
- max total bytes per plugin;
- optional max total bytes per user per plugin.

Defaults are conservative and configurable by env or platform settings.

## Security requirements

- Path traversal is impossible because physical paths use opaque IDs.
- Content type is stored and served explicitly.
- Optional malware scanning is deferred but the API should allow future hooks.
- Signed URLs expire and cannot be extended by clients.
- Deleted objects become unavailable immediately.
- Object metadata must not leak cross-plugin data.

## Alternatives considered

### Let plugins write directly to `data/`

Rejected. It bypasses portability, deletion, quotas, and future backend changes.

### Require every plugin to store files in external systems

Rejected. Sovereign should support self-hosted local file storage by default.

### Store files as database blobs

Rejected for the default backend. It complicates backups and database parity for
large files. Metadata belongs in the DB; bytes belong in a storage backend.

## Open questions

1. Should object encryption ship with the first storage implementation or follow
   RFC 0008 later?
2. Should signed URLs be valid without a session, or should they require both
   token and session by default?
3. What are the default quota values?
4. Should image resizing/thumbnailing be a storage feature or plugin-owned?

## Adoption path

1. Add storage metadata tables and local backend.
2. Implement `sdk.storage` for server-side plugin code.
3. Add signed download route.
4. Integrate export/import/deletion.
5. Document direct-route serving patterns and quotas.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
