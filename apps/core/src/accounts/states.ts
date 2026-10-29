import type { Database, Executor } from '@sovereignfs/database';
import { ROLE_OWNER } from '../auth/roles';

export type AccountStateErrorCode = 'not-found' | 'owner';

export class AccountStateError extends Error {
  override name = 'AccountStateError';

  constructor(
    readonly code: AccountStateErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Work that belongs to deactivating an account and must succeed or fail with it: it runs in the same
 * transaction that ends the account's sessions. Revoking the tokens issued to apps (and their refresh
 * tokens) joins here, so an account is never deactivated with a token still alive (core-app §3.6.3).
 */
export type DeactivationStep = (
  transaction: Executor,
  userId: string,
  /** The moment of the deactivation, as this dialect stores a timestamp. */
  at: number | Date,
) => Promise<void>;

/**
 * Work that has to look at the account's sessions before they are deleted, because deleting a session
 * clears what points to it (an app's tokens lose their session). It runs in the same transaction, first,
 * and may return a notice to send once the deactivation has been committed (such as telling the apps
 * that registered a back-channel logout address, §3.6.5); a notice that fails is logged and never undoes
 * the deactivation.
 */
export type DeactivationPreparation = (
  transaction: Executor,
  userId: string,
) => Promise<(() => Promise<void> | void) | undefined>;

/**
 * Work that follows a deactivation once it has been committed, such as telling apps that registered a
 * back-channel logout address (§3.6.5). A failure is logged and never undoes the deactivation.
 */
export type AfterDeactivation = (event: {
  userId: string;
  /** The tokens of the sessions that were ended, for notices that name them. */
  sessionTokens: string[];
}) => Promise<void> | void;

export type DeactivationResult = {
  /** False when the account was already deactivated: nothing changed except that any session is ended. */
  changed: boolean;
  sessionsEnded: number;
};

/**
 * An account is active or deactivated (core-app §3.3.6). Deactivating it ends every session in one
 * transaction with whatever steps are registered; from then on no way of signing in opens another
 * (`assertMayOpenSession`, in the hook on creating a session), and a session that slips through a race
 * is refused by `getSession`. Reactivating restores signing in only: the sessions stay ended.
 *
 * Who may do this is the Console's to decide (an operator with `user:manage`, within §3.2.1). The one
 * rule held here is that the owner cannot be deactivated, since no action may leave the instance
 * without a person who can sign in as its owner.
 */
export class AccountStates {
  readonly #database: Database;
  readonly #now: () => number;
  readonly #steps: DeactivationStep[] = [];
  readonly #preparations: DeactivationPreparation[] = [];
  readonly #listeners: AfterDeactivation[] = [];
  readonly #log: (message: string) => void;

  constructor(
    database: Database,
    options: { now?: () => number; log?: (message: string) => void } = {},
  ) {
    this.#database = database;
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? ((message) => console.warn(message));
  }

  /** Adds work that runs inside the deactivating transaction. */
  addStep(step: DeactivationStep): void {
    this.#steps.push(step);
  }

  /** Adds work that runs in the deactivating transaction before the sessions are deleted. */
  addPreparation(preparation: DeactivationPreparation): void {
    this.#preparations.push(preparation);
  }

  /** Adds work that runs after a deactivation has been committed. */
  afterDeactivation(listener: AfterDeactivation): void {
    this.#listeners.push(listener);
  }

  /** The value a timestamp column takes on this dialect. */
  #stamp(): number | Date {
    const now = this.#now();
    return this.#database.family === 'postgres' ? new Date(now) : now;
  }

  async deactivate(userId: string): Promise<DeactivationResult> {
    const outcome = await this.#database.transaction(async (transaction) => {
      const { rows } = await transaction.run(
        'select role, deactivated_at from users where id = ?',
        [userId],
      );
      const user = rows[0];
      if (!user) throw new AccountStateError('not-found', 'There is no such account.');
      if (user.role === ROLE_OWNER) {
        throw new AccountStateError('owner', 'The owner cannot be deactivated.');
      }
      const changed = user.deactivated_at === null || user.deactivated_at === undefined;
      if (changed) {
        const stamp = this.#stamp();
        await transaction.run(
          'update users set deactivated_at = ?, updated_at = ? where id = ? and deactivated_at is null',
          [stamp, stamp, userId],
        );
      }
      const notices: (() => Promise<void> | void)[] = [];
      for (const prepare of this.#preparations) {
        const notice = await prepare(transaction, userId);
        if (notice) notices.push(notice);
      }
      const { rows: sessions } = await transaction.run(
        'select token from sessions where user_id = ?',
        [userId],
      );
      await transaction.run('delete from sessions where user_id = ?', [userId]);
      const at = this.#stamp();
      for (const step of this.#steps) await step(transaction, userId, at);
      return { changed, tokens: sessions.map((row) => String(row.token)), notices };
    });

    for (const notice of outcome.notices) {
      try {
        await notice();
      } catch (error) {
        this.#log(
          `A notice after deactivating an account failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    for (const listener of this.#listeners) {
      try {
        await listener({ userId, sessionTokens: outcome.tokens });
      } catch (error) {
        this.#log(
          `A notice after deactivating an account failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return { changed: outcome.changed, sessionsEnded: outcome.tokens.length };
  }

  /** Lets the account sign in again. Sessions that were ended stay ended. */
  async reactivate(userId: string): Promise<{ changed: boolean }> {
    const { rows } = await this.#database.run('select id from users where id = ?', [userId]);
    if (rows.length === 0) throw new AccountStateError('not-found', 'There is no such account.');
    const { rowsAffected } = await this.#database.run(
      'update users set deactivated_at = null, updated_at = ? where id = ? and deactivated_at is not null',
      [this.#stamp(), userId],
    );
    return { changed: rowsAffected > 0 };
  }
}
