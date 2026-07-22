# Research 0003 — Horizontal scaling strategy (database, file storage, orchestration)

**Status:** Exploratory\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** `packages/db`, avatar/file storage (`runtime/src/storage.ts`,
`runtime/app/api/account/avatar/`), `docker-compose*.yml`\
**Related:** [0002](0002-multi-tenancy-vs-federation-direction.md) (scaling is
per-instance, not cross-tenant)

---

## Question

Given the federation direction ([0002](0002-multi-tenancy-vs-federation-direction.md)),
how should a single Sovereign instance scale horizontally — multiple runtime
replicas behind a load balancer, database replicas — ideally with changes
outside the main application where possible?

## Findings — what's already scale-friendly

- Auth is stateless-verifiable: middleware checks the signed HMAC session
  cookie offline and only falls back to `GET /api/verify` on a cache miss —
  no sticky sessions required at the load balancer.
- Postgres is already the documented production DB path; Drizzle is
  dialect-agnostic, so this has always been a connection-string change, not
  a code change.
- `/api/health` exists for load-balancer liveness probing per replica.
- Migrations already use a single-writer advisory lock
  (`schema_migrations` ledger, `docs/upgrade.md`) — multiple replicas booting
  concurrently won't double-run migrations.
- Notifications already have a documented multi-replica lever: flip
  `NOTIFICATION_TRANSPORT` from `sse` to `redis`
  (`docker-compose.prod.yml`, `docs/self-hosting.md:1030-1053`).

## Options considered

### 1. Database — SQLite can't be dropped, but can't scale as a plain file either

SQLite (via `better-sqlite3`) is an embedded, synchronous, single-process,
single-writer, local-file database — there is no way to have multiple app
replicas share one SQLite file over a network without either (a) changing
the client library to one that speaks a network protocol, or (b) building a
proxy that forwards every replica's queries to one process holding the file
— which is reinventing what already exists.

**Options evaluated:**

- **libSQL / `sqld`** (Turso's SQLite fork) — a server that speaks SQLite
  semantics over HTTP/gRPC, with a single primary and "embedded replica" mode
  (local file replicas that sync from the primary, serve local reads, and
  forward writes). Drizzle already has a first-class `libsql` dialect driver.
  This is the closest match to "SQLite behaving like a real client-server DB"
  without abandoning the SQLite file model self-hosters already trust.
- **rqlite** — Raft-replicated SQLite over HTTP. No Drizzle driver exists;
  writes go through Raft leader election, adding latency/complexity not
  needed if the actual goal is "one primary + read scaling" rather than full
  distributed consensus. Ruled out.
- **Building a bespoke SQLite server** — rejected outright; libSQL already
  solves this in production (backs Turso) and has ecosystem support Drizzle
  can consume directly.

**Caveat:** unlike the Postgres pooling case, this is not a pure
infra-level change. `better-sqlite3` is synchronous and in-process; libSQL's
client is async even for local access, which interacts with the
dialect-agnostic async contract already documented in
`docs/architecture-rules.md:42-47`. Adopting it means a new driver in
`packages/db/src/client.ts`, comparable in size to the existing per-dialect
schema duplication (`packages/db/src/schema/{sqlite,postgres}/`).

**Recommendation:** adopt libSQL/`sqld` as an opt-in third dialect path.
Plain-file SQLite stays the zero-dependency default for solo self-hosters;
`sqld` becomes the documented "scaled SQLite" tier for instances that want
horizontal scaling without moving to Postgres.

### 2. File storage — a CDN and shared storage solve different problems

Avatars currently live on local disk (`/app/data/avatars`) and are served by
reading that path directly — fine for one container, broken the moment there
are two runtime replicas, since replica B can't see files replica A wrote.

A CDN caches/serves content close to _readers_; it does not give multiple
writers a shared place to write. If replica A saves an avatar to its local
disk and replica B gets the next request for it, no CDN fixes that — there
still needs to be one authoritative origin every replica reads and writes
through. A "small CDN server" without a shared backing store would just add
a cache in front of a still-broken multi-origin setup.

**Options evaluated:**

- **S3 / cloud object storage** — ruled out on data-sovereignty and privacy
  grounds; conflicts with the project's self-hosted, no-cloud-dependency
  positioning.
- **MinIO (self-hosted)** — not wrong on privacy grounds (it's just a
  container you run, no cloud dependency), but disproportionate machinery for
  a low-file-volume workload, and requires an app-level change (disk read →
  S3 API call).
- **Shared network volume (NFS/SMB)** mounted at `/app/data/avatars` on every
  runtime replica — needs **zero app code changes**, since the existing
  disk-read code keeps working unmodified; it's still "a path on disk," just
  now a shared one. At the current low file volume, NFS's latency overhead is
  a non-issue.

**Recommendation:** shared NFS/SMB volume as the default fix (no code
change). Document MinIO as the upgrade path if file volume grows enough that
the shared-mount model becomes a bottleneck. A CDN/edge-cache layer can be
added later purely as a read-latency optimization _in front of_ whichever
origin is chosen — additive, not a substitute for shared storage.

### 3. Orchestration — Compose can't do this alone

`docker-compose.yml`/`docker-compose.prod.yml` are single-container-per-service
by design; Compose's `deploy.replicas` doesn't apply outside Swarm mode. Real
horizontal scaling needs an orchestration layer above Compose — Docker Swarm,
Nomad, or Kubernetes — as a new deployment artifact (e.g. a reference Helm
chart or Nomad job spec), not a change to the existing Compose files.

**No counter-arguments raised; accepted as-is.**

## Recommendation summary

| Layer               | Fix                                                                | App code change?                  |
| ------------------- | ------------------------------------------------------------------ | --------------------------------- |
| Database (SQLite)   | Adopt libSQL/`sqld` as opt-in scaled-SQLite dialect                | Yes — new driver in `packages/db` |
| Database (Postgres) | Already scalable via managed HA/pooler                             | No                                |
| File storage        | Shared NFS/SMB volume as default; MinIO as documented upgrade path | No (NFS) / Yes (MinIO)            |
| Orchestration       | Reference k8s/Nomad manifests above Compose                        | No                                |

## Open questions

- Does the libSQL driver swap want its own RFC before implementation, or ship
  as a phased addition to the existing per-dialect schema pattern?
- At what file volume does the NFS shared-mount model stop being adequate,
  and should that threshold be documented for operators?

## Next steps

Graduate to two RFCs once scoped:

1. **libSQL/`sqld` as a scaled-SQLite dialect** — driver, schema/migration
   compatibility, and deployment shape (embedded replica vs. remote-only).
2. **Shared file storage reference topology** — NFS/SMB as default, MinIO as
   documented upgrade path, plus the orchestration manifests (k8s/Nomad) this
   depends on.
