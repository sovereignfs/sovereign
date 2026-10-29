import { randomUUID } from 'node:crypto';
import { isEmailAddress } from '@sovereignfs/mailer';
import type { Database } from '@sovereignfs/database';
import { can } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { normalizeEmail } from './index';

/** One invitation as the Console lists it (core-app §3.10). */
export type InviteSummary = {
  /** Unguessable: it is the secret in the invitation link. */
  id: string;
  email: string;
  /** The operator who made it, or undefined once their account is gone. */
  invitedBy: string | undefined;
  createdAt: number;
  /** Milliseconds since the epoch, or undefined for an invitation that does not expire. */
  expiresAt: number | undefined;
};

export const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const millis = (value: unknown): number => Number(value);
const optional = (value: unknown): number | undefined =>
  value === null || value === undefined ? undefined : millis(value);

const summaryOf = (row: Record<string, unknown>): InviteSummary => ({
  id: String(row.id),
  email: String(row.email),
  invitedBy: typeof row.invited_by_name === 'string' ? row.invited_by_name : undefined,
  createdAt: millis(row.created_at),
  expiresAt: optional(row.expires_at),
});

/**
 * The invitations that have been neither used nor cancelled, newest first. Those past their expiry are
 * included, so an operator can see them and clear them or invite again.
 */
export async function listInvites(database: Database): Promise<InviteSummary[]> {
  const { rows } = await database.run(
    `select invites.id, invites.email, invites.created_at, invites.expires_at,
            users.name as invited_by_name
       from invites left join users on users.id = invites.invited_by
      where invites.accepted_at is null and invites.cancelled_at is null
      order by invites.created_at desc, invites.id`,
  );
  return rows.map(summaryOf);
}

export type InviteLookup = { state: 'valid'; email: string } | { state: 'invalid' };

/**
 * What an invitation link stands for. An unknown link, an expired one, a cancelled one and a used one all
 * come back `invalid`, so the page says nothing about which of them it was (core-app §3.3.1).
 */
export async function lookupInvite(
  database: Database,
  id: string,
  now: number,
): Promise<InviteLookup> {
  const { rows } = await database.run(
    `select email from invites
      where id = ? and accepted_at is null and cancelled_at is null
        and (expires_at is null or expires_at > ?)`,
    [id, now],
  );
  const email = rows[0]?.email;
  return typeof email === 'string' ? { state: 'valid', email } : { state: 'invalid' };
}

export type InviteErrorCode =
  'forbidden' | 'invalid-email' | 'invalid-expiry' | 'exists' | 'not-found' | 'used';

export class InviteError extends Error {
  override name = 'InviteError';

  constructor(
    readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Actor = { id: string; role: unknown };

export type InviteManagerHooks = {
  /** Emails the invitation. Resolves true when it was sent; rejects or resolves false when email is not set up. */
  send?: (invite: { id: string; email: string; expiresAt: Date | undefined }) => Promise<boolean>;
  /** The time now, in milliseconds; tests pass their own. */
  now?: () => number;
  log?: (message: string) => void;
};

/**
 * What an operator does with invitations (core-app §3.3.1, §3.10). Every action needs `user:manage` in the
 * matrix in force, read from the database, so a direct request is held to it as the page is.
 */
export class InviteManager {
  readonly #database: Database;
  readonly #hooks: InviteManagerHooks;

  constructor(database: Database, hooks: InviteManagerHooks = {}) {
    this.#database = database;
    this.#hooks = hooks;
  }

  async #allow(actor: Actor): Promise<void> {
    if (!can(actor.role, 'user:manage', await loadMatrix(this.#database))) {
      throw new InviteError('forbidden', 'Only an operator who manages accounts can do that.');
    }
  }

  /**
   * Invites an address to sign up, optionally for a number of days. Only one invitation is open for an address
   * at a time: a new one replaces the one before, so a link that was sent earlier stops working. An address
   * that already has an account is refused, and the operator is told so. The invitation exists once it is
   * saved; `sent` says whether the email went, so that when email is not set up the operator can pass the link on.
   */
  async create(
    actor: Actor,
    input: { email: string; days?: number | undefined },
  ): Promise<{ invite: InviteSummary; sent: boolean }> {
    await this.#allow(actor);
    const email = normalizeEmail(input.email);
    if (!isEmailAddress(email)) {
      throw new InviteError('invalid-email', 'That is not an email address.');
    }
    const days = input.days;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)) {
      throw new InviteError(
        'invalid-expiry',
        `Choose a whole number of days from 1 to ${MAX_EXPIRY_DAYS}, or leave it empty for no expiry.`,
      );
    }
    const now = (this.#hooks.now ?? Date.now)();
    const expiresAt = days === undefined ? undefined : now + days * DAY_MS;
    const id = randomUUID();

    await this.#database.transaction(async (tx) => {
      const account = await tx.run('select 1 as found from users where lower(email) = ?', [email]);
      if (account.rows.length > 0) {
        throw new InviteError('exists', 'There is already an account for that email address.');
      }
      await tx.run(
        `update invites set cancelled_at = ?
          where email = ? and accepted_at is null and cancelled_at is null`,
        [now, email],
      );
      await tx.run(
        'insert into invites (id, email, invited_by, created_at, expires_at) values (?, ?, ?, ?, ?)',
        [id, email, actor.id, now, expiresAt ?? null],
      );
    });

    const [invite] = (await listInvites(this.#database)).filter((row) => row.id === id);
    if (!invite) throw new Error('The invitation was saved but cannot be read back.');

    let sent = false;
    try {
      sent =
        (await this.#hooks.send?.({
          id,
          email,
          expiresAt: expiresAt === undefined ? undefined : new Date(expiresAt),
        })) ?? false;
    } catch (error) {
      (this.#hooks.log ?? ((text) => console.warn(text)))(
        `The invitation email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return { invite, sent };
  }

  /**
   * Cancels an invitation that has not been used: its link stops working at once. Cancelling one already
   * cancelled changes nothing; one that was used is refused, since the account exists.
   */
  async cancel(actor: Actor, id: string): Promise<{ changed: boolean }> {
    await this.#allow(actor);
    const now = (this.#hooks.now ?? Date.now)();
    return this.#database.transaction(async (tx) => {
      const found = await tx.run('select accepted_at, cancelled_at from invites where id = ?', [
        id,
      ]);
      const row = found.rows[0];
      if (!row) throw new InviteError('not-found', 'There is no such invitation.');
      if (row.accepted_at !== null && row.accepted_at !== undefined) {
        throw new InviteError('used', 'That invitation has already been used.');
      }
      if (row.cancelled_at !== null && row.cancelled_at !== undefined) return { changed: false };
      await tx.run(
        'update invites set cancelled_at = ? where id = ? and accepted_at is null and cancelled_at is null',
        [now, id],
      );
      return { changed: true };
    });
  }
}
