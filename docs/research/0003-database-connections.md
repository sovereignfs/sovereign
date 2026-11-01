# Research 0003 — Many apps on one PostgreSQL server

|                     |                                                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | Recommended, for review in its pull request. The tasks are [13.22–13.26](../epics/operator-cli.md), in milestone M12 of the roadmap                                                                                                                      |
| **Date**            | November 2026                                                                                                                                                                                                                                            |
| **Author**          | Claude Code                                                                                                                                                                                                                                              |
| **Scope**           | [operator-cli](../specs/operator-cli.md) §4, §6.4; [`contracts/suite.md`](../../contracts/suite.md) §1.3, §1.7; [`contracts/app-manifest.md`](../../contracts/app-manifest.md) §2, §3; [`contracts/env.md`](../../contracts/env.md) §2; the app template |
| **Versions tested** | Core 0.83.0 and toolkit 0.4.0 on a test instance (PostgreSQL 18, arm64); `pg-pool` as installed in the workspace; PgBouncer images as published on 2026-11-01                                                                                            |

---

## Question

An instance runs one PostgreSQL server, which core and every hosted app share, and an operator may host more than ten apps. Can one
server hold that safely, and what should the toolkit offer: limits on what each app may take, a connection pooler, or both? And how does
an operator set it, since a hand-edited `suite.yml` has already been shown to leave the instance in a state `sv push` refuses?

## Method

- **The live test instance** (container server, `environment: development`, core 0.83.0, Mailpit): `SHOW max_connections`,
  `SHOW superuser_reserved_connections`, and `pg_stat_activity` grouped by role and state.
- **The code:** how `sv apply` makes roles (`ensureDatabase` in `tools/cli/src/apply/docker.ts`), how core makes its pool (`createPool`
  in `packages/database/src/postgres.ts`), and the app template's pool, migrations and token store (`lib/db.ts`, `lib/migrate.ts`,
  `lib/stores.ts`).
- **`pg-pool`'s defaults**, read from the installed package.
- **A search of core, the shared packages and the template** for the features a transaction pooler breaks: session advisory locks,
  named prepared statements, `SET`, `LISTEN`/`NOTIFY` and temporary tables.
- **The registries,** for PgBouncer images published for linux/amd64 and linux/arm64, and Alpine's package.

**Not done:** a load test, and PgBouncer actually run against core or an app. The numbers below are configuration and one quiet
instance; how many connections a busy app takes was not measured.

## Findings

1. **Nothing is bounded today.** The server runs PostgreSQL's defaults: `max_connections` 100, of which 3 are kept for the superuser,
   so 97 are open to core and the apps. `ensureDatabase` makes each role with `LOGIN` and a password and no `CONNECTION LIMIT`. Core's
   pool is `SV_POSTGRES_POOL_MAX`, default 10. The template's pool is fixed at 10 in `lib/db.ts`, and does not read
   `<PREFIX>_POSTGRES_POOL_MAX`, although `contracts/env.md` §2 names it as a shared variable.
2. **The steady cost is small.** Neither core nor the template sets an idle timeout, so `pg-pool`'s default applies: a connection idle
   for 10 seconds is closed. On the test instance core held 1 connection; the rest were PostgreSQL's own background workers. The sum of
   every pool's maximum is a ceiling reached only when every service is busy at once, not what an instance costs.
3. **The risk is a burst, and nothing contains it.** Eleven services at 10 each can ask for 110 connections against 97. One app with
   long queries, or a leak, can take every connection the server has, and core, which everyone signs in through, waits behind it.
   Because no role has a limit, nothing stops one app from starving the rest.
4. **A transaction pooler breaks three things here, and only three.** Each is a session advisory lock: core's migrations
   (`packages/database/src/migrate.ts`, taken on one pinned connection, as the repository's rule for session-scoped work requires), the
   template's migrations, and the template's per-person token-refresh lock, which runs on the request path and holds the lock across a
   call to core. Under transaction pooling each statement may land on a different server connection, so a session lock would be taken on
   one and released on another, or left held for whoever gets that connection next. No named prepared statements, `SET`, `LISTEN` or
   temporary tables are used.
5. **Only transaction pooling would save connections.** In session mode a client keeps its server connection until it disconnects, and
   our pools already disconnect after 10 seconds idle, so a session pooler adds a hop and saves nothing.
6. **There is no official PgBouncer image.** The images for both architectures on Docker Hub are third-party: `pgbouncer/pgbouncer`
   (maintained by Canary9, 1.25.x, rebuilt weekly) and `edoburu/pgbouncer`. Bitnami's no longer exists. Alpine 3.22 packages PgBouncer
   1.24.0. Every other image an instance runs is a Docker Official Image (PostgreSQL, Caddy), its project's own (Mailpit) or this
   repository's.
7. **A new image in `suite.lock` meets two problems the first real deployment found.** A server whose toolkit is older than the
   repository's refuses a lock that names an image it does not know, and `sv deploy` cannot bring that toolkit up to date: only running
   `sv server bootstrap` again does. And after `suite.yml` is edited by hand, `sv push` refuses a lock that no longer matches, says only
   "fix these", and no command refreshes it. A pooler's image would be such an image, and its settings would be such an edit.

## Options

|       | What                                     | For                                                                                                          | Against                                                                                                      |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **A** | Nothing                                  | No work                                                                                                      | Finding 3 stands: one app can starve core                                                                    |
| **B** | Guardrails only: limits and sizes        | Small; bounds every app; makes the numbers visible                                                           | A busy instance with many apps is still capped by the server's connections                                   |
| **C** | **Guardrails, then an opt-in PgBouncer** | B's safety for everyone, and multiplexing for the operators who need it, with no change for those who do not | The pooler is real work: an image, credentials, a contract change for apps                                   |
| **D** | A pooler always on                       | One path for every instance                                                                                  | Every instance pays for a moving part most do not need, and core and today's apps would have to change first |
| **E** | A pooler per app (sidecar)               | Isolation                                                                                                    | Many poolers multiply connections to the server instead of sharing them, which is the opposite of the point  |

## Recommendation: C

### 1. Guardrails, for every instance

- **`suite.yml`** gains `database.maxConnections` (default 100, PostgreSQL's own), `database.connections.core` and
  `database.connections.app` (each hosted app), both defaulting to 10, and `apps.<name>.connections` for one app. The defaults change
  nothing a service does today: core's and the template's pools are 10.
- **`sv apply`** sets `max_connections` on the server only when it is not 100, so an instance that says nothing is not restarted (a
  change restarts it, and the deployment says so before it does), sets each role's `CONNECTION LIMIT` on every deployment, so a limit
  that changes is applied, and gives each pool its size: `SV_POSTGRES_POOL_MAX` to core and `<PREFIX>_POSTGRES_POOL_MAX` to each app,
  which the template then reads. _Built:_ a role's limit is its pool size plus 2, so a connection that a killed container left behind
  does not keep its replacement out.
- **A budget, checked:** the limits of core and of each app that has a database may add up to no more than `maxConnections` less 3, the
  superuser's reserve, which `sv apply` and backups connect through. _Built:_ `sv apply` checks it, since only the manifest says which
  apps have a database, and refuses when the operator set `maxConnections` or `connections`; when they set none it warns and deploys,
  so an instance that already has more apps than the defaults hold keeps deploying. The commands that set the limits (13.23) check it
  as well. Eight apps at the defaults are enough to exceed it.

### 2. Configured and seen from `sv`

Never by editing `suite.yml`, which finding 7 shows leaves the lock behind:

- `sv database` shows the server's version, `maxConnections`, every limit and the budget left.
- `sv database set [--max-connections N] [--core N] [--app N]` and `sv app update NAME --connections N` change them. Like every command
  that writes the files, they check the result and refresh `suite.lock`.
- `sv doctor` and `sv status` show the connections each role holds against its limit, and the server's total against
  `max_connections`, so an operator sees pressure before it is a failure.

### 3. An opt-in PgBouncer, for operators who need it

- **Turned on and off from `sv`:** `sv database pooler enable [--pool-size N] [--max-clients N]` and `sv database pooler disable` set
  `database.pooler` and pin the pooler's image in the lock.
- **`sv apply` runs `sv-pooler`** (PgBouncer in transaction mode) on the database server's network and each app's, with the database
  server behind it. Turning it off removes it; it keeps no data.
- **Core never goes through it.** Its migrations and its pinned-client work are session-scoped (finding 4), and it is one service.
- **An app goes through it only if its manifest says it can** (`database.pooling: transaction`). An app that does not say so connects to
  the server directly, as today, so an app made before this, or one that needs a session, keeps working whatever the operator turns on.
- **Every app with a database is also given `<PREFIX>_POSTGRES_DIRECT_URL`,** the server itself, for migrations and the token-refresh
  lock. The template moves its migrations and that lock to a small direct pool, and declares `transaction`.
- **Credentials:** PgBouncer checks each app's role with SCRAM against an `auth_file` that `sv apply` writes into `secrets/` from the
  role passwords it generated. Nothing new is a secret the operator holds.
- **Sizes:** an app's pool on the server never exceeds its role's limit, so the guardrails hold with the pooler on; `--max-clients`
  bounds what apps may open against the pooler.
- **The image is this repository's own:** `ghcr.io/sovereignfs/pgbouncer`, built from Alpine's package and released with the toolkit,
  pinned by digest. A third-party image pinned by digest was the alternative; it would be the only image an instance runs that is neither
  official, its project's own, nor this repository's, for a component that sees every app's database credentials.

### 4. The order

1. The guardrails.
2. Configuring them from `sv`, and seeing the connections.
3. The deployment and lock fixes of finding 7. They come before the pooler, which needs both, and they are worth doing on their own:
   they are what stopped the first real deployment.
4. Apps that can be pooled: the manifest field, the direct address, and the template moved to them.
5. The pooler.

## Not now

- **Tuning numbers automatically** from the server's memory or the apps' traffic: the defaults and `sv database set` are enough until
  there is something measured to tune from.
- **pgcat, Odyssey or Supavisor:** each does more than one instance needs (sharding, many tenants across servers) and is a larger thing
  to run.
- **A pooler for core:** core is one service with session-scoped work; a limit is what it needs.

## To settle in the tasks

- The default numbers, once the connections an app holds under load have been measured (13.22).
- How the pooler's image is built, tested and released with the toolkit (13.26).

## Changelog

| Date       | Change                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-01 | First version, with the tasks it proposes.                                                                                                                                                                               |
| 2026-11-02 | Guardrails built (task 13.22): a role's limit is its pool plus 2, `max_connections` is passed only when it is not 100, and a budget the operator did not set is a warning. Core's default is 10, as its pool is, not 20. |
