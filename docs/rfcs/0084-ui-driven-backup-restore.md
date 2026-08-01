# RFC 0084 — UI-driven backup & restore

**Status:** Draft\
**Date:** August 2026\
**Author:** kasunben\
**Scope:** new `backup_jobs` table (`packages/db`), new `runtime/src/backup-worker.ts`,
new `runtime/app/api/backup-jobs/**`, new `plugins/console/app/backups/**`, extends
`plugins/account/app/data/page.tsx` / `PortabilityPanel.tsx`, extends
`runtime/src/portability/assemble.ts`, a new `sv backup --exclude-plugin` flag on
`bin/sv.ts` (spawned as a subprocess, otherwise unchanged), `.env.example`. Amends
RFC 0007 (resolves Open Questions #2 and #7) and layers on top of RFC 0068. Relates
to, but does not depend on, RFC 0064.\
**Incorporated into plan:** Yes — epic tasks 8.16, 8.17, 8.18.

---

## Summary

Add a UI-driven, asynchronous backup and restore feature. Owners and admins get a
Console page to back up and restore the whole instance; every other user gets an
Account page to back up their own data (restore reuses the existing import flow).
Both backup flows are asynchronous: triggering a backup creates a tracked job, the
archive is generated in the background, encrypted with a passphrase the requester
supplies, and delivered via a time-bounded signed download link once ready — the
requester can leave and come back later. Console's flow additionally supports
pushing the encrypted archive to a configured Git remote, and its restore flow is a
guarded, in-app live restore with a maintenance-mode gate and an automatic
pre-restore safety snapshot.

## Motivation

Sovereign has two backup-adjacent systems today and neither is reachable from a
browser. Operators have `sv backup`/`sv restore` (RFC 0006) — a real, working,
full-instance mechanism, but CLI-only, synchronous, and with no UI anywhere in
Console. Regular users have per-user data export/import (RFC 0007, RFC 0033,
RFC 0052, RFC 0068) via Account's `PortabilityPanel.tsx` — but it is fully
synchronous with a hard-coded ceiling (`MAX_EXPORT_BYTES`, 50 MB), and RFC 0007 has
carried two open questions since it shipped: whether export should ever be
asynchronous with a signed link ("Sync vs async export"), and whether a user should
be able to choose which plugins/categories to include ("Selective export"). RFC 0068
explicitly chose the synchronous-with-ceiling design over a background job for its
own scope — this RFC revisits that choice because the underlying requirement has
changed: both audiences now need a feature that survives being larger or slower
than one HTTP request, and comes with a real place to click a button and get it.

This also matters for Sovereign's positioning: self-hosted, privacy-first
instances are exactly the ones without a managed backup service behind them — the
operator (and, for their own data, every user) is the backup story. A CLI-only
mechanism is a real gap for the non-technical owner/admin persona this platform
targets alongside developers.

## Current state (what this builds on)

- **`sv backup`/`sv restore`** (`bin/sv.ts:508-751`, RFC 0006, implemented):
  full-instance, dialect-detected (SQLite: whole `data/` dir tarred, including
  isolated plugin DBs and WAL/SHM sidecars; Postgres: `pg_dump --format=custom`
  per platform/auth DB), local `.tar.gz` archive under `./backups`, CLI-only, no
  selective/per-plugin scope, plaintext by default (encryption is inherited only
  when the source SQLite files are already SQLCipher-encrypted per RFC 0071).
  `sv restore` extracts in place; SQLite restore has marker-reconciliation logic
  (`bin/sv.ts:696-746`) to avoid RFC 0071's "key wrong" failure mode when
  restoring a pre-encryption backup onto an encrypted instance — this logic is
  load-bearing and was exercised for real in the 2026-07-24 incident
  (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`).
- **`sv db encrypt`/`decrypt`** (`bin/sv.ts:~815-1045`) auto-run a full backup as
  a safety net before converting files unless `--skip-backup` is passed
  (`bin/sv.ts:886-891,1009-1014`) — the precedent this RFC's automatic
  pre-restore safety snapshot mirrors.
- **RFC 0064** (`docs/rfcs/0064-git-backed-operator-backups.md`, Status: Draft,
  unbuilt, epic tasks 8.10-8.12 pending) designs an encrypted
  `backup-manifest.json`, a Git-remote push/pull backend, retention/deletion, and
  scoped plugin restore — all still CLI-only by its own scope statement ("No
  public SDK or UI package semver impact is expected"). Its own Open Question #3
  asks whether Console should ever expose backup/retention status — this RFC is
  that answer, arrived at independently rather than by waiting for 8.10-8.12.
- **User data portability** (RFC 0007 implemented; `runtime/src/portability/`):
  `assembleExport()` (`runtime/src/portability/assemble.ts`) builds a versioned
  ZIP in-memory by calling each eligible, opted-in plugin's registered
  `sdk.portability.provideExport` resolver (`packages/sdk/src/portability.ts`);
  `applyImport()` (`runtime/src/portability/restore.ts`) does the additive-merge
  reverse. `GET /api/account/export` / `POST /api/account/import`
  (`runtime/app/api/account/{export,import}/route.ts`) are both synchronous,
  session-gated to the requester's own `userId`, capped at `MAX_EXPORT_BYTES`/
  `MAX_IMPORT_BYTES` (50 MB). `ExportContext` already carries an `options:
ExportOptions` bag with an `includeFiles` toggle — the extension point for
  per-plugin selection this RFC adds to. `PortabilityPanel.tsx` (Account → Data
  tab) does a plain `fetch` → `res.blob()` → synthetic `<a download>` click; no
  polling, no job concept.
- **RFC 0068** (implemented) added `installedPlugins`/`notExported` to
  `BundleManifest` and explicitly decided the sync-vs-async question as "a
  documented, enforced ceiling... rather than a background job" for its own
  scope — this RFC adds the async path alongside that decision, not reversing
  it; the existing synchronous endpoint keeps working for small quick exports.
- **No async job infrastructure exists.** `sdk.jobs` (RFC 0046) is unbuilt — its
  own status header says "Partially implemented (Phase 1 subset)... No queue,
  persistence, retries, cron, or `sdk.jobs` API yet." The only thing that runs
  code outside a request today is `runtime/src/scheduler.ts`, a fixed-interval
  60-second-tick sweep for manifest-declared recurring schedules, whose own doc
  comment states it is "deliberately NOT a job queue."
- **`sdk.storage`** (RFC 0044, implemented, `runtime/src/storage.ts`) is
  real but unsuitable for this feature as-is: local-filesystem-only, default
  caps of 25 MiB/object and 500 MiB/plugin-total (`storage.ts:13-14`, both
  env-overridable), signed URLs hard-capped at 1 hour
  (`MAX_SIGNED_URL_TTL_SECONDS`, `storage.ts:9-10`), and the download route
  (`runtime/app/api/storage/[token]/route.ts`) buffers the whole object in
  memory rather than streaming — none of this fits a multi-plugin or
  whole-instance archive that might be hundreds of megabytes and needs a
  "come back tomorrow" download window.
- **Console conventions**: Server Actions returning a shared `ActionResult`
  union for `useActionState` (e.g. `plugins/console/app/settings/actions.ts:11`),
  `sdk.auth.hasCapability(session, '<capability>')` checks in both actions and
  pages, `adminOnly` route-prefix gating in runtime middleware
  (`docs/architecture-rules.md:157-159`) for `platform:admin`/`platform:owner`,
  `ConfirmDialog` (`@sovereignfs/ui`) as the sanctioned destructive-action
  pattern with async `onConfirm` support. The existing "admin-managed external
  provider config" encrypted-secret pattern
  (`plugins/console/app/settings/SmtpSettingsForm.tsx`) is the precedent this RFC
  reuses for storing a Git remote token, rather than inventing a new
  secret-storage mechanism.

## Proposed design

### Shared primitive: `backup_jobs`

A new Drizzle table in `packages/db` (platform DB, both dialects):

- `id`, `scope` (`'instance' | 'user'`), `requestedByUserId`, `tenantId`,
  `status` (`'queued' | 'running' | 'complete' | 'failed'`), `optionsJson`
  (selected/excluded plugin ids, git-push flag), `archivePath` (absolute path
  on local disk — deliberately outside `sdk.storage`'s object model, for the
  size/streaming/TTL reasons above), `sizeBytes`, `errorMessage`, `createdAt`,
  `startedAt`, `completedAt`, `expiresAt`.

### Worker: `runtime/src/backup-worker.ts`

A new sibling module to `scheduler.ts`, not a repurposing of it — mirrors its
interval-tick + conditional-`UPDATE`-claim idempotency pattern (safe under
multiple workers/restarts) rather than reusing its recurring-schedule-only
code path, since `scheduler.ts`'s own doc comment states it is deliberately not
a job queue. Each tick: claim one queued `backup_jobs` row (`UPDATE ... WHERE
status = 'queued' ... LIMIT 1` equivalent), mark it `running`, do the work
below, mark `complete`/`failed`, and separately sweep archive files past their
`expiresAt` for cleanup. The runtime is a persistent Node process (PM2/Docker,
not serverless — `docs/self-hosting.md`), so this in-process worker is a
legitimate, simple design; it does not need to survive a process restart mid-job
(a `running` job orphaned by a restart is swept back to `failed` on next boot).

- **Instance-scope job:** spawns `pnpm sv backup` (existing CLI, unchanged
  archive logic) as a child process, passing the job's options via a new
  `--exclude-plugin <id>` flag (repeatable) — the one actual CLI change this RFC
  needs. Captures stdout/stderr and enforces a hard timeout so a hung subprocess
  cannot leave a job stuck `running` forever. Captures the resulting archive
  path.
- **User-scope job:** calls the existing `assembleExport()` directly (in-process,
  no subprocess needed) with `ExportOptions` extended to carry a per-plugin
  inclusion list (resolves RFC 0007 Open Question #7 — "Selective export").
  The async path has no `MAX_EXPORT_BYTES` ceiling; the existing synchronous
  `GET /api/account/export` endpoint is untouched and keeps its ceiling for
  quick small exports.
- **Encryption (both scopes, always applied — no opt-out):** AES-256-GCM via
  Node's built-in `crypto`, key derived from the requester-supplied passphrase
  via `scrypt`. This resolves RFC 0007 Open Question #4 ("Bundle encryption")
  and is this RFC's answer to RFC 0064's still-open Question #1 ("age
  recipients, passphrase AES-GCM, or both") for its own narrower scope:
  passphrase-based AES-GCM, zero new dependencies. Recipient-based (age)
  encryption is left as a future enhancement, not needed for a single
  requester downloading their own backup. The passphrase is never persisted —
  it must be supplied again at download time (see below), not embedded in the
  signed URL, so a leaked link alone cannot decrypt the archive.
- **Optional Git push (instance-scope only):** if Git-remote credentials are
  configured (`SV_BACKUP_GIT_REPOSITORY`/`SV_BACKUP_GIT_TOKEN` — reusing RFC
  0064's env var names for forward compatibility even though this RFC does not
  depend on RFC 0064 landing), the worker pushes the encrypted archive as an
  orphan commit tagged `sv-backup/<timestamp>/v<platform>`, the same shape RFC
  0064 proposes. **No retention, listing, or pruning of remote backups in v1**
  — that stays epic task 8.12's scope, deferred. When 8.10-8.12 eventually
  land, this RFC's local manifest and Git-push code should be reconciled into
  RFC 0064's format rather than left as a permanent second format; this is a
  named follow-up, not a blocker for either RFC.

### Signed download delivery

A new route, `runtime/app/api/backup-jobs/[jobId]/download/[token]/route.ts`,
HMAC-signed opaque token construction in the same style as
`runtime/app/api/storage/[token]/route.ts`, but: a configurable TTL (default 48
hours, not the storage route's 1-hour ceiling), and streaming from disk via
`createReadStream` rather than buffering the whole archive in memory. The
passphrase used to encrypt must be re-entered at download time to decrypt
client-side or server-side before the browser receives bytes (implementation
detail for the leg that builds this — either is acceptable as long as the
passphrase never rides in the URL/token itself).

### Notification on completion

Reuse the existing notification broker that already reaches `NotificationBell`/
`sdk.notifications` today to tell the requester "your backup is ready" with a
link to the job/download page. The exact platform-level (non-plugin) integration
point is confirmed during implementation (Leg 1 detail in the companion
workstream), since today's `sdk.notifications.send` is a plugin-scoped SDK call
keyed by `pluginId`, and this needs to fire from platform-owned code, not a
plugin.

### Console UI — instance backup & restore (owner/admin)

New `plugins/console/app/backups/page.tsx`, gated the same way every other
admin-only Console page is (`adminOnly` route prefix + `hasCapability` checks
in its Server Actions).

- **Backup:** a trigger form (checkboxes to exclude specific installed
  plugins, a required passphrase field, an optional "also push to a Git
  remote" checkbox shown only when credentials are configured — stored via the
  same encrypted-secret pattern `SmtpSettingsForm.tsx` already establishes for
  admin-managed external provider config, not a new mechanism), a job list
  showing queued/running/complete/failed status with download links, and
  git-push status when applicable.
- **Restore:** pick a previous instance backup or upload an archive, then a
  guarded flow: (1) a validation/compatibility preview — platform version, DB
  dialect, plugin manifest compatibility, pulling forward the same checks RFC
  0064's "Restore guards" section already specifies, implemented here directly
  rather than waiting on that RFC; (2) a maintenance-mode toggle the admin must
  explicitly enable; (3) an automatic pre-restore safety snapshot, mirroring
  `sv db encrypt`'s existing auto-backup-before-convert precedent; (4) a typed
  confirmation (the admin types the instance name, the same friction level
  `ConfirmDialog`'s async-`onConfirm` pattern supports); (5) execution,
  in-process, using the same restore logic `sv restore` already uses.

### Account UI — async user data backup (every user)

Extends `plugins/account/app/data/page.tsx` / `PortabilityPanel.tsx` with a new
"Full backup" action alongside (not replacing) the existing synchronous quick
export button: per-plugin inclusion checkboxes, a required passphrase field,
job status, and a signed download link once ready. **Restore stays the existing
import flow** (`POST /api/account/import`, additive-merge) — importing an
already-downloaded file the user has locally is fast and bounded, so it does
not need the job/async treatment the way _generating_ an export does; only
backup gets the new async path.

## Alternatives considered

1. **Wait for RFC 0064 (8.10-8.12) to land first, and build this RFC's UI
   directly on its manifest/encryption format.** Would avoid a second local
   manifest format existing even temporarily. Rejected per explicit product
   decision: RFC 0064 is Draft with no scheduled timeline, and the UI gap is
   independently valuable now; the reconciliation cost of merging two formats
   later is accepted as a known, named follow-up rather than a blocker.
2. **CLI-only restore; Console only stages/validates and tells the admin to
   run `sv restore` themselves.** Materially safer (no web request can trigger
   a live destructive restore), but does not satisfy "restore via UI," which
   was explicit in the product ask. Rejected in favor of an in-app live restore
   with maintenance-mode gating, an automatic safety snapshot, and typed
   confirmation as the mitigations.
3. **Two-step gated restore** (admin must separately enter maintenance mode as
   its own action before an in-app restore control unlocks at all). More
   friction, marginally safer than a single combined flow. Rejected in favor
   of folding the maintenance-mode toggle into the guided restore flow itself
   — the guardrails (compatibility preview, safety snapshot, typed
   confirmation) are judged sufficient without a separate prerequisite step.
4. **Block this feature on RFC 0046's `sdk.jobs` maturing first**, and build
   backup on top of the general-purpose plugin job system once it exists.
   Rejected: `sdk.jobs` is barely started (Phase 1 subset, no queue/retries/
   persistence yet) and is a plugin-facing SDK surface with its own separate
   design pressures; blocking a concrete, scoped feature on an unrelated,
   unscheduled SDK effort is worse than building a small, purpose-built job
   table now. If Leg 1's scope grows past "minimal," that is this workstream's
   own kill-criteria signal to switch tracks, not a reason to wait up front.
5. **No archive encryption in v1**, matching `sv backup`'s current
   plaintext-by-default posture. Rejected: `docs/security.md` already states
   plainly that raw backups expose data if leaked, and that posture is far
   more consequential once a backup is reachable via a web-downloadable signed
   URL instead of a local CLI-only file. Encryption is mandatory, not optional,
   in this design.
6. **Reuse `sdk.storage` for archive delivery** instead of a dedicated route.
   Rejected on concrete limits: 25 MiB/object and 500 MiB/plugin-total default
   caps, a 1-hour hard ceiling on signed URLs, and a download route that
   buffers the whole object in memory — none of which fit a potentially large,
   "come back later" archive.

## Open questions

1. Exact platform-level (non-plugin) notification integration point — resolve
   during Leg 1 of the companion workstream, not blocking the RFC itself.
2. Whether `sv backup --exclude-plugin` should also gain an `--include-plugin`
   allowlist form, or whether exclude-only is sufficient for v1.
3. Whether the Git remote token should be entered once per instance (global,
   Settings-style) or could ever be scoped per-backup — proposed default is
   global/instance-wide, matching how `SmtpSettingsForm.tsx`'s external
   provider config already works.
4. Whether a failed job should auto-retry once, or always require the
   requester to re-trigger manually — proposed default is manual re-trigger
   for v1 simplicity.

## Adoption path

Maps 1:1 to three epic tasks (`docs/epics/data-sovereignty.md`):

1. **Epic task 8.16** — `backup_jobs` table, `backup-worker.ts`, the
   passphrase-AES-GCM encryption helper, and the signed-download route. Pure
   platform primitive, nothing user-facing yet.
2. **Epic task 8.17** — Console instance backup & restore UI, the
   `--exclude-plugin` CLI flag, optional Git push, and the guarded restore
   flow. Depends on 8.16 and 8.1.
3. **Epic task 8.18** — Account async selective backup UI. Depends on 8.16,
   8.2, 8.8, 8.13.

No public SDK or UI package (`@sovereignfs/sdk`, `@sovereignfs/ui`) semver
impact is expected — this is runtime/Console/Account application code, not a
plugin-facing contract change. `docs/self-hosting.md` and `.env.example` need
updates for the new Git-push env vars once Leg 2 (epic task 8.17) implements
them.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
