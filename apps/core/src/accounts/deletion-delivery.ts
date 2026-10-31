import { randomBytes } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import { signJWT } from 'better-auth/plugins/jwt';
import type { Auth } from '../auth/auth';
import { parseMetadata } from '../oauth/client-metadata';
import { NAMES } from '../oauth/schema-names';
import { purgeDoneNotices } from './deletion-notices';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long to wait after the first, second, ... failure; after the last of these, a day (core-app §4.5). */
export const RETRY_AFTER_MS = [MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR, 6 * HOUR, 12 * HOUR];
export const THEN_EVERY_MS = DAY;
/** How long after the account was deleted a notice is tried before it is given up. */
export const GIVE_UP_AFTER_MS = 30 * DAY;
const TIMEOUT_MS = 5000;
const LEASE_MS = 2 * MINUTE;
const TOKEN_LIFETIME_SECONDS = 120;
const BATCH = 50;

/** The event an account-deleted token carries (core-app §4.5). */
export const ACCOUNT_DELETED_EVENT = 'urn:sovereignfs:event:account-deleted';

/** When to try again after `failures` attempts have failed. */
export function retryDelay(failures: number): number {
  return RETRY_AFTER_MS[failures - 1] ?? THEN_EVERY_MS;
}

/**
 * The token an app is sent (core-app §4.5): a JWT typed `account-deleted+jwt`, signed with the key that signs logout tokens, carrying
 * the `sub` and the event and nothing else of the person, and good for two minutes. Each attempt has its own `jti`.
 */
export async function signAccountDeletedToken(
  auth: Pick<Auth, '$context'>,
  clientId: string,
  sub: string,
  now: number = Date.now(),
): Promise<string> {
  const context = await auth.$context;
  const jwt = (
    context.getPlugin('jwt') as { options?: Parameters<typeof signJWT>[1]['options'] } | null
  )?.options;
  const issuer = (jwt as { jwt?: { issuer?: string } } | undefined)?.jwt?.issuer;
  const iat = Math.floor(now / 1000);
  return signJWT({ context } as Parameters<typeof signJWT>[0], {
    options: jwt,
    payload: {
      iss: issuer,
      aud: clientId,
      sub,
      iat,
      exp: iat + TOKEN_LIFETIME_SECONDS,
      jti: randomBytes(16).toString('hex'),
      events: { [ACCOUNT_DELETED_EVENT]: {} },
    },
    header: { typ: 'account-deleted+jwt' },
  });
}

export type DeliveryOptions = {
  now?: () => number;
  fetch?: typeof fetch;
  /** The operator's log: names the app and the kind of failure, never the person or what the app said. */
  log?: (line: string) => void;
};

export type Round = { tried: number; delivered: number; failed: number; givenUp: number };

type Due = { id: string; clientId: string; sub: string; deletedAt: number; attempts: number };

/**
 * Sends the account-deleted notices that are due (core-app §4.5). It reads what is due from the table every time it runs, so a
 * process that stopped loses nothing; it claims a notice with a conditional update that sets a lease, so two instances of core do not
 * send one at once; and it keeps no body the app answers with. One round sends what is due now and returns; the caller asks again
 * on a timer.
 */
export class DeletionDelivery {
  readonly #database: Database;
  readonly #sign: (clientId: string, sub: string) => Promise<string>;
  readonly #now: () => number;
  readonly #fetch: typeof fetch;
  readonly #log: (line: string) => void;

  constructor(
    database: Database,
    sign: (clientId: string, sub: string) => Promise<string>,
    options: DeliveryOptions = {},
  ) {
    this.#database = database;
    this.#sign = sign;
    this.#now = options.now ?? Date.now;
    this.#fetch = options.fetch ?? fetch;
    this.#log = options.log ?? ((line) => console.warn(line));
  }

  async runDue(): Promise<Round> {
    const now = this.#now();
    await purgeDoneNotices(this.#database, now);
    const { rows } = await this.#database.run(
      `select id, client_id, sub, deleted_at, attempts from account_deletion_notices
        where state = 'pending' and next_attempt_at <= ? and (lease_until is null or lease_until <= ?)
        order by next_attempt_at limit ${BATCH}`,
      [now, now],
    );
    const round: Round = { tried: 0, delivered: 0, failed: 0, givenUp: 0 };
    const claimed: Due[] = [];
    for (const row of rows) {
      const claim = await this.#database.run(
        `update account_deletion_notices set lease_until = ?
          where id = ? and state = 'pending' and (lease_until is null or lease_until <= ?)`,
        [now + LEASE_MS, String(row.id), now],
      );
      if (claim.rowsAffected === 1) {
        claimed.push({
          id: String(row.id),
          clientId: String(row.client_id),
          sub: String(row.sub),
          deletedAt: Number(row.deleted_at),
          attempts: Number(row.attempts),
        });
      }
    }
    await Promise.all(
      claimed.map(async (notice) => {
        round.tried += 1;
        const outcome = await this.#attempt(notice);
        if (outcome === 'delivered') round.delivered += 1;
        else if (outcome === 'given_up') round.givenUp += 1;
        else round.failed += 1;
      }),
    );
    return round;
  }

  async #attempt(notice: Due): Promise<'delivered' | 'failed' | 'given_up'> {
    const failure = await this.#send(notice);
    const now = this.#now();
    if (failure === undefined) {
      await this.#database.run(
        `update account_deletion_notices set state = 'delivered', attempts = ?, next_attempt_at = null, lease_until = null,
                last_failure = null, done_at = ? where id = ? and state = 'pending'`,
        [notice.attempts + 1, now, notice.id],
      );
      return 'delivered';
    }
    const attempts = notice.attempts + 1;
    const last = notice.deletedAt + GIVE_UP_AFTER_MS;
    // The last try is made at the 30 days, not skipped because the usual wait would run past them.
    const next = Math.min(now + retryDelay(attempts), last);
    if (now >= last) {
      await this.#database.run(
        `update account_deletion_notices set state = 'given_up', attempts = ?, next_attempt_at = null, lease_until = null,
                last_failure = ?, done_at = ? where id = ? and state = 'pending'`,
        [attempts, failure, now, notice.id],
      );
      // The app and the kind of failure, never the person (core-app §4.5).
      this.#log(
        `The account-deletion notice for app ${notice.clientId} was given up after ${attempts} attempts (${failure}).`,
      );
      return 'given_up';
    }
    await this.#database.run(
      `update account_deletion_notices set attempts = ?, next_attempt_at = ?, lease_until = null, last_failure = ?
        where id = ? and state = 'pending'`,
      [attempts, next, failure, notice.id],
    );
    return 'failed';
  }

  /** One attempt: undefined when the app answered `2xx`, otherwise the kind of failure. A redirect is not followed. */
  async #send(notice: Due): Promise<string | undefined> {
    const address = await this.#address(notice.clientId);
    if (!address) return 'no_address';
    try {
      const token = await this.#sign(notice.clientId, notice.sub);
      const response = await this.#fetch(address, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({ account_deleted_token: token }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      });
      // What the app said is never read.
      void response.body?.cancel().catch(() => undefined);
      if (response.status >= 200 && response.status < 300) return undefined;
      return `http_${response.status}`;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
    }
  }

  async #address(clientId: string): Promise<string | undefined> {
    const { rows } = await this.#database.run(
      `select ${NAMES.client.metadata} as metadata from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
      [clientId],
    );
    const address = rows[0] ? parseMetadata(rows[0].metadata).accountDeletedUri : undefined;
    return typeof address === 'string' && address !== '' ? address : undefined;
  }
}

/** The notices an operator sees (core-app §4.5): those not yet delivered, with the first eight characters of the `sub`. */
export type NoticeRow = {
  id: string;
  clientId: string;
  appName: string;
  subStart: string;
  deletedAt: number;
  state: 'pending' | 'given_up';
  attempts: number;
  nextAttemptAt: number | null;
  lastFailure: string | null;
};

/** The notices not yet delivered, oldest first, and how many have been given up. */
export async function listUndelivered(
  database: Pick<Database, 'run'>,
): Promise<{ notices: NoticeRow[]; givenUp: number }> {
  const { rows } = await database.run(
    `select n.id, n.client_id, n.sub, n.deleted_at, n.state, n.attempts, n.next_attempt_at, n.last_failure, o.name as app_name
       from account_deletion_notices n left join ${NAMES.clients} o on o.${NAMES.client.clientId} = n.client_id
      where n.state in ('pending', 'given_up') order by n.deleted_at, n.id limit 500`,
  );
  const notices = rows.map((row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    appName: row.app_name === null || row.app_name === undefined ? 'An app' : String(row.app_name),
    subStart: String(row.sub).slice(0, 8),
    deletedAt: Number(row.deleted_at),
    state: String(row.state) as 'pending' | 'given_up',
    attempts: Number(row.attempts),
    nextAttemptAt:
      row.next_attempt_at === null || row.next_attempt_at === undefined
        ? null
        : Number(row.next_attempt_at),
    lastFailure:
      row.last_failure === null || row.last_failure === undefined ? null : String(row.last_failure),
  }));
  return { notices, givenUp: notices.filter((notice) => notice.state === 'given_up').length };
}

/** Marks a notice resolved: the app's owner says the data is gone by other means. Says whether there was one to mark. */
export async function resolveNotice(
  database: Pick<Database, 'run'>,
  id: string,
  now: number = Date.now(),
): Promise<boolean> {
  const { rowsAffected } = await database.run(
    `update account_deletion_notices set state = 'resolved', next_attempt_at = null, lease_until = null, done_at = ?
      where id = ? and state in ('pending', 'given_up')`,
    [now, id],
  );
  return rowsAffected === 1;
}
