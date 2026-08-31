# Workstream 0004 — UI-driven backup & restore

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0084](../rfcs/0084-ui-driven-backup-restore.md) (governing);
relates to [0006](../rfcs/0006-deployment-upgrade-strategy.md) (`sv backup`/
`restore` baseline), [0007](../rfcs/0007-user-data-portability.md) (user data
portability — resolves its Open Questions #2 and #7),
[0064](../rfcs/0064-git-backed-operator-backups.md) (git-backed operator
backups — related, not a dependency)\
**Epics touched:** 8 (Data Sovereignty)\
**Amended by:** workstream [0023](0023-age-encrypted-git-backup-destinations.md)
(August 2026) — migrates this workstream's encryption helper (Leg 1) onto
`age`'s passphrase mode so it shares one implementation with 0023's new
recipient-mode encryption; no other change to this workstream's scope,
decisions, or legs.

---

## Goal

An owner or admin can trigger, monitor, download, and restore a full-instance
backup entirely from Console — no CLI required — with the option to exclude
specific plugins and to push the encrypted archive to a configured Git remote.
Any other user can trigger, monitor, and download an asynchronous, selective
backup of their own data from Account. Both backup flows survive being slower
or larger than one HTTP request: triggering one starts a tracked job, and the
requester can leave and come back later to a signed download link. Neither
flow exists in any UI today — only the CLI (`sv backup`/`sv restore`, operator
scope) and a fully synchronous, 50MB-capped export (`PortabilityPanel.tsx`,
user scope).

## Definition of done

- [ ] An owner/admin can trigger an instance backup from
      `/console/backups`, excluding specific plugins, and download the
      resulting encrypted archive via a signed link once the job completes.
- [ ] An owner/admin can restore a full instance from Console: compatibility
      preview → maintenance-mode toggle → automatic pre-restore safety
      snapshot → typed confirmation → execution — with no step skippable.
- [ ] When Git-remote credentials are configured, an instance backup can
      optionally also be pushed as an encrypted, tagged commit.
- [ ] Any user can trigger a selective async backup of their own data from
      Account, choosing which installed plugins to include, and download it
      via a signed link once ready — without touching the existing
      synchronous quick-export button or the existing import flow.
- [ ] Every generated archive (both scopes) is encrypted with a
      requester-supplied passphrase; there is no plaintext-archive path.
- [ ] A job's state is server-persisted — refreshing or closing the browser
      mid-job does not lose it, and the requester is notified when it
      completes.

## Decisions locked

Settled with the user during planning, August 2026 — full reasoning in RFC
0084's "Alternatives considered" section.

| Decision                  | Choice                                                                                                                                                                                              | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relationship to RFC 0064  | Ship independently now with our own lightweight local manifest; also support optional Git-remote push when credentials are configured (pulls forward a slice of epic 8.11)                          | Waiting for RFC 0064's 8.10–8.12 to land first — RFC 0064 is Draft with no scheduled timeline, and the UI gap is independently valuable now                                                                                                                                                                                                                                                                                                                    |
| Admin restore execution   | In-app live restore: maintenance-mode gate + automatic pre-restore safety snapshot (mirrors `sv db encrypt`'s pattern, `bin/sv.ts:886-891,1009-1014`) + typed confirmation, executed in-process     | CLI-only restore (safer, but doesn't satisfy "restore via UI"); a separate two-step maintenance-mode-first action (more friction, judged unnecessary given the other guardrails)                                                                                                                                                                                                                                                                               |
| Async infra               | Build a small, purpose-built `backup_jobs` table + in-process worker now                                                                                                                            | Waiting on RFC 0046 `sdk.jobs` — it's Phase-1-subset only, with "no queue, persistence, retries, cron... yet" per its own status header; blocking a scoped feature on an unrelated, unscheduled SDK effort is worse                                                                                                                                                                                                                                            |
| Archive encryption        | Always require a passphrase (AES-256-GCM, Node's built-in `crypto`, `scrypt`-derived key) — no plaintext-archive option                                                                             | Optional or none — rejected because `docs/security.md` already flags raw backups as a real risk, and that risk is materially higher once a backup is web-downloadable via a signed URL instead of a local CLI-only file                                                                                                                                                                                                                                        |
| Encryption implementation | Passphrase-based, via `age`'s own passphrase (scrypt) mode — **amended by workstream [0023](0023-age-encrypted-git-backup-destinations.md), August 2026**; originally raw Node `crypto` AES-256-GCM | Keeping raw Node `crypto` as a second implementation alongside a separate age library once workstream 0023 needed recipient-mode encryption — superseded in favor of one shared `age`-based implementation; the original reasoning ("unnecessary complexity for a single requester downloading their own backup") still holds for _this_ workstream's own scope, it just no longer justifies maintaining two parallel crypto implementations once 0023 existed |
| Signed-download mechanism | A dedicated `backup-jobs` download route with disk streaming and a configurable (default 48h) TTL                                                                                                   | Reusing `sdk.storage` — its 25 MiB/object and 500 MiB/plugin-total caps, 1-hour hard TTL ceiling, and in-memory-buffered download route don't fit a potentially large, "come back tomorrow" archive                                                                                                                                                                                                                                                            |
| User restore              | Unchanged — stays the existing `POST /api/account/import` additive-merge flow                                                                                                                       | Building a new async restore path for users — importing an already-downloaded file is fast and bounded; the async problem is specific to _generating_ an export, not applying one                                                                                                                                                                                                                                                                              |
| Workstream execution      | Legs — one branch, one draft PR, one review gate per leg                                                                                                                                            | Stacked per-task branches, or one giant PR per workstream                                                                                                                                                                                                                                                                                                                                                                                                      |

## Prerequisites

None blocking. Epic tasks 8.1 (`sv backup`/`restore` baseline), 8.2 (user
data portability), 8.8 (plugin portability hooks), and 8.13 (export
completeness hardening) are all ✅ already shipped — this workstream builds on
top of them, not around a gap in them.

## Legs

| Leg | Name                              | Epic tasks | Epics | Gate? | Done when                                                                                                                                                                                     |
| --- | --------------------------------- | ---------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backup job infrastructure         | 8.16       | 8     | No    | `backup_jobs` table, `backup-worker.ts`, the encryption helper, and the signed-download route exist, are covered by tests, and round-trip a real archive end to end — nothing user-facing yet |
| 2   | Console instance backup & restore | 8.17       | 8     | No    | An owner/admin completes a real backup→download and a real restore end to end against a dev instance                                                                                          |
| 3   | Account async user backup         | 8.18       | 8     | No    | A non-admin user completes a real selective async backup→download end to end                                                                                                                  |

Legs 2 and 3 both depend only on leg 1, not on each other — they can be
reordered, or picked up by a second engineer in parallel, without changing
this workstream's outcome. Default sequence is 1 → 2 → 3.

## Leg detail

### Leg 1 — Backup job infrastructure

**Epic tasks:** 8.16

**Why this leg is first:** legs 2 and 3 are both thin UI/orchestration layers
over the same primitive — job tracking, encryption, and signed delivery.
Building that primitive once, tested in isolation with no UI yet, means legs
2 and 3 are each a smaller, more reviewable PR.

**Technical notes:**

- `backup_jobs` schema goes in `packages/db`, both dialects, following the
  existing dual-schema pattern already used for every other platform table.
- `runtime/src/backup-worker.ts` is a **new sibling module** to
  `runtime/src/scheduler.ts`, not a repurposing of it — `scheduler.ts`'s own
  doc comment states it is deliberately not a job queue (interval-tick,
  manifest-declared recurring schedules only). Mirror its
  interval-tick-plus-conditional-`UPDATE`-claim idempotency pattern (the same
  approach `plugins/sovereign-tasks.local/app/_jobs/due-reminders.ts` uses for
  its own claim logic) rather than inventing a new one.
- The runtime is a persistent Node process (PM2/Docker per
  `docs/self-hosting.md`, not serverless) — a Route Handler creating a
  `queued` row and returning immediately is a legitimate, simple trigger; the
  worker's tick loop is what actually does the work, not a `void` fire-and-
  forget promise off the request itself. This keeps a mid-restart job
  recoverable: sweep any `running` row with no active worker claim back to
  `failed` on boot, rather than trying to resume it.
- Encryption helper: AES-256-GCM via Node's built-in `crypto`, `scrypt` KDF
  over the passphrase. No new dependency. Write it as a small, independently
  testable module (encrypt(buffer/stream, passphrase) → ciphertext;
  decrypt(ciphertext, passphrase) → plaintext or throws) since both legs 2 and
  3 call it identically.
- Signed-download route construction should mirror
  `runtime/app/api/storage/[token]/route.ts`'s HMAC-signed opaque token
  approach, but: configurable TTL (default 48h, well past `sdk.storage`'s
  1-hour `MAX_SIGNED_URL_TTL_SECONDS` ceiling), and stream from disk via
  `createReadStream` rather than reading the whole file into memory the way
  the storage route does — the whole reason for a dedicated route is avoiding
  that route's size assumptions.
- Notification integration point is a genuine open question (RFC 0084 Open
  Question #1) — today's `sdk.notifications.send` is plugin-scoped, keyed by
  `pluginId`; this needs to fire from platform-owned code. Spend real time
  here rather than guessing; if no clean platform-level hook exists, land a
  minimal one as part of this leg rather than skipping the notification
  entirely.

**Do not proceed if:** the notification integration point turns out to need a
larger change to the notification broker than this leg's scope — stop, write
a short follow-up note in this workstream's Risks section, and ship legs 2/3
with an in-app "check back on the Backups page" affordance instead of a push
notification for v1, rather than let leg 1 balloon into a notification-system
refactor.

### Leg 2 — Console instance backup & restore

**Epic tasks:** 8.17

**Technical notes:**

- `plugins/console/app/backups/page.tsx`, gated the same way every other
  admin-only Console page is: `adminOnly` route-prefix middleware gating
  (`docs/architecture-rules.md:157-159`) plus `hasCapability` checks inside
  its Server Actions, same `ActionResult`/`useActionState` convention as
  `plugins/console/app/settings/actions.ts:11`.
- `sv backup --exclude-plugin <id>` (repeatable) is the one change to the
  existing CLI this leg needs — add it to `bin/sv.ts`'s existing `backup`
  command (`bin/sv.ts:508-605`) rather than forking the archive logic. The
  worker (leg 1) spawns `pnpm sv backup` as a subprocess with this flag set
  from the job's `optionsJson`; capture stdout/stderr and enforce a hard
  timeout so a hung subprocess can't leave a job stuck `running` forever.
- Git-remote push reuses RFC 0064's env var naming
  (`SV_BACKUP_GIT_REPOSITORY`, `SV_BACKUP_GIT_TOKEN`) for forward
  compatibility even though this leg doesn't depend on RFC 0064 landing. The
  push checkbox in the UI is **absent, not merely disabled**, when
  credentials aren't configured. Store the token via the same
  encrypted-secret pattern `plugins/console/app/settings/SmtpSettingsForm.tsx`
  already establishes for admin-managed external provider config — do not
  invent a second secret-storage mechanism.
- Restore's compatibility preview pulls forward RFC 0064's "Restore guards"
  list (platform version, DB dialect, plugin manifest compatibility) as this
  leg's own safety checks — implement them here directly; do not wait for
  epic tasks 8.10–8.12 to define them first.
- The automatic pre-restore safety snapshot must exist on disk **before** the
  restore writes anything, mirroring `sv db encrypt`'s existing
  auto-backup-before-convert precedent (`bin/sv.ts:886-891,1009-1014`) — this
  is the single most important safety property of this leg; verify it with a
  real test, not just a code read.
- Typed confirmation (type the instance name) is the `ConfirmDialog` async-
  `onConfirm` pattern (`docs/design-system.md:1218-1241`) already used
  elsewhere in Console for destructive actions — reuse it, don't build a new
  confirmation component.
- SQLite restore has existing marker-reconciliation logic
  (`bin/sv.ts:696-746`) that avoids RFC 0071's "key wrong" failure mode when
  restoring a pre-encryption backup onto an encrypted instance. This logic is
  load-bearing (it was exercised for real in the 2026-07-24 production
  incident, `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`) —
  when this leg shells out to `sv restore`, it inherits this behavior for
  free; do not reimplement or bypass it.

**Do not proceed if:** a live restore triggered from this leg's flow cannot
be reliably distinguished, mid-execution, from a request that timed out or
was cancelled client-side — a restore that silently continues after the
browser gives up on the request is exactly the kind of half-applied state
this leg exists to prevent. If the Route Handler / Server Action lifecycle
can't guarantee the restore keeps running to completion once started
regardless of client connection state, route restore execution through the
same worker-tick mechanism leg 1 built for backups, not a raw in-request
`await`, before shipping this leg.

### Leg 3 — Account async user backup

**Epic tasks:** 8.18

**Technical notes:**

- Extend `plugins/account/app/data/page.tsx` /
  `runtime/app/(platform)/(plugins)/account/_components/PortabilityPanel.tsx`
  with a new "Full backup" action **alongside** the existing synchronous
  export button (`onExport()`,
  `PortabilityPanel.tsx:59-81` in the repo's canonical layout) — do not
  replace it; small quick exports should stay fast and simple.
- The async job calls the existing `assembleExport()`
  (`runtime/src/portability/assemble.ts`) directly, in-process — no
  subprocess needed for the user-scope path, unlike leg 2's instance-scope
  path.
- Extend `ExportOptions` (`packages/sdk/src/portability.ts`) with a
  per-plugin inclusion list alongside the existing `includeFiles` toggle —
  this is the concrete resolution of RFC 0007 Open Question #7 ("Selective
  export").
- The async path has **no** `MAX_EXPORT_BYTES` ceiling — that constant stays
  exactly as-is, governing only the existing synchronous
  `GET /api/account/export` endpoint. Verify this leg's async path actually
  succeeds on a bundle larger than that ceiling, as the concrete proof the
  async path is doing real work and not just wrapping the same limit.
- Restore is explicitly unchanged — `POST /api/account/import` stays exactly
  as it is. Confirm its existing tests still pass; this leg should add zero
  changes to that route.

**Do not proceed if:** a selective export (some plugins excluded) produces a
`manifest.json` that doesn't clearly distinguish "excluded by the user's
selection" from RFC 0068's existing `notExported` reasons
(`no-export-hook` | `disabled`) — conflating "the user chose not to include
this" with "this plugin can't participate" would be a real regression in the
transparency RFC 0068 specifically added. Add a distinct reason/flag rather
than overloading `notExported`.

## Risks

- **Admin live-restore is the sharpest edge in this entire workstream.** A
  botched web-triggered restore mid-request is a worse failure mode than a
  CLI operator making the same mistake, because there's no terminal in front
  of them to notice something is wrong. Leg 2's "do not proceed if" condition
  exists specifically to force this into the worker-tick execution model
  rather than a raw request-lifetime `await` if there's any doubt about
  request/response lifecycle guarantees.
- **Spawning `sv backup` as a subprocess from within the runtime process** is
  new — nothing in this codebase does this today. Stdout/stderr capture,
  timeout handling, and clean subprocess-failure→job-`failed` propagation all
  need real testing, not just a happy-path check.
- **Two backup manifest formats will coexist** once RFC 0064's epic tasks
  8.10–8.12 eventually ship (this workstream's own local manifest, and RFC
  0064's more complete one). This is an accepted, named tradeoff per the
  locked decision above, not an oversight — but whoever picks up 8.10 should
  read RFC 0084 and this workstream first, specifically to reconcile rather
  than duplicate.
- **RFC 0071's encryption work needed three hardening passes including a
  production incident** (per `CLAUDE.md`'s own account) — this workstream
  touches the same `sv backup`/`sv restore` machinery those passes hardened.
  Treat any interaction with `bin/sv.ts`'s backup/restore/encrypt/decrypt
  commands as an above-average-risk area, per that file's own standing
  CLAUDE.md guidance, not a routine change.

## Kill criteria

**If leg 1's job infrastructure proves to need more than the minimal scope
described** (real concurrency control, retries, cross-process coordination
beyond a single-claim tick loop) — that is the signal to stop and write a
proper RFC 0046 `sdk.jobs` implementation instead of continuing to
special-case backups. Legs 2 and 3 would then be re-scoped to sit on top of
that instead of the purpose-built table. What survives: leg 1's schema and
worker, even if later superseded, are still useful platform infra and a
concrete precedent for what a real job system needs to support.

**If leg 2's restore safety model can't be made trustworthy** within the
locked in-app-live-restore approach (see the Risks entry above) — stop before
shipping restore, but ship the backup half of leg 2 (trigger, exclude
plugins, download, optional Git push) on its own; a working backup-only
Console page is real value even if restore needs to fall back to
CLI-assisted for longer than planned.

In both cases the workstream is designed so that stopping early leaves
shipped, coherent value behind, not half a feature.

## Changelog

| Version | Date        | Change                                                                                    |
| ------- | ----------- | ----------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft                                                                             |
| 0.2     | August 2026 | Amended by workstream 0023: Leg 1's encryption helper migrates to `age`'s passphrase mode |
