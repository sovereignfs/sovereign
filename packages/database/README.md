# @sovereignfs/database

One async database interface over **sqld**, **PostgreSQL** and a **SQLite file**, with a
migration runner and the helpers for the data-layer rules in
[`docs/architecture-rules.md`](../../docs/architecture-rules.md). Apps pick the dialect
with `SV_DB_DIALECT` (the rules for every variable are in
[`contracts/env.md`](../../contracts/env.md)); nothing infers it from a URL.

> Not yet published to npm. It is `private` until the first app outside this repository
> needs it.

```ts
import { defineConfig } from '@sovereignfs/config';
import {
  connect,
  databaseVariables,
  migrate,
  readMigrations,
  resolveDatabase,
} from '@sovereignfs/database';

const config = defineConfig({ prefix: 'SV', variables: { ...databaseVariables } });
const settings = resolveDatabase(config.load(), { prefix: 'SV', required: true });

const db = await connect(settings, { createNamespace: true });
await migrate(db, readMigrations(new URL(`./migrations/${db.family}`, import.meta.url).pathname));

await db.run('select count(*) as n from notes where owner = ?', ['me']); // { rows: [{ n: 3 }], rowsAffected: 0 }
await db.transaction(async (tx) => {
  await tx.run('insert into notes (id, title) values (?, ?)', ['a', 'first']);
});
db.drizzle; // the typed query builder, for the dialect's own schema
```

## One interface

- **Always async**, even on SQLite, so no caller depends on what is underneath.
- **`?` placeholders everywhere.** PostgreSQL's `$1` is rewritten.
- **Integers are numbers on every dialect.** `bigint` and `count(*)` come back as
  numbers, where node-postgres returns strings; a value that does not fit exactly throws
  instead of losing digits.
- **`transaction(fn)`** commits when `fn` returns and rolls back when it throws. Inside
  it (or inside `session`), use the executor you are given, never the database itself:
  that would use another connection on PostgreSQL and wait forever on a SQLite file, so it
  throws the same error on every dialect.
- **`session(fn)`** runs on one connection. PostgreSQL session-scoped primitives
  (advisory locks, `SET`, temporary tables) belong there and nowhere else.
- **`ping(timeoutMs)`** and **`close()`**.

`db.drizzle` is the typed builder for that dialect (`family` is `'sqlite'` for sqld and a
file, `'postgres'` otherwise). Write the schema twice, once per family, and keep the pair
in step with `schemaDifferences` (below).

## Dialects

| `SV_DB_DIALECT` | Variables                                                                   | Notes                                                                                   |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `sqld`          | `SV_SQLD_URL`, `SV_SQLD_ADMIN_URL`, `SV_SQLD_NAMESPACE` (default `default`) | **Every request names its namespace** in `x-namespace`, `default` included (see below). |
| `sqlite`        | `SV_SQLITE_URL` (`file:./data/core.db`)                                     | WAL, foreign keys on. Operations on one file run one at a time within the process.      |
| `postgres`      | `SV_POSTGRES_URL` (a secret; `_FILE` works), `SV_POSTGRES_POOL_MAX` (min 2) | One connection holds the migration lock while the migrations run on another.            |

**sqld and the `Host` header.** With namespaces enabled and no `x-namespace` header, sqld
takes the namespace from the first label of the `Host` header, so `http://127.0.0.1:8080`
is read as the namespace "127" and answers 404. The client sends the header on every
request, so the host in the URL does not matter. This needs sqld 0.24.33 or later.

**Native code loads only when used.** `@libsql/client` is imported when a SQLite or sqld
database is opened, never at the top of the package, so a PostgreSQL deployment (or a musl
image without a matching binary) never loads it.

## Migrations

```ts
await migrate(db, readMigrations('./migrations/postgres')); // 0000_create_notes.sql, 0001_…
```

A folder per dialect, `NNNN_name.sql`, statements separated by `--> statement-breakpoint`
(drizzle-kit writes it). The runner keeps its own record, `sv_migrations`, and:

- applies each migration **exactly once**, even when several instances start together
  (an advisory lock on PostgreSQL; a write transaction that re-checks on SQLite and sqld);
- makes each migration **atomic**: its statements and its record commit together or not
  at all;
- **refuses to rewrite history**: a migration changed after it ran, missing from the
  folder, or numbered before one that already ran is an error.

## Paired schemas

```ts
import { assertSchemaParity, schemaDifferences } from '@sovereignfs/database/testing';

expect(schemaDifferences(sqliteSchema, postgresSchema)).toEqual([]);
```

Compares the tables, each column's name, logical type, nullability and primary key, and the
indexes, unique constraints and foreign keys. Physical types may differ on purpose (a
millisecond timestamp is `bigint` on PostgreSQL and `integer` on SQLite, see
`sqliteTimestampMs` and `postgresTimestampMs`). It also flags any identifier PostgreSQL
would silently truncate (over 63 bytes).

## Testing

`@sovereignfs/database/testing` also exports `createTestDatabase()`, for an app's own
`*.db.test.ts` files: a private namespace, file or schema on the CI leg's database, with
`open()` for more connections and `cleanup()`.

Tests that need a real database are named `*.db.test.ts` and run against the dialect named
by `SV_DB_DIALECT`, once per dialect in CI (`pnpm test:db`). How to start the servers
locally is in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
