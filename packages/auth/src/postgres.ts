/**
 * `@sovereignfs/auth/postgres` — an app's own PostgreSQL pool as the database the package takes (auth.md §3): `@sovereignfs/database`'s `fromPostgresPool`, the same
 * code core runs on, bundled into this package. The pool stays the app's.
 */
export { fromPostgresPool as postgresDatabase } from '@sovereignfs/database';
export type { PostgresDatabase } from '@sovereignfs/database';
