---
rfc: 0044
title: Plugin file storage
status: Implemented
date: June 2026
author: kasunben
scope: packages/sdk, packages/db, runtime, packages/manifest, docs; builds on RFC 0007 and RFC 0008
incorporated_into_plan: 'Yes — epic task 8.7'
---

# RFC 0044 — Plugin File Storage

## Summary

Implement `sdk.storage` as a plugin-scoped file storage surface for user files,
generated assets, thumbnails, imports, exports, and other binary objects owned
by plugins.

The first version targets local filesystem storage under the Sovereign data
directory. The API is designed so an object-store backend can be added later
without changing plugin code.

Content delivery is part of the storage contract, but a CDN is not a required
platform dependency. Sovereign should ship with local storage plus runtime-served
authenticated and signed URLs first. Object storage and CDN fronting are
operator-selected optimizations behind the same SDK contract.

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

### Backend tiers

Storage backends are runtime/operator configuration, not plugin API choices.
Plugin code calls `sdk.storage`; the platform decides where bytes live and how
download URLs are produced.

| Tier   | Backend                                   | Purpose                                                  | Required |
| ------ | ----------------------------------------- | -------------------------------------------------------- | -------- |
| Tier 0 | Local filesystem under Sovereign data     | Default self-hosted storage; no external dependency      | Yes      |
| Tier 1 | Local filesystem plus reverse-proxy cache | Optional acceleration for static and signed responses    | No       |
| Tier 2 | S3-compatible object storage              | Larger deployments, multi-node runtime, external backups | No       |
| Tier 3 | CDN in front of runtime or object store   | Public/high-traffic assets and operator-managed caching  | No       |

S3-compatible means the API should be able to support AWS S3, MinIO, Cloudflare
R2, Backblaze B2 S3-compatible endpoints, and similar services without changing
plugin code. A later implementation may add a `STORAGE_BACKEND`-style runtime
setting, but this RFC does not require a specific env var name.

The default remains Tier 0. Sovereign must not require a CDN, object store, or
external account for core file storage.

### Serving files

Files are not public by default. Plugins should normally serve files through
their own authenticated route handlers after checking membership/ownership.

`getSignedUrl()` creates a short-lived, tokenized runtime URL for downloads or
previews. Signed URLs are read-only, expiry-bound, and scoped to one object.

Public permanent file hosting is out of scope for v1. Plugins that need public
pages should combine RFC 0042 public routes with explicit file authorization.

### Content delivery model

Storage objects fall into three serving classes:

| Class                 | Examples                                  | Serving path                                                | Cache default                         |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Private plugin files  | attachments, imports, generated documents | authenticated plugin route or short-lived signed URL        | `private, no-store` unless overridden |
| Public plugin content | published images, public documents        | explicit public plugin route plus authorization policy      | plugin/runtime controlled             |
| Build/static assets   | JS/CSS chunks, committed plugin icons     | existing Next/runtime static asset serving or reverse proxy | immutable where fingerprinted         |

The storage API should make private files easy and public files explicit. A file
stored through `sdk.storage.put()` is not public merely because it has a key or
content type. Public exposure requires either a plugin route that performs an
authorization decision or a future explicit public-object feature.

Signed URLs may be served by the runtime for the local backend or by an object
store for an object-storage backend. In both cases the URL must remain
expiry-bound, read-only, and scoped to one object. Clients must not be able to
extend expiry or widen access by editing URL parameters.

For private signed URLs, the runtime should default to conservative cache
headers. A CDN or reverse proxy may cache only when the response is explicitly
marked cacheable. For public assets, cache headers can be stronger, but cache
invalidation and revocation behavior must be documented before public permanent
hosting is added.

### CDN stance

A CDN is an operator optimization, not a Sovereign dependency.

Recommended posture:

- self-hosted default: runtime serves local files directly;
- production optimization: reverse proxy may cache immutable static assets and
  carefully marked public responses;
- scale-out option: S3-compatible object storage can hold bytes while the runtime
  keeps metadata and authorization decisions;
- high-traffic public content: operator may put a CDN in front of the object
  store or runtime route once cache headers and public/private boundaries are
  explicit.

The CDN must not become visible to plugins. Plugin code should not construct CDN
URLs or know whether an object is local, S3-backed, or CDN-fronted. If the
operator changes storage delivery, existing plugin data and plugin code should
continue to work.

Private objects are the hard case: CDN caching and access control conflict unless
the platform is explicit. Private files should use authenticated runtime routes
or short-lived signed URLs with conservative cache headers. Public objects may
use long-lived caching only after the plugin or platform declares them public.

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
- Signed URLs are scoped to one object, one operation, and a bounded expiry.
- Private signed URL responses use conservative cache headers by default.
- CDN or reverse-proxy caching must not make private objects public or extend
  access beyond the signed URL expiry.
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

### Require a CDN for plugin files

Rejected. A CDN is useful for high-traffic public content and geographically
distributed deployments, but requiring one would violate the self-hosted
zero-external-dependency default. The SDK should support CDN-friendly delivery
behind the runtime/backend boundary without making CDN configuration mandatory.

### Let plugins construct public file URLs directly

Rejected. Direct URL construction couples plugins to one storage backend and
makes public/private access difficult to audit. The runtime should issue signed
URLs or route requests through explicit plugin/public routes.

## Open questions

1. Should object encryption ship with the first storage implementation or follow
   RFC 0008 later?
2. Should signed URLs be valid without a session, or should they require both
   token and session by default?
3. What are the default quota values?
4. Should image resizing/thumbnailing be a storage feature or plugin-owned?
5. What cache headers should signed URLs use by default for previewable media?
6. Should public permanent objects be a first-class storage feature or remain a
   pattern built from RFC 0042 public routes?
7. Which S3-compatible providers should be tested in the first object-storage
   backend implementation?

## Adoption path

1. Add storage metadata tables and local backend.
2. Implement `sdk.storage` for server-side plugin code.
3. Add signed download route.
4. Integrate export/import/deletion.
5. Document direct-route serving patterns, signed URL cache headers, and quotas.
6. Add optional reverse-proxy guidance for immutable static assets and explicitly
   cacheable public responses.
7. Add an S3-compatible backend behind the same SDK contract.
8. Document CDN-fronted deployment as an operator optimization after public and
   private cache semantics are stable.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.3     | July 2026 | Implemented (epic task 8.7): `sdk.storage` put/get/delete/list/getSignedUrl backed by the Tier 0 local filesystem backend (`data/plugins/<pluginId>/storage/`), `plugin_storage_objects` metadata table, quota enforcement (`SOVEREIGN_STORAGE_MAX_OBJECT_BYTES`/`SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES`), a signed-download route (`/api/storage/[token]`, HMAC-signed, expiry-bound, `Cache-Control: private, no-store`, no session required), and user-deletion cleanup (row + physical file). Export/import interop needs no new mechanism — a plugin's `sdk.storage`-backed export already fits RFC 0007's existing `blobs` field on `PluginExportSection`. Deferred to future RFCs/tasks per the open questions below: object encryption, S3-compatible backend (Tier 2), CDN-fronted delivery (Tier 3), and image thumbnailing. |
| 0.2     | July 2026 | Added backend tiers, content delivery, and CDN stance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.1     | June 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
