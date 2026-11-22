/**
 * `@sovereignfs/auth/database` — the app's own database on any of the three forms the suite runs (auth.md §3, `contracts/env.md` §2):
 * a SQLite file, sqld, or PostgreSQL, chosen by `<PREFIX>_DB_DIALECT` and read from the app's variables, as core reads its own. It is the
 * database the package takes, and the app's own tables can live in it too. `@sovereignfs/database`, the code core runs on, is bundled
 * into this package; the driver is the app's (`@libsql/client` for a file and sqld, `pg` for PostgreSQL), loaded only for its form.
 */
import { defineConfig, type Env } from '@sovereignfs/config';
import { connect, databaseVariables, resolveDatabase, type Database } from '@sovereignfs/database';

export {
  DIALECTS,
  databaseVariables,
  migrate as runMigrations,
  readMigrations,
} from '@sovereignfs/database';
export type {
  Database,
  Dialect,
  Executor,
  Migration,
  MigrateResult,
  Row,
} from '@sovereignfs/database';

/**
 * Opens the app's database from its variables (`<PREFIX>_DB_DIALECT` and the address it needs). On sqld with an admin address, the app's
 * namespace is made when it is not there. With `direct`, PostgreSQL is reached at `<PREFIX>_POSTGRES_DIRECT_URL` when the instance gives
 * one: the server itself, never a pooler, for what holds one connection throughout (the migrations' lock). A wrong or missing variable
 * stops the app, naming the variable and never its value.
 */
export async function openDatabase({
  prefix,
  env = process.env,
  direct = false,
}: {
  prefix: string;
  env?: Env;
  direct?: boolean;
}): Promise<Database> {
  const directUrl =
    env[`${prefix}_POSTGRES_DIRECT_URL`] ?? env[`${prefix}_POSTGRES_DIRECT_URL_FILE`];
  const chosen: Env =
    direct && directUrl !== undefined && directUrl !== ''
      ? {
          ...env,
          [`${prefix}_POSTGRES_URL`]: env[`${prefix}_POSTGRES_DIRECT_URL`],
          [`${prefix}_POSTGRES_URL_FILE`]: env[`${prefix}_POSTGRES_DIRECT_URL_FILE`],
        }
      : env;
  const values = defineConfig({ prefix, variables: databaseVariables }).load(chosen);
  const resolved = resolveDatabase(values, { prefix, required: true });
  return connect(resolved, {
    createNamespace: resolved.dialect === 'sqld' && resolved.adminUrl !== undefined,
  });
}
