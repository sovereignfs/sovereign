import { randomBytes } from 'node:crypto';
import type { Database } from '@sovereignfs/database';

/**
 * Core's key vault (core-app §5.3): the records that open a person's keys, kept as the JSON `@sovereignfs/crypto/web` makes them.
 * Core opens none of them. Every method is for one account, the one the caller names, which the server actions take from the session
 * and never from a request.
 */

/** The ways into the account key core keeps. */
export type VaultWay = 'password' | 'passkey' | 'kit' | 'escrow';
const WAYS: ReadonlySet<string> = new Set<VaultWay>(['password', 'passkey', 'kit', 'escrow']);

export interface VaultAccount {
  readonly suite: number;
  readonly unlockSalt: string;
  readonly signingPublic: string;
  /** The wrapped private half, as JSON. */
  readonly signingPrivate: string;
  readonly kitConfirmed: boolean;
}

export interface VaultWayIn {
  readonly way: VaultWay;
  readonly id: string;
  /** The record, as JSON. */
  readonly record: string;
  readonly prfSalt?: string | undefined;
}

export interface VaultApp {
  readonly clientId: string;
  readonly appKey: string;
  readonly identity: string;
  readonly signature: string;
}

export class VaultError extends Error {
  override name = 'VaultError';
  constructor(
    readonly code: 'exists' | 'not-set-up' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/** A record is JSON of at most a few kilobytes: anything else is refused before it is stored. */
function checkRecord(text: unknown, what: string): string {
  if (typeof text !== 'string' || text.length === 0 || text.length > 8192) {
    throw new VaultError('invalid', `${what} is not a record.`);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
  } catch {
    throw new VaultError('invalid', `${what} is not a record.`);
  }
  return text;
}

const base64url32 = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new VaultError('invalid', `${what} is not 32 bytes of base64url.`);
  }
  return value;
};

function checkWayIn(wayIn: VaultWayIn): VaultWayIn {
  if (!WAYS.has(wayIn.way)) throw new VaultError('invalid', 'That is not a way in.');
  if (typeof wayIn.id !== 'string' || wayIn.id.length > 512) {
    throw new VaultError('invalid', 'That way in has no usable id.');
  }
  if (wayIn.way === 'passkey' && !wayIn.id) {
    throw new VaultError('invalid', 'A passkey way in names its passkey.');
  }
  return {
    way: wayIn.way,
    id: wayIn.id,
    record: checkRecord(wayIn.record, 'The way in'),
    ...(wayIn.way === 'passkey' ? { prfSalt: base64url32(wayIn.prfSalt, 'The passkey salt') } : {}),
  };
}

export class KeyVault {
  readonly #database: Database;
  readonly #now: () => number;

  constructor(database: Database, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  /** The account's keys and its ways in, or no account before it is set up. */
  async read(userId: string): Promise<{ account?: VaultAccount; waysIn: VaultWayIn[] }> {
    const row = (
      await this.#database.run(
        'select suite, unlock_salt, signing_public, signing_private, kit_confirmed from key_accounts where user_id = ?',
        [userId],
      )
    ).rows[0];
    const waysIn = (
      await this.#database.run(
        // A passkey's way in is read only while the passkey is there: one removed by any route opens nothing afterwards.
        "select way, wrap_id, record, prf_salt from key_wraps w where user_id = ? and (way <> 'passkey' or exists (select 1 from passkeys p where p.user_id = w.user_id and p.credential_id = w.wrap_id)) order by created_at, wrap_id",
        [userId],
      )
    ).rows.map((wrap) => ({
      way: String(wrap.way) as VaultWay,
      id: String(wrap.wrap_id),
      record: String(wrap.record),
      ...(wrap.prf_salt ? { prfSalt: String(wrap.prf_salt) } : {}),
    }));
    if (!row) return { waysIn };
    return {
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

  /** Sets an account up: its keys and its first ways in, together, or not at all. Refused once it is set up. */
  async setUp(
    userId: string,
    account: Omit<VaultAccount, 'kitConfirmed'>,
    waysIn: readonly VaultWayIn[],
  ): Promise<void> {
    if (account.suite !== 1) throw new VaultError('invalid', 'That suite is not one core keeps.');
    base64url32(account.unlockSalt, 'The unlock salt');
    base64url32(account.signingPublic, 'The signing key');
    checkRecord(account.signingPrivate, 'The signing key');
    const checked = waysIn.map(checkWayIn);
    if (!checked.some((wayIn) => wayIn.way === 'password' || wayIn.way === 'passkey')) {
      throw new VaultError('invalid', 'An account is set up with a way in.');
    }
    const now = this.#now();
    await this.#database.transaction(async (tx) => {
      const found = await tx.run('select 1 from key_accounts where user_id = ?', [userId]);
      if (found.rows.length > 0) throw new VaultError('exists', 'These keys are set up already.');
      await tx.run(
        'insert into key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, kit_confirmed, created_at) values (?, ?, ?, ?, ?, 0, ?)',
        [
          userId,
          account.suite,
          account.unlockSalt,
          account.signingPublic,
          account.signingPrivate,
          now,
        ],
      );
      for (const wayIn of checked) await this.#insertWay(tx, userId, wayIn, now);
    });
  }

  /** Adds or replaces one way in. The account must be set up, and a passkey's way in must name one of the account's passkeys. */
  async putWayIn(userId: string, wayIn: VaultWayIn): Promise<void> {
    const checked = checkWayIn(wayIn);
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, userId);
      if (checked.way === 'passkey') {
        const own = await tx.run('select 1 from passkeys where user_id = ? and credential_id = ?', [
          userId,
          checked.id,
        ]);
        if (own.rows.length === 0)
          throw new VaultError('invalid', 'That is not one of your passkeys.');
      }
      await tx.run('delete from key_wraps where user_id = ? and way = ? and wrap_id = ?', [
        userId,
        checked.way,
        checked.id,
      ]);
      await this.#insertWay(tx, userId, checked, this.#now());
    });
  }

  /**
   * Removes one way in. Nothing stops the last one going: a password change adds the new password's way in before it removes the old,
   * and a passkey's goes with the passkey, while the password's stays for as long as the account has a password.
   */
  async removeWayIn(userId: string, way: VaultWay, id: string): Promise<boolean> {
    return this.#database.transaction(async (tx) => {
      const { rowsAffected } = await tx.run(
        'delete from key_wraps where user_id = ? and way = ? and wrap_id = ?',
        [userId, way, id],
      );
      return rowsAffected > 0;
    });
  }

  /** Removes the ways in of passkeys the account no longer has, after a passkey is removed (core-app §5.5). */
  async dropRemovedPasskeys(userId: string): Promise<number> {
    const { rowsAffected } = await this.#database.run(
      "delete from key_wraps where user_id = ? and way = 'passkey' and wrap_id not in (select credential_id from passkeys where user_id = ?)",
      [userId, userId],
    );
    return rowsAffected;
  }

  /** Stores the kit's way in and marks the kit confirmed, together. A kit confirmed again replaces the one before. */
  async confirmKit(userId: string, record: string): Promise<void> {
    const wayIn = checkWayIn({ way: 'kit', id: '', record });
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, userId);
      await tx.run("delete from key_wraps where user_id = ? and way = 'kit'", [userId]);
      await this.#insertWay(tx, userId, wayIn, this.#now());
      await tx.run('update key_accounts set kit_confirmed = 1 where user_id = ?', [userId]);
    });
  }

  /** The account's keys for one app, or `undefined` before the person first opens it. */
  async app(userId: string, clientId: string): Promise<VaultApp | undefined> {
    const row = (
      await this.#database.run(
        'select client_id, app_key, identity, signature from key_apps where user_id = ? and client_id = ?',
        [userId, clientId],
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

  /** Stores the account's keys for an app, the first time it is opened. Refused when they exist. */
  async putApp(userId: string, app: VaultApp): Promise<void> {
    if (typeof app.clientId !== 'string' || !app.clientId || app.clientId.length > 255) {
      throw new VaultError('invalid', 'That is not an app.');
    }
    checkRecord(app.appKey, 'The app key');
    checkRecord(app.identity, 'The app keys');
    if (typeof app.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(app.signature)) {
      throw new VaultError('invalid', 'That is not a signature.');
    }
    await this.#database.transaction(async (tx) => {
      await this.#requireAccount(tx, userId);
      const found = await tx.run('select 1 from key_apps where user_id = ? and client_id = ?', [
        userId,
        app.clientId,
      ]);
      if (found.rows.length > 0)
        throw new VaultError('exists', 'The keys for this app exist already.');
      await tx.run(
        'insert into key_apps (user_id, client_id, app_key, identity, signature, created_at) values (?, ?, ?, ?, ?, ?)',
        [userId, app.clientId, app.appKey, app.identity, app.signature, this.#now()],
      );
    });
  }

  /**
   * The secret of a session (core-app §5.4), made the first time it is asked for. Given only for a session that is live and belongs
   * to `userId`: the join is the check, so a session ended or run out has none, whether or not its row is gone yet.
   */
  async sessionSecret(sessionId: string, userId: string): Promise<string | undefined> {
    const now = this.#now();
    const live = (
      await this.#database.run('select expires_at from sessions where id = ? and user_id = ?', [
        sessionId,
        userId,
      ])
    ).rows[0];
    if (!live || Number(new Date(live.expires_at as string | number).getTime()) <= now)
      return undefined;
    const secret = randomBytes(32).toString('base64url');
    await this.#database.run(
      'insert into key_session_secrets (session_id, secret, created_at) values (?, ?, ?) on conflict (session_id) do nothing',
      [sessionId, secret, now],
    );
    const kept = (
      await this.#database.run('select secret from key_session_secrets where session_id = ?', [
        sessionId,
      ])
    ).rows[0];
    return kept ? String(kept.secret) : undefined;
  }

  async #requireAccount(tx: Pick<Database, 'run'>, userId: string): Promise<void> {
    const found = await tx.run('select 1 from key_accounts where user_id = ?', [userId]);
    if (found.rows.length === 0) throw new VaultError('not-set-up', 'These keys are not set up.');
  }

  async #insertWay(
    tx: Pick<Database, 'run'>,
    userId: string,
    wayIn: VaultWayIn,
    now: number,
  ): Promise<void> {
    await tx.run(
      'insert into key_wraps (user_id, way, wrap_id, record, prf_salt, created_at) values (?, ?, ?, ?, ?, ?)',
      [userId, wayIn.way, wayIn.id, wayIn.record, wayIn.prfSalt ?? null, now],
    );
  }
}

/** Whether the account with this address has keys, for the pages that must say what a reset does to them (core-app §5.3). */
export async function addressHasKeys(database: Database, email: string): Promise<boolean> {
  const row = (
    await database.run(
      'select 1 as found from key_accounts k join users u on u.id = k.user_id where u.email = ?',
      [email.trim().toLowerCase()],
    )
  ).rows[0];
  return row !== undefined;
}
