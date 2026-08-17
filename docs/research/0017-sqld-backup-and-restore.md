# Research 0017 — SQLite (sqld) instance backup and restore

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/db/src` (sqld client, cutover tooling), `bin/sv.ts`, `runtime/src/backup-run.ts`, `runtime/src/backup-worker.ts`, `Dockerfile`, `docker-compose.prod.yml`\
**Related:** [RFC 0084](../rfcs/0084-ui-driven-backup-restore.md), [RFC 0091](../rfcs/0091-libsql-sqld-driver.md) (libSQL/sqld driver), epic task 8.16 (`docs/epics/data-sovereignty.md`), `docs/architecture-rules.md`'s "production `runner` Docker image cannot run `bin/sv.ts`" entry

---

## Question

`sv backup`/`sv restore` (and, by extension, RFC 0084's async backup-job
worker) explicitly refuse to run against the SQLite dialect — the CLI's own
error message says so (`bin/sv.ts:836`, `:941`). SQLite is the platform's
**default** dialect. What would it actually take to make instance backup and
restore work for it, and how much of that is genuinely new work versus
already-solved-elsewhere?

## Findings

**SQLite is not a file anymore.** RFC 0091 moved every SQLite-dialect
database — platform, auth, and every plugin — onto sqld (a libSQL server),
with no plain-file fallback (`packages/db/src/sqld.ts`'s file doc comment).
A database now lives inside a running server process, reachable only over
HTTP, not as a file `sv backup` can `tar`. That's the entire reason the
Postgres branch of `bin/sv.ts`'s `backup` command (`:788`–`:828`, shelling
out to `pg_dump`) has no SQLite equivalent — there's no local file to hand
to `tar` anymore.

**There is more than one database to back up, and the count is knowable in
advance.** Three categories exist:

- The platform's own database — sqld's default (no-header) namespace.
- The auth service's database — its own dedicated namespace, hardcoded as
  `'sovereign_auth'` (`apps/auth/src/db.ts:52`, `AUTH_STORE_NAME`). Auth
  deliberately doesn't import `@sovereignfs/db` (service-boundary
  independence) — it duplicates a small amount of the same sqld-resolution
  logic itself (`apps/auth/src/db.ts:20`).
- One namespace per installed plugin, named `plugin_<slug>`
  (`packages/db/src/sqld.ts:53`, `pluginNamespaceName`). Since the
  `database.isolation`/`"shared"` manifest option was retired, every
  non-platform-type plugin is unconditionally isolated
  (`runtime/src/plugin-migrations.ts:63`) — so the platform DB's own plugin
  registry (already queried at boot by `runAllPluginMigrations`) is a
  complete, authoritative list of namespaces to visit. No sqld
  namespace-listing admin-API call is needed; this project doesn't currently
  call one (`packages/db/src/sqld.ts` only wraps namespace `create`/`delete`,
  not `list`).

**The hard part — reading a live namespace's data out over SQL — already has
a working, tested mirror image in this codebase.** `sv db migrate-to-sqld`
does the opposite operation: read a plain-file SQLite database's schema and
rows, and write them into a live sqld namespace
(`packages/db/src/sqld-cutover.ts`). Concretely, `cutoverSqliteFileToSqld`
(`sqld-cutover.ts:91`):

1. Reads every `CREATE TABLE`/`CREATE INDEX` statement from
   `sqlite_master` (`:112`–`:118`).
2. Reads every row of every table via `SELECT *` (`:134`).
3. Replays all of it as one `client.migrate()` transaction against the
   destination (`:150`).

A backup dump is the same three steps with source and destination swapped:
open a `Client` against the live namespace instead of a `Database` against a
file, read `sqlite_master` and every table the same way, and write the
result into a fresh plain `.sqlite` file (via `better-sqlite3`, the same
library `sqld-cutover.ts` already depends on) instead of replaying it into
sqld. `@libsql/client`'s `Client` and `better-sqlite3`'s `Database` both
speak plain SQL over the same statement shapes, so this isn't a new
technique — it's the existing one, pointed the other way.

**Restore is even cheaper than it looks — it can reuse the existing tool
directly.** Once a namespace's data is back in a plain `.sqlite` file (the
output of the dump step above), getting it back into a fresh sqld namespace
**is** `cutoverSqliteFileToSqld`, unmodified. It already refuses to run
against a non-empty destination (`sqld-cutover.ts:98`–`:103`) — a safety
property that happens to be exactly what a restore into a freshly
provisioned namespace wants too.

**This branch already built the encryption and orchestration halves of the
problem** — `backup-encryption.ts` (AES-256-GCM, tested round-trip/tamper/
empty-payload), and the worker's claim/run/mark/sweep loop
(`backup-worker.ts`) are dialect-agnostic; only the "produce/consume an
archive for one namespace" step is dialect-specific. `runInstanceBackup`
(`runtime/src/backup-run.ts:64`) is currently the sole `runBackup`
implementation and only knows how to shell out to `sv backup` — its own doc
comment (`:29`) documents this as a known gap.

**Two Docker-topology gaps, not code gaps, block even the Postgres path from
being end-to-end functional today** (documented in
`docs/architecture-rules.md`): the production `runner` image has no
`bin/`/`scripts/`/`tsx` at all (`Dockerfile:147`, vs. the full-checkout
`tools` stage at `:98`), so nothing running inside `runtime` can spawn `sv
backup` regardless of dialect; and no image installs `pg_dump`
(`Dockerfile` has no `postgresql-client`-style `apk add` anywhere). Building
SQLite support doesn't make either of these go away — a real backup feature
needs both resolved regardless of which dialect triggered the investigation.

**`sv db migrate-to-sqld`/`postgres-migration.ts` are explicitly transitional
and slated for deletion** (`sqld-cutover.ts:11`–`:19`, `postgres-migration.ts:19`–`:26`)
once every instance has completed a one-time historical cutover. New,
permanent backup code should not import from them — the row-copying
_technique_ should be lifted into shared, permanent code (or duplicated
deliberately, matching this codebase's existing precedent of `apps/auth`
duplicating small amounts of sqld logic rather than sharing it across a
service boundary it wants independent), not left depending on a file with a
documented deletion date.

## Options considered

**A — Build a logical (SQL-level) dump/restore, per namespace, in-process.**
The approach detailed in Findings above: read tables via SQL, write a plain
`.sqlite` file, tar every namespace's file together with avatars, encrypt.
_Pros:_ every piece has a working precedent already in this codebase;
produces a portable single-file-per-namespace archive that's trivially
restorable (reuses `cutoverSqliteFileToSqld` verbatim); no new
infrastructure (no object storage, no new services). _Cons:_ reading a whole
table via one `SELECT *`/`.all()` doesn't scale to a very large table
without paging; multiple separate per-table reads aren't automatically
point-in-time-consistent with each other unless wrapped in an explicit
per-namespace read transaction.

**B — Use sqld's own built-in backup mechanism ("bottomless" continuous
backup to S3-compatible storage).** libSQL server ships a native backup
feature that continuously ships WAL frames to object storage. _Pros:_
maintained by the sqld project itself, likely more efficient and battle-tested
at scale than a hand-rolled logical dump. _Cons:_ requires an S3-compatible
bucket and credentials — meaningfully more infrastructure than this project
asks a self-hosted single-machine operator for anywhere else (the
notification broker's Redis path is opt-in and explicitly the more-complex
alternative to the zero-infra default, for comparison); doesn't naturally
produce the one-passphrase-encrypted-file-a-user-downloads shape RFC 0084
wants — it's designed for continuous operational recovery, not an on-demand
personal export; would need its own separate integration effort per
namespace (auth's separate connection, in particular) regardless.

**C — Snapshot the sqld Docker volume directly (filesystem-level, like the
CLI's existing advice for admins to do by hand today: `docker run ... tar
-czf ... sovereign_sqld_data`).** _Pros:_ zero new code — this is what the
CLI's current error message tells operators to do manually. _Cons:_ captures
every namespace at once undifferentiated (can't produce a
just-my-own-data user-scope export, which RFC 0084 requires); requires
direct Docker/volume access, which the `runtime` container (where the
backup-job worker actually runs) does not and should not have; not
meaningfully "automated" in the sense RFC 0084 asks for — it's the same
manual step the CLI already documents, just triggered differently.

## Recommendation

**Option A.** It's the only option that satisfies RFC 0084's actual
requirements (a per-scope, encrypted, one-file, downloadable archive) without
adding new infrastructure, and it's the option with the least genuinely new
surface — the read-a-database-via-SQL-and-write-a-plain-file technique is
already proven in this exact codebase, just pointed in the direction backup
needs instead of the direction cutover needed. Option B is worth
re-evaluating later _in addition_, as a possible operational-recovery
complement for larger instances, but not as a substitute for A — it can't
produce a single-user selective export on its own regardless of how it's
integrated.

A permanent, non-transitional module (e.g. `packages/db/src/sqld-backup.ts`)
should own two functions with roughly this shape:

- `dumpSqldNamespaceToFile(client: Client, destPath: string): Promise<DumpResult[]>`
  — the mirror of `cutoverSqliteFileToSqld`.
- Reuse `cutoverSqliteFileToSqld` itself for the restore direction rather
  than writing a second implementation.

`bin/sv.ts`'s `backup`/`restore` commands then gain a SQLite branch parallel
to the existing Postgres one: enumerate namespaces (platform default +
`'sovereign_auth'` + one `plugin_<slug>` per installed non-platform plugin,
from the plugin registry), dump each to a temp file, tar with avatars —
mirroring the existing Postgres branch's temp-dir-then-tar shape
(`bin/sv.ts:793`–`:824`) closely enough that the two branches read as the
same design applied to two dialects, not two unrelated features.

## Open questions

- **Per-namespace read consistency.** Does `@libsql/client`'s `Client`
  expose an interactive read transaction suitable for "read every table in
  this namespace as of one consistent moment"? Needs confirming against the
  library's actual API before finalizing the dump function's shape — not
  verified in this research pass.
- **Large-table streaming.** At what row/byte count does `SELECT *`
  `.all()`-into-memory stop being acceptable, and does the dump function need
  chunked/paged reads from day one or can that be a follow-up once real usage
  data exists?
- **Cross-namespace consistency.** No mechanism dumps every namespace at a
  single shared instant (each is a separate connection/read). This mirrors
  `pg_dump`'s own equivalent limitation when backing up multiple separate
  databases, and is likely an acceptable, well-precedented tradeoff — but
  worth stating explicitly in whatever RFC picks this up, not left implicit.
- **Does this become part of RFC 0084, or a new RFC?** RFC 0084 already
  assumes `sv backup`/`sv restore` "exist, unchanged" as a black box its
  worker shells out to; this research contradicts that assumption for the
  default dialect. Whichever RFC/epic task adopts this needs to either amend
  RFC 0084's assumption or land as a prerequisite epic task that RFC 0084's
  worker then depends on.
- **The two Docker-topology gaps** (no CLI tooling in `runner`, no
  `pg_dump` anywhere) block _any_ dialect's backup from working end-to-end
  in production regardless of this research's outcome — tracked separately
  in `docs/architecture-rules.md`, not resolved here.

## Next steps

Graduate to an RFC once the "per-namespace read consistency" open question
above is answered (a short spike against `@libsql/client`'s actual
transaction API, not a large effort) — that answer determines whether the
dump function's core loop needs a transaction wrapper from day one. The RFC
should cover: the new `sqld-backup.ts` module's exact interface, the
`bin/sv.ts` SQLite branch, and explicitly amend RFC 0084's "existing CLI,
unchanged archive logic" assumption to acknowledge SQLite needed new archive
logic, Postgres didn't. Until that RFC lands, `sv backup`/`sv restore`
continue to correctly refuse the SQLite dialect rather than silently
producing an incomplete archive.
