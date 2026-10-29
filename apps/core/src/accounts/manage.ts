import type { Database, Executor } from '@sovereignfs/database';
import { isRole, ROLE_OWNER } from '../auth/roles';
import { planLogoutNotices, type LogoutNotice } from '../oauth/logout';
import { revokeAllTokens } from '../oauth/revocation';
import { NAMES } from '../oauth/schema-names';
import { can } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { mayActOn } from '../roles/people';
import type { AccountStates } from './states';

/** One account as the Console lists it (core-app §3.10). */
export type AccountSummary = {
  /** The account's `sub`: stable, unique, never reused. */
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** Milliseconds since the epoch, or undefined while the account is active. */
  deactivatedAt: number | undefined;
  createdAt: number;
};

export type AccountDetail = AccountSummary & {
  passkeys: number;
  sessions: number;
  timezone: string | undefined;
  locale: string | undefined;
  image: string | undefined;
};

export type AccountPage = {
  accounts: AccountSummary[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};

export const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;

const millis = (value: unknown): number => new Date(value as string | number | Date).getTime();
const flag = (value: unknown): boolean => value === true || value === 1 || value === '1';

const COLUMNS =
  'id, name, email, role, email_verified, two_factor_enabled, deactivated_at, created_at';

const summaryOf = (row: Record<string, unknown>): AccountSummary => ({
  id: String(row.id),
  name: String(row.name),
  email: String(row.email),
  role: String(row.role),
  emailVerified: flag(row.email_verified),
  twoFactorEnabled: flag(row.two_factor_enabled),
  deactivatedAt:
    row.deactivated_at === null || row.deactivated_at === undefined
      ? undefined
      : millis(row.deactivated_at),
  createdAt: millis(row.created_at),
});

/** A search text as a `like` pattern that means what was typed: `%` and `_` are characters, not wildcards. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`).toLowerCase()}%`;
}

/**
 * The accounts, newest first, optionally those whose name or email address contains the text (core-app
 * §3.10). The text is matched as typed, whatever the case, and is never a pattern. A page past the end is
 * the last page, and nothing breaks for a page that is not a number.
 */
export async function listAccounts(
  database: Database,
  options: { query?: string; page?: number; pageSize?: number } = {},
): Promise<AccountPage> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? PAGE_SIZE, 100));
  const text = (options.query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const where =
    text === '' ? '' : "where lower(name) like ? escape '\\' or lower(email) like ? escape '\\'";
  const args = text === '' ? [] : [likePattern(text), likePattern(text)];

  const { rows: counted } = await database.run(`select count(*) as n from users ${where}`, args);
  const total = Number(counted[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.isFinite(options.page) ? Math.trunc(options.page as number) : 1;
  const page = Math.min(Math.max(requested, 1), pages);

  const { rows } = await database.run(
    `select ${COLUMNS} from users ${where} order by created_at desc, id limit ? offset ?`,
    [...args, pageSize, (page - 1) * pageSize],
  );
  return { accounts: rows.map(summaryOf), total, page, pages, pageSize };
}

export async function getAccount(
  database: Database,
  id: string,
): Promise<AccountDetail | undefined> {
  const { rows } = await database.run(
    `select ${COLUMNS}, timezone, locale, image,
       (select count(*) from passkeys where passkeys.user_id = users.id) as passkeys,
       (select count(*) from sessions where sessions.user_id = users.id) as sessions
     from users where id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return undefined;
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  return {
    ...summaryOf(row),
    passkeys: Number(row.passkeys ?? 0),
    sessions: Number(row.sessions ?? 0),
    timezone: text(row.timezone),
    locale: text(row.locale),
    image: text(row.image),
  };
}

export type AccountActionErrorCode = 'forbidden' | 'not-found' | 'self' | 'operator' | 'owner';

export class AccountActionError extends Error {
  override name = 'AccountActionError';

  constructor(
    readonly code: AccountActionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Actor = { id: string; role: unknown };

/** What the manager needs from outside: telling apps, and telling the person. Both are after the work, and best-effort. */
export type AccountManagerHooks = {
  /** Tells the apps that registered a back-channel logout address that sessions ended. */
  logoutNotices?: (notices: readonly LogoutNotice[]) => Promise<void>;
  /** Tells the account holder that an operator reset their two-factor sign-in. Resolves true when it was sent. */
  mfaReset?: (to: { email: string; name: string }) => Promise<boolean>;
  log?: (message: string) => void;
};

/**
 * What an operator does to another account (core-app §3.3.6, §3.4.3, §3.10). Every action holds the rules,
 * so a direct request is held to them as the page is:
 *
 * - it needs `user:manage` in the matrix in force, read from the database;
 * - only the owner acts on an operator account: an admin acts on ordinary accounts only (`mayActOn`);
 * - nobody does these to themselves: ending their own access or removing their own sign-in is for their own
 *   pages, with their password;
 * - the owner is never deactivated or deleted, whoever asks.
 *
 * Changing a role is `changeRole` (owner only), and ownership moves by `transferOwnership`.
 */
export class AccountManager {
  readonly #database: Database;
  readonly #states: AccountStates;
  readonly #hooks: AccountManagerHooks;

  constructor(database: Database, states: AccountStates, hooks: AccountManagerHooks = {}) {
    this.#database = database;
    this.#states = states;
    this.#hooks = hooks;
  }

  #log(message: string) {
    (this.#hooks.log ?? ((text) => console.warn(text)))(message);
  }

  /** The target's row, once the actor is known to be allowed to act on it. */
  async #target(actor: Actor, id: string) {
    if (!can(actor.role, 'user:manage', await loadMatrix(this.#database))) {
      throw new AccountActionError(
        'forbidden',
        'Only an operator who manages accounts can do that.',
      );
    }
    const account = await getAccount(this.#database, id);
    if (!account) throw new AccountActionError('not-found', 'There is no such account.');
    if (account.id === actor.id) {
      throw new AccountActionError('self', 'That is for your own account pages.');
    }
    if (!isRole(account.role) || !mayActOn(actor.role, account.role)) {
      throw new AccountActionError('operator', 'Only the owner can act on an operator account.');
    }
    return account;
  }

  /** Ends the account's sessions and takes back every token; the apps are told. */
  async deactivate(actor: Actor, id: string): Promise<{ changed: boolean }> {
    await this.#target(actor, id);
    return { changed: (await this.#states.deactivate(id)).changed };
  }

  /** Lets the account sign in again; what was ended stays ended. */
  async reactivate(actor: Actor, id: string): Promise<{ changed: boolean }> {
    await this.#target(actor, id);
    return this.#states.reactivate(id);
  }

  /**
   * Deletes the account and its credentials (core-app §3.3.6). In one transaction: the apps to tell are read
   * first (deleting the sessions clears what says which apps they were used with), every token is revoked,
   * and the account and what belongs to it are removed; the apps are told once it has committed. Its `sub` is
   * never used again: accounts are given random ids.
   */
  async delete(actor: Actor, id: string): Promise<void> {
    const account = await this.#target(actor, id);
    if (account.role === ROLE_OWNER) {
      throw new AccountActionError('owner', 'The owner cannot be deleted.');
    }
    await this.#erase(id);
  }

  /**
   * A person deletes their own account (core-app §3.3.6, §3.11). It does what `delete` does, and the one rule
   * that is a person's own: the owner cannot, since an instance is never left without one, and is told to hand
   * ownership to an admin first. Asking for the password again is the caller's, before this: it takes no
   * password, so what it does is the same whoever asks. It needs no capability of the matrix beyond being
   * signed in; the caller asks for `profile:manage`.
   */
  async deleteSelf(actor: Actor): Promise<void> {
    const account = await getAccount(this.#database, actor.id);
    if (!account) throw new AccountActionError('not-found', 'There is no such account.');
    if (account.role === ROLE_OWNER) {
      throw new AccountActionError(
        'owner',
        'You own this instance. Hand it to another admin first, then you can delete your account.',
      );
    }
    await this.#erase(actor.id);
  }

  async #erase(id: string): Promise<void> {
    const at = this.#database.family === 'postgres' ? new Date() : Date.now();
    const notices = await this.#database.transaction(async (tx) => {
      const found = await tx.run('select role from users where id = ?', [id]);
      if (found.rows[0]?.role === ROLE_OWNER) {
        throw new AccountActionError('owner', 'The owner cannot be deleted.');
      }
      const planned = await planLogoutNotices(tx, id);
      await revokeAllTokens(tx, at, id);
      await removeAccount(tx, id);
      return planned;
    });
    if (notices.length > 0) {
      try {
        await this.#hooks.logoutNotices?.(notices);
      } catch (error) {
        this.#log(
          `A notice after deleting an account failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  /**
   * Removes the account's authenticator app and passkeys, so it can sign in with its password alone and
   * enrol again (core-app §3.4.3), and tells the holder by email. Says whether the email went: when mail
   * is not set up the reset still happens, and the operator is told to tell them.
   */
  async resetMfa(actor: Actor, id: string): Promise<{ notified: boolean }> {
    const account = await this.#target(actor, id);
    await this.#database.transaction(async (tx) => {
      await tx.run('delete from two_factors where user_id = ?', [id]);
      await tx.run('delete from passkeys where user_id = ?', [id]);
      await tx.run(
        'update users set two_factor_enabled = ?, updated_at = ? where id = ?',
        this.#database.family === 'postgres' ? [false, new Date(), id] : [0, Date.now(), id],
      );
    });
    let notified = false;
    try {
      notified =
        (await this.#hooks.mfaReset?.({ email: account.email, name: account.name })) ?? false;
    } catch (error) {
      this.#log(
        `The email after resetting two-factor sign-in failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return { notified };
  }
}

/** Removes an account and everything that belongs to it, in the order that leaves nothing pointing at nothing. */
async function removeAccount(tx: Executor, id: string): Promise<void> {
  await tx.run(`delete from ${NAMES.accessTokens} where ${NAMES.access.userId} = ?`, [id]);
  await tx.run(`delete from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ?`, [id]);
  await tx.run(`delete from ${NAMES.consents} where ${NAMES.consent.userId} = ?`, [id]);
  for (const table of [
    'two_factors',
    'passkeys',
    'avatars',
    'token_revocations',
    'sessions',
    'accounts',
  ]) {
    await tx.run(`delete from ${table} where user_id = ?`, [id]);
  }
  await tx.run('update invites set invited_by = null where invited_by = ?', [id]);
  await tx.run('delete from rate_limits where key = ?', [`confirm-password|${id}`]);
  await tx.run('delete from users where id = ?', [id]);
}
