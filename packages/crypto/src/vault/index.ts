/**
 * `@sovereignfs/crypto/vault`: the vault of an app that runs with no core (sdk §9.5, RFC 0005 §4's last paragraph), on the app's own
 * database. It holds what core's vault holds (core-app §5.3), as the same records: a person's account keys, the account key wrapped
 * once for each way in, and their keys for the app. It opens none of them. The browser makes every record and unwraps every key
 * (`@sovereignfs/crypto/web`'s unlock routine); the server stores JSON and checks its shape.
 *
 * Server-only, and it imports nothing of core's: an app gives it any database with `run` and `transaction`, as
 * `@sovereignfs/database` has, and creates its tables from `vaultMigrations`.
 */
import {
  checkBase64Url32,
  checkClientId,
  checkRecord,
  checkSignature,
  checkWayIn,
  VaultError,
} from './checks.js';

export {
  checkBase64Url32,
  checkClientId,
  checkRecord,
  checkSignature,
  checkWayIn,
  VaultError,
} from './checks.js';
export type { StoredWayIn } from './checks.js';

/** A row, as a database driver returns one. */
export type VaultRow = Record<string, unknown>;

/** What the vault runs a statement on. Placeholders are `?`, as `@sovereignfs/database` takes them on every dialect. */
export interface VaultExecutor {
  run(sql: string, args?: readonly unknown[]): Promise<{ rows: VaultRow[]; rowsAffected: number }>;
}

/** The database the vault keeps its tables in. `@sovereignfs/database`'s `Database` is one. */
export interface VaultDatabase extends VaultExecutor {
  readonly family: 'sqlite' | 'postgres';
  /** Runs `fn` in a transaction: committed when it returns, rolled back when it throws. */
  transaction<T>(fn: (tx: VaultExecutor) => Promise<T>): Promise<T>;
}

/** One migration, in `@sovereignfs/database`'s shape: a name and its statements, split at `--> statement-breakpoint`. */
export interface VaultMigration {
  readonly name: string;
  readonly sql: string;
}

/** The table the vault's migrations are recorded in, apart from the app's own (`migrate(db, vaultMigrations(…), { table })`). */
export const VAULT_MIGRATIONS_TABLE = 'sv_key_migrations';

const BREAK = '\n--> statement-breakpoint\n';

function tables(timestamp: 'integer' | 'bigint'): string {
  return [
    'CREATE TABLE sv_key_settings (\n\tname text PRIMARY KEY NOT NULL,\n\tvalue text NOT NULL\n)',
    `CREATE TABLE sv_key_accounts (\n\tuser_id text PRIMARY KEY NOT NULL,\n\tsuite integer NOT NULL,\n\tunlock_salt text NOT NULL,\n\tsigning_public text NOT NULL,\n\tsigning_private text NOT NULL,\n\tkit_confirmed integer DEFAULT 0 NOT NULL,\n\tcreated_at ${timestamp} NOT NULL\n)`,
    `CREATE TABLE sv_key_wraps (\n\tuser_id text NOT NULL,\n\tway text NOT NULL,\n\twrap_id text NOT NULL,\n\trecord text NOT NULL,\n\tprf_salt text,\n\tcreated_at ${timestamp} NOT NULL,\n\tCONSTRAINT sv_key_wraps_pk PRIMARY KEY (user_id, way, wrap_id)\n)`,
    `CREATE TABLE sv_key_apps (\n\tuser_id text NOT NULL,\n\tclient_id text NOT NULL,\n\tapp_key text NOT NULL,\n\tidentity text NOT NULL,\n\tsignature text NOT NULL,\n\tcreated_at ${timestamp} NOT NULL,\n\tCONSTRAINT sv_key_apps_pk PRIMARY KEY (user_id, client_id)\n)`,
  ].join(BREAK);
}

/**
 * The vault's tables for a dialect family: `sqlite` for a SQLite file and sqld, `postgres` for PostgreSQL. The columns are core's
 * (`key_accounts`, `key_wraps`, `key_apps`), under `sv_key_` so they never meet an app's own; a timestamp is `bigint` on PostgreSQL,
 * in milliseconds. There is no table of session secrets: an app keeps its session's secret in its own session (`newSessionSecret`),
 * so it goes when the session goes.
 */
export function vaultMigrations(family: VaultDatabase['family']): VaultMigration[] {
  return [{ name: '0000_vault', sql: tables(family === 'postgres' ? 'bigint' : 'integer') }];
}

/** The ways in an app's vault keeps: the password (or the passphrase, which is kept as one) and the kit. */
export type AppVaultWay = 'password' | 'kit';
const WAYS: ReadonlySet<AppVaultWay> = new Set<AppVaultWay>(['password', 'kit']);

/** An account's keys, in the shape the unlock routine reads (`VaultActions.read`). */
export interface VaultAccountRow {
  readonly suite: number;
  readonly unlockSalt: string;
  readonly signingPublic: string;
  /** The wrapped private half, as JSON. */
  readonly signingPrivate: string;
  readonly kitConfirmed: boolean;
}

export interface VaultWayInRow {
  readonly way: AppVaultWay;
  readonly id: string;
  /** The record, as JSON. */
  readonly record: string;
}

export interface VaultAppRow {
  readonly clientId: string;
  readonly appKey: string;
  readonly identity: string;
  readonly signature: string;
}

/** The vault id was made once and is gone, while accounts that were made with it are still there. */
export class VaultIdLost extends Error {
  override name = 'VaultIdLost';
  constructor() {
    super(
      'This vault has accounts and no vault id. Every key was made with the id, so a new one would lock everyone out: restore the ' +
        'sv_key_settings table from a backup.',
    );
  }
}

const VAULT_ID = 'vault_id';
const randomBase64Url = (bytes: number): string => {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

/**
 * A session's secret (RFC 0005 §5): 32 random bytes, base64url. The app keeps it with its own session, gives it only to that
 * session's pages, and so loses it when the session ends however it ends. With it gone, what a browser kept opens nothing.
 */
export const newSessionSecret = (): string => randomBase64Url(32);

/**
 * An app's vault. Every method is for one person, the one the caller names, which the app's server takes from its own session and
 * never from a request. `sub` is the app's own stable id for the person: the records are bound to it.
 */
export class AppVault {
  readonly #database: VaultDatabase;
  readonly #now: () => number;

  constructor(database: VaultDatabase, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  /**
   * The vault id (base64url, 32 bytes): where core's instance id goes in the password derivation (RFC 0005 §1.1), made the first
   * time it is asked for and never again. The sign-in page is given it. Refused with `VaultIdLost` when accounts exist and no id
   * does, since a new one would make every key unreachable.
   */
  async vaultId(): Promise<string> {
    const found = await this.#readId(this.#database);
    if (found) return found;
    return this.#database.transaction(async (tx) => {
      const again = await this.#readId(tx);
      if (again) return again;
      const accounts = await tx.run('select 1 from sv_key_accounts limit 1');
      if (accounts.rows.length > 0) throw new VaultIdLost();
      await tx.run(
        'insert into sv_key_settings (name, value) values (?, ?) on conflict (name) do nothing',
        [VAULT_ID, randomBase64Url(32)],
      );
      const made = await this.#readId(tx);
      if (!made) throw new Error('The vault id could not be stored.');
      return made;
    });
  }

  /** The person's keys and their ways in, or no account before they are set up: what `VaultActions.read` answers. */
  async read(
    sub: string,
  ): Promise<{ sub: string; account?: VaultAccountRow; waysIn: VaultWayInRow[] }> {
    const row = (
      await this.#database.run(
        'select suite, unlock_salt, signing_public, signing_private, kit_confirmed from sv_key_accounts where user_id = ?',
        [sub],
      )
    ).rows[0];
    const waysIn = (
      await this.#database.run(
        'select way, wrap_id, record from sv_key_wraps where user_id = ? order by created_at, wrap_id',
        [sub],
      )
    ).rows.map((wrap) => ({
      way: String(wrap.way) as AppVaultWay,
      id: String(wrap.wrap_id),
      record: String(wrap.record),
    }));
    if (!row) return { sub, waysIn };
    return {
      sub,
      account: {
        suite: Number(row.suite),
        unlockSalt: String(row.unlock_salt),
        signingPublic: String(row.signing_public),
        signingPrivate: String(row.signing_private),
        kitConfirmed: Number(row.kit_confirmed) === 1 || row.kit_confirmed === true,
      },
      waysIn,
    };
  }

  /** Sets a person up: their keys and their first way in, together or not at all. Refused once they are set up. */
  async setUp(
    sub: string,
    account: Omit<VaultAccountRow, 'kitConfirmed'>,
    waysIn: readonly { way: string; id: string; record: string }[],
  ): Promise<void> {
    if (account.suite !== 1)
      throw new VaultError('invalid', 'That suite is not one this vault keeps.');
    checkBase64Url32(account.unlockSalt, 'The unlock salt');
    checkBase64Url32(account.signingPublic, 'The signing key');
    checkRecord(account.signingPrivate, 'The signing key');
    const checked = waysIn.map((wayIn) => checkWayIn(wayIn, WAYS));
    if (!checked.some((wayIn) => wayIn.way === 'password')) {
      throw new VaultError('invalid', 'An account is set up with a way in.');
    }
    const now = this.#now();
    await this.#database.transaction(async (tx) => {
      const found = await tx.run('select 1 from sv_key_accounts where user_id = ?', [sub]);
      if (found.rows.length > 0) throw new VaultError('exists', 'These keys are set up already.');
      await tx.run(
        'insert into sv_key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, kit_confirmed, created_at) values (?, ?, ?, ?, ?, 0, ?)',
        [
          sub,
          account.suite,
          account.unlockSalt,
          account.signingPublic,
          account.signingPrivate,
          now,
        ],
      );
      for (const wayIn of checked) await this.#insertWay(tx, sub, wayIn, now);
    });
  }

  /** Adds or replaces one way in. The person must be set up. */
  async putWayIn(sub: string, wayIn: { way: string; id: string; record: string }): Promise<void> {
    const checked = checkWayIn(wayIn, WAYS);
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, sub);
      await tx.run('delete from sv_key_wraps where user_id = ? and way = ? and wrap_id = ?', [
        sub,
        checked.way,
        checked.id,
      ]);
      await this.#insertWay(tx, sub, checked, this.#now());
    });
  }

  /** Removes one way in. A password change adds the new password's way in before it removes the old. */
  async removeWayIn(sub: string, way: AppVaultWay, id: string): Promise<boolean> {
    const { rowsAffected } = await this.#database.run(
      'delete from sv_key_wraps where user_id = ? and way = ? and wrap_id = ?',
      [sub, way, id],
    );
    return rowsAffected > 0;
  }

  /** Stores the kit's way in and marks the kit kept, together. A kit kept again replaces the one before. */
  async confirmKit(sub: string, record: string): Promise<void> {
    const wayIn = checkWayIn({ way: 'kit', id: '', record }, WAYS);
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, sub);
      await tx.run("delete from sv_key_wraps where user_id = ? and way = 'kit'", [sub]);
      await this.#insertWay(tx, sub, wayIn, this.#now());
      await tx.run('update sv_key_accounts set kit_confirmed = 1 where user_id = ?', [sub]);
    });
  }

  /** The person's keys for an app, or `undefined` before they are made. */
  async app(sub: string, clientId: string): Promise<VaultAppRow | undefined> {
    const row = (
      await this.#database.run(
        'select client_id, app_key, identity, signature from sv_key_apps where user_id = ? and client_id = ?',
        [sub, clientId],
      )
    ).rows[0];
    return row
      ? {
          clientId: String(row.client_id),
          appKey: String(row.app_key),
          identity: String(row.identity),
          signature: String(row.signature),
        }
      : undefined;
  }

  /** Stores the person's keys for an app, the first time. Refused when they exist. */
  async putApp(sub: string, app: VaultAppRow): Promise<void> {
    checkClientId(app.clientId);
    checkRecord(app.appKey, 'The app key');
    checkRecord(app.identity, 'The app keys');
    checkSignature(app.signature);
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, sub);
      const found = await tx.run('select 1 from sv_key_apps where user_id = ? and client_id = ?', [
        sub,
        app.clientId,
      ]);
      if (found.rows.length > 0)
        throw new VaultError('exists', 'The keys for this app exist already.');
      await tx.run(
        'insert into sv_key_apps (user_id, client_id, app_key, identity, signature, created_at) values (?, ?, ?, ?, ?, ?)',
        [sub, app.clientId, app.appKey, app.identity, app.signature, this.#now()],
      );
    });
  }

  /**
   * Deletes every record of the person, on the caller's transaction when one is given: the app deletes a person's keys in the one
   * transaction that deletes the person. With them gone, what was encrypted for that person opens for no one, backups included.
   */
  async deleteAccount(sub: string, tx?: VaultExecutor): Promise<void> {
    const run = async (executor: VaultExecutor) => {
      await executor.run('delete from sv_key_apps where user_id = ?', [sub]);
      await executor.run('delete from sv_key_wraps where user_id = ?', [sub]);
      await executor.run('delete from sv_key_accounts where user_id = ?', [sub]);
    };
    if (tx) await run(tx);
    else await this.#database.transaction(run);
  }

  async #readId(executor: VaultExecutor): Promise<string | undefined> {
    const row = (await executor.run('select value from sv_key_settings where name = ?', [VAULT_ID]))
      .rows[0];
    return row ? String(row.value) : undefined;
  }

  async #requireAccount(tx: VaultExecutor, sub: string): Promise<void> {
    const found = await tx.run('select 1 from sv_key_accounts where user_id = ?', [sub]);
    if (found.rows.length === 0) throw new VaultError('not-set-up', 'These keys are not set up.');
  }

  async #insertWay(
    tx: VaultExecutor,
    sub: string,
    wayIn: { way: string; id: string; record: string },
    now: number,
  ): Promise<void> {
    await tx.run(
      'insert into sv_key_wraps (user_id, way, wrap_id, record, prf_salt, created_at) values (?, ?, ?, ?, ?, ?)',
      [sub, wayIn.way, wayIn.id, wayIn.record, null, now],
    );
  }
}
