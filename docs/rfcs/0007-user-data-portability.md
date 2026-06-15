# RFC 0007 — User data export & portability

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** SDK (`packages/sdk`), manifest schema (`packages/manifest`), runtime, Account, reference plugins\
**Incorporated into plan:** Yes — SRS §3.16, §5 (`data:export` / `data:import`), and **Task 0.5.14**. The reserved `sdk.portability` surface + permissions and the export/import/cross-instance-migration mechanism land in that task (the reserved stub is applied there, after RFC 0005's SDK/manifest stubs).

---

## Summary

Give every user a **self-service "data takeout"**: export their own data to a
**versioned ZIP**, **restore/import** it (recovery on the same instance), and
**migrate** it to a different Sovereign instance. Plugins contribute their slice
of a user's data through a reserved `sdk.portability` participation surface;
the platform assembles, validates, and (on import) re-keys the bundle.

```ts
// a plugin opts into portability (reserved — throws NotImplementedError for now)
sdk.portability.provideExport(async (ctx) => collectMyRowsFor(ctx.userId));
sdk.portability.provideImport(async (section, ctx) => restoreMyRowsFor(section, ctx.userId));
```

This is **user-facing data ownership**, the flagship expression of the project's
name — and deliberately **distinct from RFC 0006** (operator/whole-instance
backup for disaster recovery and rollback).

## Motivation

Sovereign's premise is that users own their data, yet today there is **no way to
get it out**: no export, no portability, no migration path off an instance. That
is both a trust gap and, for many operators, a compliance one (GDPR-style data
portability / right to access).

The hard part is that a user's data is **scattered and heterogeneously owned**.
Platform tables key on `user_id`; avatars live on disk; plugin tables are
slug-prefixed and express ownership differently (`owner_id`, `created_by`,
`user_id`) with membership join tables for shared resources. There is **no
generic "select this user's rows"** — so a faithful export requires each plugin
to describe and produce its own slice. This RFC defines that participation model
and the bundle that carries the result.

No export/portability code exists yet — this is greenfield.

## Current state (what this builds on)

- **Reserved-surface pattern:** the SDK declares post-v1 surfaces as stubs that
  throw `NotImplementedError` (`packages/sdk/src/unimplemented.ts`,
  `packages/sdk/src/data.ts`), and the manifest permission enum reserves the
  matching capabilities (`packages/manifest/src/schema.ts`). This RFC reuses that
  pattern for `sdk.portability` + `data:export` / `data:import`.
- **Account self-service surface:** tabs (Profile / Preferences / Security) in
  `plugins/account/app/layout.tsx`, server actions in
  `plugins/account/app/actions.ts` — the natural home for a new **"Data"** tab.
- **Per-user data is scattered:** platform `users` / `account_prefs` (keyed by
  `user_id`) + avatars on disk at `data/avatars/<userId>.<ext>`; plugin tables
  carry `tenant_id` with varied ownership columns
  (`packages/db/src/schema/{sqlite,postgres}/platform.ts`; `docs/plugins/tasks.md`,
  `docs/plugins/splitify.md`).
- **File download/upload patterns to reuse:** the avatar routes
  (`runtime/app/api/account/avatar/[userId]/route.ts`,
  `runtime/app/api/account/avatar/route.ts`) — `Content-Disposition` attachment,
  MIME/size validation, owner gating via the `x-sovereign-user-id` header.
- **`sdk.db.getClient()`** returns the live Drizzle client for platform/account
  reads.
- **Related RFCs:** 0002 (`sdk.data` cross-plugin sharing — namespace
  relationship, see Open questions), 0004 (per-plugin DB — export must iterate
  per-plugin databases), 0005 (`sdk.activity` — audit export/import), 0006
  (operator backup — clearly delineated from this).

## Proposed design

All of this is **deferred** (specified for the post-acceptance task) except the
reserved stub noted under "Adoption path".

### 1. Plugin participation — reserved `sdk.portability`

A plugin opts into portability by registering an **export resolver** and an
**import handler**:

```ts
sdk.portability.provideExport(
  resolver: (ctx: ExportContext) => Promise<PluginExportSection>,
): void;

sdk.portability.provideImport(
  handler: (section: PluginExportSection, ctx: ImportContext) => Promise<void>,
): void;
```

```ts
interface ExportContext {
  userId: string;
  tenantId: string;
}
interface ImportContext {
  userId: string;
  tenantId: string;
  /** Maps an id from the source bundle to the id minted on this instance. */
  remapId(originalId: string): string;
}
interface PluginExportSection {
  pluginId: string;
  /** The plugin's own data-format version (for forward/backward compatibility). */
  schemaVersion: number;
  /** Plugin-defined JSON payload (rows, references). */
  data: unknown;
  /** Optional binary attachments, keyed by relative path within the section. */
  blobs?: Record<string, Uint8Array>;
}
```

**Runtime-mediated.** The runtime supplies `ctx.userId` / `ctx.tenantId`; a
plugin only ever reads or writes the **current user's own slice** and cannot
reach another user's data, another plugin's data, or another tenant. This
mirrors RFC 0002's resolver model (`sdk.data.provide`) but for portability rather
than consent-gated cross-plugin reads.

### 2. Bundle format — versioned ZIP

```
export.zip
├── manifest.json          # formatVersion, exportedAt, source instance + platform version,
│                          # subject user (minimal identity), and per-section
│                          # { pluginId, schemaVersion, checksum }
├── platform/
│   ├── account.json       # profile (name, email), preferences (timezone, theme)
│   └── avatar.<ext>        # the avatar file, if any
└── plugins/
    └── <pluginId>/
        ├── data.json       # the plugin's PluginExportSection.data
        └── blobs/...        # the plugin's PluginExportSection.blobs
```

`formatVersion` gates overall compatibility; each section's `schemaVersion` gates
that plugin's payload. Checksums detect tampering/corruption.

### 3. Export flow

User triggers export from the Account **"Data"** tab → the runtime collects
platform/account data, then invokes each **installed, opted-in** plugin's export
resolver (scoped to the user) → assembles the ZIP → streams it back as an
attachment. **Synchronous with a size cap in v1**; large/async export (job +
notification) is an Open question (it would lean on the reserved
`sdk.notifications` / `events`).

### 4. Import / restore flow

Upload a bundle → **validate** `formatVersion` and each section's `schemaVersion`
→ **ID remap** (mint fresh ULIDs on this instance, preserving internal
references via `ctx.remapId`) → invoke each plugin's import handler
**transactionally** (runtime injects user/tenant) → default **additive merge**
(create new records; never overwrite another user's data) → **unknown/absent
plugins are skipped with a warning**. Conflict policy beyond "additive" is an
Open question.

### 5. Cross-instance migration

The same bundle moves between instances. Compatibility is checked via
`formatVersion`, each section's `schemaVersion`, and the plugin manifest's
`compatibility.minPlatformVersion`. The subject user is **remapped to the target
instance's current user** (you import _into_ your account on instance B); source
instance identity is recorded in `manifest.json` for provenance.

### 6. Permissions (reserved)

- `data:export` — the plugin may contribute its slice to a user's export.
- `data:import` — the plugin may accept imported user data.

### 7. Security & privacy

- **Owner-only.** Export/import act on the requesting user (`x-sovereign-user-id`);
  no cross-user access. Optional re-auth before export of sensitive data.
- **Untrusted input on import.** Validate format/schema versions, enforce size
  limits, reject unknown shapes, and run each plugin's import in its own
  user/tenant-scoped context — a malicious bundle cannot write outside the
  importing user.
- **Transport.** If async export lands, downloads use signed, expiring links.
- **Audited.** Every export and import is recorded via `sdk.activity` (RFC 0005)
  — a security-relevant, user-visible event.

### 8. UI (deferred)

A new Account **"Data"** tab: **Export my data** (download) and **Import /
restore** (upload), with progress and a per-section result summary (imported /
skipped / warnings).

## Impact when accepted (deferred — beyond the reserved stub)

| Where                                    | Change                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/sdk`                           | Implement `sdk.portability` against the runtime (replace the stub).                                       |
| `packages/manifest`                      | Enforce `data:export` / `data:import`.                                                                    |
| Runtime                                  | Export assembler, import validator + ID remap, plugin-resolver registry, ZIP streaming, owner gating.     |
| Account                                  | "Data" tab + actions/routes.                                                                              |
| Reference plugins                        | Implement export/import resolvers (Tasks, Splitify, …).                                                   |
| SRS §3 / §5                              | Promote to specified; new `POR-xx` requirement IDs + decision-log entry; manifest reference for `data:*`. |
| `docs/sovereign-implementation-tasks.md` | The sequenced implementation task.                                                                        |

## Alternatives considered

1. **Declarative manifest annotations** (plugin lists user-owned tables/columns;
   platform auto-queries) instead of SDK hooks. Cannot express membership graphs,
   shared resources, derived data, or blobs. Rejected.
2. **Platform + account data only (v1)** — export profile/prefs/avatar and defer
   plugin participation. Ships fast but omits the plugin data users actually care
   about. Rejected as the target (though it is the natural first delivery slice).
3. **JSON-only bundle** — a single JSON file with avatars as URLs/base64. Awkward
   for files and large blobs; rejected in favour of a versioned ZIP.
4. **Admin full-instance GUI** — a Console wrapper over RFC 0006's `sv backup`.
   Admin-facing, not end-user; belongs with the ops RFC. Excluded here.
5. **Fold into RFC 0002's `sdk.data`** — conflates consent-gated cross-plugin
   reads with user portability. Kept as a separate namespace (see Open questions).

## Open questions

1. **Namespace placement.** `sdk.portability` (proposed) vs folding export/import
   into RFC 0002's `sdk.data`. Proposal: separate, to decouple from the consent
   model.
2. **Sync vs async export.** v1 sync with a size cap; large exports may need a job
   - notification (reserved `sdk.notifications`/`events`) and signed links.
3. **Import conflict policy.** Additive-only (proposed default) vs replace vs
   interactive merge.
4. **Bundle encryption.** Optional password/age-encryption of the ZIP, given it
   contains personal data at rest after download.
5. **ID remap & referential integrity.** Cross-plugin references and the
   `remapId` contract — how far the platform helps vs the plugin owns.
6. **Shared / membership data.** Export owned rows only, or also include
   shared-resource membership (read-only)? Avoids duplicating other users' data.
7. **Selective export.** Per-plugin / per-category selection vs all-or-nothing.
8. **Avatars via `sdk.storage`.** Once `sdk.storage` lands, source the avatar blob
   through it rather than reading disk directly.

## Adoption path

1. **Now (proposed, deferred for sequencing):** reserved `sdk.portability` stub
   (`provideExport`/`provideImport` throw `NotImplementedError`) +
   `data:export` / `data:import` permissions — additive (SDK + manifest **minor**
   bumps). No behaviour change for existing plugins.
2. **On acceptance:** apply the "Impact when accepted" table — bundle format +
   runtime assembler/importer, the Account "Data" tab, then reference-plugin
   resolvers.
3. The mechanism becomes part of the public manifest + SDK contract from the
   `@sovereignfs/sdk` / `@sovereignfs/manifest` minor release that ships it.

## Changelog

| Version | Date     | Change                                                                            |
| ------- | -------- | --------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; proposes reserved `sdk.portability` + `data:export`/`data:import`. |
