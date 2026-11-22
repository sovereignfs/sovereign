import { createHash } from 'node:crypto';
import { migrate, type Database } from '@sovereignfs/database';
import { ACCOUNT_MIGRATIONS_TABLE, accountMigrations } from './migrations.js';

/** How long a password an app stored before the package can be moved at a sign-in (RFC 0007 amendment 1 A1). */
export const LEGACY_PASSWORD_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

/** What an app's own better-auth tables were called before the package, and what the package calls them. */
const RENAMES = [
  ['user', 'users'],
  ['session', 'sessions'],
  ['account', 'accounts'],
  ['verification', 'verifications'],
  ['rate_limit', 'rate_limits'],
  ['two_factor', 'two_factors'],
  ['passkey', 'passkeys'],
] as const;

/** The steps of a move, recorded as each is done, so that a move stopped half way goes on from where it stopped. */
const STEPS_TABLE = 'sv_auth_adoption';

export type AdoptionResult = 'none' | 'moved' | 'done';

export type AdoptionOptions = {
  /**
   * Whether the app signs people in through core. Its accounts from core then keep their rows with their tokens cleared, and a session of
   * an account whose only way in is core is checked against core at its next request (A2). Give the core sign-in's migrations first.
   */
  core?: { migrate: (database: Database) => Promise<unknown> };
  now?: number;
};

const quote = (database: Database, name: string) =>
  database.family === 'postgres' ? `"${name}"` : `\`${name}\``;

async function tableExists(database: Database, name: string): Promise<boolean> {
  const { rows } =
    database.family === 'postgres'
      ? await database.run(
          'select 1 as found from information_schema.tables where table_schema = current_schema() and table_name = ?',
          [name],
        )
      : await database.run(
          "select 1 as found from sqlite_master where type = 'table' and name = ?",
          [name],
        );
  return rows.length > 0;
}

async function columnsOf(database: Database, table: string): Promise<Set<string>> {
  const { rows } =
    database.family === 'postgres'
      ? await database.run(
          'select column_name as name from information_schema.columns where table_schema = current_schema() and table_name = ?',
          [table],
        )
      : await database.run(`pragma table_info(${table})`);
  return new Set(rows.map((row) => String(row.name)));
}

async function stepsDone(database: Database): Promise<Set<string>> {
  const time = database.family === 'postgres' ? 'bigint' : 'integer';
  await database.run(
    `create table if not exists ${STEPS_TABLE} (step text primary key, done_at ${time} not null)`,
  );
  const { rows } = await database.run(`select step from ${STEPS_TABLE}`);
  return new Set(rows.map((row) => String(row.step)));
}

/**
 * **Moves an app's own better-auth store onto the package's tables** (RFC 0007 §6 and amendment 1, auth.md §8.1, §10). For an app that
 * kept better-auth's tables under its own, singular names before the package: run once at start-up, before the package's migrations,
 * on the store the package will use (on PostgreSQL, a pool whose `search_path` is the app's auth schema). It:
 *
 * 1. renames the tables to the package's names, adds the columns the package has and the app did not (`timezone`, `locale`,
 *    `deactivated_at`), makes the tables of the second step and passkeys where the app had none, and records the package's first
 *    migration as run, so it does not run again;
 * 2. runs the package's migrations (the marks' table) and, with `core`, the core sign-in's;
 * 3. marks every account that has a password, for 90 days (A1); clears the tokens `genericOAuth` kept on accounts from core; and gives
 *    each session of an account whose only way in is core a core sign-in record to be checked at its next request (A2).
 *
 * Nothing is deleted. Each step is recorded in `sv_auth_adoption` with its own transaction, so a move that stops goes on where it
 * stopped. It does nothing to a store made on the package, or one with no accounts yet (`'none'`), or to one already moved (`'done'`).
 * One-way: an older release of the app cannot read the renamed tables.
 */
export async function adoptAccountTables(
  database: Database,
  options: AdoptionOptions = {},
): Promise<AdoptionResult> {
  const now = options.now ?? Date.now();
  const done = await stepsDone(database);
  if (done.has('marked')) return 'done';
  if (!done.has('renamed')) {
    if (!(await tableExists(database, 'user'))) return 'none';
    await renameOnto(database, now);
  }
  await migrate(database, accountMigrations(database.family), { table: ACCOUNT_MIGRATIONS_TABLE });
  if (options.core) await options.core.migrate(database);
  await markAndClear(database, now, options.core !== undefined);
  return 'moved';
}

async function renameOnto(database: Database, now: number): Promise<void> {
  const pg = database.family === 'postgres';
  const present = new Map<string, boolean>();
  for (const [from] of RENAMES) present.set(from, await tableExists(database, from));
  const userColumns = await columnsOf(database, 'user');
  const twoFactorColumns = present.get('two_factor')
    ? await columnsOf(database, 'two_factor')
    : new Set<string>();
  const time = pg ? 'timestamp with time zone' : 'integer';
  const no = pg ? 'false' : '0';
  const yes = pg ? 'true' : '1';
  const [first] = accountMigrations(database.family);
  if (!first) throw new Error('The package has no first migration.');
  await database.transaction(async (tx) => {
    for (const [from, to] of RENAMES)
      if (present.get(from)) await tx.run(`alter table ${quote(database, from)} rename to ${to}`);
    for (const [column, type] of [
      ['timezone', 'text'],
      ['locale', 'text'],
      ['deactivated_at', time],
    ] as const)
      if (!userColumns.has(column)) await tx.run(`alter table users add column ${column} ${type}`);
    if (!userColumns.has('two_factor_enabled'))
      await tx.run(
        `alter table users add column two_factor_enabled ${pg ? 'boolean' : 'integer'} default ${no}`,
      );
    await tx.run(`update users set two_factor_enabled = ${no} where two_factor_enabled is null`);
    if (present.get('two_factor')) {
      if (!twoFactorColumns.has('verified'))
        await tx.run(
          `alter table two_factors add column verified ${pg ? 'boolean' : 'integer'} default ${yes}`,
        );
      if (!twoFactorColumns.has('failed_verification_count'))
        await tx.run(
          'alter table two_factors add column failed_verification_count integer default 0',
        );
      if (!twoFactorColumns.has('locked_until'))
        await tx.run(`alter table two_factors add column locked_until ${time}`);
      await tx.run(`update two_factors set verified = ${yes} where verified is null`);
      await tx.run(
        'update two_factors set failed_verification_count = 0 where failed_verification_count is null',
      );
    } else {
      await tx.run(
        `create table two_factors (id text primary key not null, secret text not null, backup_codes text not null, user_id text not null references users(id) on delete cascade, verified ${pg ? 'boolean' : 'integer'} default ${yes} not null, failed_verification_count integer default 0 not null, locked_until ${time})`,
      );
      await tx.run('create unique index two_factors_user_id_idx on two_factors (user_id)');
    }
    if (!present.get('passkey')) {
      await tx.run(
        `create table passkeys (id text primary key not null, name text, public_key text not null, user_id text not null references users(id) on delete cascade, credential_id text not null, counter integer not null, device_type text not null, backed_up ${pg ? 'boolean' : 'integer'} not null, transports text, created_at ${time}, aaguid text)`,
      );
      await tx.run('create index passkeys_user_id_idx on passkeys (user_id)');
      await tx.run('create unique index passkeys_credential_id_idx on passkeys (credential_id)');
    }
    // The package's first migration made what is now here: recorded as run, as the runner records one (`@sovereignfs/database`).
    await tx.run(
      `create table if not exists ${ACCOUNT_MIGRATIONS_TABLE} (name text primary key, checksum text not null, applied_at ${pg ? 'bigint' : 'integer'} not null)`,
    );
    await tx.run(
      `insert into ${ACCOUNT_MIGRATIONS_TABLE} (name, checksum, applied_at) values (?, ?, ?)`,
      [first.name, createHash('sha256').update(first.sql).digest('hex'), now],
    );
    await tx.run(`insert into ${STEPS_TABLE} (step, done_at) values ('renamed', ?)`, [now]);
  });
}

async function markAndClear(database: Database, now: number, core: boolean): Promise<void> {
  await database.transaction(async (tx) => {
    // A1: every account with a password, which may be a hash of the password itself; one already of a sign-in value is moved by
    // nothing and simply runs out.
    await tx.run(
      `insert into sv_legacy_passwords (user_id, until)
         select distinct user_id, cast(? as bigint) from accounts where provider_id = 'credential' and password is not null`,
      [now + LEGACY_PASSWORD_PERIOD_MS],
    );
    // A2: core's refresh token is the SDK's alone; what genericOAuth kept goes.
    await tx.run(
      `update accounts set access_token = null, refresh_token = null, id_token = null, access_token_expires_at = null,
         refresh_token_expires_at = null where provider_id = 'sovereign'`,
    );
    if (core) {
      // A session of an account whose only way in is core is checked against core at its next request; one of an account with a
      // password or a passkey cannot be told apart from a local one, and runs to its own end.
      await tx.run(
        `insert into sv_core_sign_ins (session_id, sub, sid, id_token, checked_at)
           select s.id, a.account_id, null, null, 0 from sessions s
             join accounts a on a.user_id = s.user_id and a.provider_id = 'sovereign'
            where not exists (select 1 from accounts c where c.user_id = s.user_id and c.provider_id <> 'sovereign')
              and not exists (select 1 from passkeys p where p.user_id = s.user_id)
              and not exists (select 1 from sv_core_sign_ins k where k.session_id = s.id)`,
      );
    }
    await tx.run(`insert into ${STEPS_TABLE} (step, done_at) values ('marked', ?)`, [now]);
  });
}
