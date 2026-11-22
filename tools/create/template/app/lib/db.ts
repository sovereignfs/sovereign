import { openDatabase, type Database } from '@sovereignfs/auth/database';

let made: Promise<Database> | undefined;

/**
 * The app's database, on the form `__PREFIX___DB_DIALECT` names: a SQLite file, sqld, or PostgreSQL (contracts/env.md §2). One for the
 * process, opened when it is first used so that building needs none. The sign-in's tables, the SDK's and the app's own are all in it.
 * Statements use `?` placeholders on every form; `database.transaction(tx => …)` gives the executor a transaction runs on.
 */
export function database(): Promise<Database> {
  made ??= openDatabase({ prefix: '__PREFIX__' }).catch((error: unknown) => {
    made = undefined;
    throw error;
  });
  return made;
}
