import { randomBytes, randomUUID } from 'node:crypto';
import type { Database, Executor } from '@sovereignfs/database';
import { signJWT } from 'better-auth/plugins/jwt';
import type { Auth } from '../auth/auth';
import { parseMetadata } from './client-metadata';
import { NAMES } from './schema-names';

/**
 * Telling apps that a person's session at core ended (OpenID Connect Back-Channel Logout 1.0, core-app §3.6.5). Core is the one
 * sender: an app's back-channel address is kept in core's own settings for it, not in the provider's field, so the provider sends
 * nothing itself. A notice is a row, written when the session ends, and sent at once and then by a timer until the app answers.
 *
 * The specification (§2.5) says to send again only after a failure that may be temporary, and after a delay: a notice is tried again
 * after a timeout, an app that could not be reached, a `5xx` or a `429`, and given up at once after any other answer, or a day after
 * the session ended. Each attempt is a new token, good for two minutes (§4).
 */

/** One app to tell that one core session ended: the app, the person as it knows them (`sub`) and the session (`sid`). */
export type PlannedNotice = { clientId: string; sub: string; sid: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** How long to wait after the first, second, ... failure that may be temporary; the last of these repeats. */
export const LOGOUT_RETRY_AFTER_MS = [MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR, 6 * HOUR];
/** How long after the session ended a notice is tried before it is given up. */
export const LOGOUT_GIVE_UP_AFTER_MS = 24 * HOUR;
/** How long a notice that is done is kept, for an operator to read, before it is removed. */
const KEEP_DONE_MS = 24 * HOUR;
const TIMEOUT_MS = 5000;
const LEASE_MS = 2 * MINUTE;
const TOKEN_LIFETIME_SECONDS = 120;
const BATCH = 50;
const EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/** When to try again after `failures` attempts have failed. */
export function logoutRetryDelay(failures: number): number {
  return LOGOUT_RETRY_AFTER_MS[failures - 1] ?? 6 * HOUR;
}

/** Whether a failure may be temporary, so the specification allows sending again (§2.5). */
export function mayRetry(failure: string): boolean {
  return (
    failure === 'timeout' ||
    failure === 'network' ||
    failure === 'http_429' ||
    /^http_5\d\d$/.test(failure)
  );
}

/** An app's back-channel address: core's own setting, or the provider's field for an app not yet moved (`moveBackchannelAddresses`). */
export function backchannelAddressOf(metadata: unknown, column: unknown): string | undefined {
  const kept = parseMetadata(metadata).backchannelLogoutUri;
  if (typeof kept === 'string' && kept !== '') return kept;
  return typeof column === 'string' && column !== '' ? column : undefined;
}

/**
 * Which apps to tell, read before sessions are deleted: deleting a session clears the pointer from the app's tokens to it, so
 * afterwards nothing says which app it was used with. An app is told once for each session it holds a token for, if it has a
 * back-channel address and is not switched off. `by` names the person's sessions, or one session.
 */
export async function planLogoutNotices(
  executor: Pick<Executor, 'run'>,
  by: { userId: string } | { sessionId: string },
): Promise<PlannedNotice[]> {
  const found = new Map<string, PlannedNotice>();
  const sources = [
    [NAMES.accessTokens, NAMES.access],
    [NAMES.refreshTokens, NAMES.refresh],
  ] as const;
  for (const [table, c] of sources) {
    const where = 'userId' in by ? `t.${c.userId} = ?` : `t.${c.sessionId} = ?`;
    const { rows } = await executor.run(
      `select t.${c.sessionId} as session_id, t.${c.userId} as user_id, t.${c.clientId} as client_id,
         a.${NAMES.client.metadata} as metadata, a.${NAMES.client.backchannelLogoutUri} as uri, a.${NAMES.client.disabled} as disabled
       from ${table} t join ${NAMES.clients} a on a.${NAMES.client.clientId} = t.${c.clientId}
       where ${where} and t.${c.sessionId} is not null`,
      ['userId' in by ? by.userId : by.sessionId],
    );
    for (const row of rows) {
      const disabled = row.disabled === true || row.disabled === 1;
      if (disabled || !backchannelAddressOf(row.metadata, row.uri)) continue;
      const notice = {
        clientId: String(row.client_id),
        sub: String(row.user_id),
        sid: String(row.session_id),
      };
      found.set(`${notice.clientId}\n${notice.sid}`, notice);
    }
  }
  return [...found.values()];
}

/** Writes the notices, on the caller's transaction where there is one. A notice already written for that app and session is kept. */
export async function queueLogoutNotices(
  executor: Pick<Executor, 'run'>,
  notices: readonly PlannedNotice[],
  now: number = Date.now(),
): Promise<void> {
  for (const notice of notices) {
    await executor.run(
      `insert into logout_notices (id, client_id, sub, sid, created_at, state, attempts, next_attempt_at)
       values (?, ?, ?, ?, ?, 'pending', 0, ?) on conflict (client_id, sid) do nothing`,
      [randomUUID(), notice.clientId, notice.sub, notice.sid, now, now],
    );
  }
}

/** Removes an app's notices with the app: there is nobody left to tell. On the removal's own transaction. */
export async function removeAppLogoutNotices(
  tx: Pick<Executor, 'run'>,
  clientId: string,
): Promise<void> {
  await tx.run('delete from logout_notices where client_id = ?', [clientId]);
}

/**
 * The token an app is sent: a JWT typed `logout+jwt`, signed with the key the ID tokens use, carrying `sub`, `sid` and the logout event
 * and no nonce, good for two minutes, with a `jti` of its own.
 */
export async function signLogoutToken(
  auth: Pick<Auth, '$context'>,
  notice: PlannedNotice,
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
      aud: notice.clientId,
      sub: notice.sub,
      sid: notice.sid,
      iat,
      exp: iat + TOKEN_LIFETIME_SECONDS,
      jti: randomBytes(16).toString('hex'),
      events: { [EVENT]: {} },
    },
    header: { typ: 'logout+jwt' },
  });
}

export type LogoutDeliveryOptions = {
  now?: () => number;
  fetch?: typeof fetch;
  /** The operator's log: names the app and the kind of failure, never the person or what the app said. */
  log?: (line: string) => void;
};

export type LogoutRound = { tried: number; delivered: number; failed: number; givenUp: number };

type Due = PlannedNotice & { id: string; createdAt: number; attempts: number };

/**
 * Sends the logout notices that are due. It reads what is due from the table every time, so a process that stopped loses nothing; it
 * claims a notice with a conditional update that sets a lease, so two instances of core do not send one at once; and it keeps no body
 * an app answers with. One round sends what is due now and returns.
 */
export class LogoutDelivery {
  readonly #database: Database;
  readonly #sign: (notice: PlannedNotice) => Promise<string>;
  readonly #now: () => number;
  readonly #fetch: typeof fetch;
  readonly #log: (line: string) => void;

  constructor(
    database: Database,
    sign: (notice: PlannedNotice) => Promise<string>,
    options: LogoutDeliveryOptions = {},
  ) {
    this.#database = database;
    this.#sign = sign;
    this.#now = options.now ?? Date.now;
    // Read when sent, so a test's stand-in for the network is the one used.
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#log = options.log ?? ((line) => console.warn(line));
  }

  async runDue(): Promise<LogoutRound> {
    const now = this.#now();
    await this.#database.run(
      "delete from logout_notices where state in ('delivered', 'given_up') and done_at < ?",
      [now - KEEP_DONE_MS],
    );
    const { rows } = await this.#database.run(
      `select id, client_id, sub, sid, created_at, attempts from logout_notices
        where state = 'pending' and next_attempt_at <= ? and (lease_until is null or lease_until <= ?)
        order by next_attempt_at limit ${BATCH}`,
      [now, now],
    );
    const round: LogoutRound = { tried: 0, delivered: 0, failed: 0, givenUp: 0 };
    const claimed: Due[] = [];
    for (const row of rows) {
      const claim = await this.#database.run(
        `update logout_notices set lease_until = ?
          where id = ? and state = 'pending' and (lease_until is null or lease_until <= ?)`,
        [now + LEASE_MS, String(row.id), now],
      );
      if (claim.rowsAffected === 1) {
        claimed.push({
          id: String(row.id),
          clientId: String(row.client_id),
          sub: String(row.sub),
          sid: String(row.sid),
          createdAt: Number(row.created_at),
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
    const attempts = notice.attempts + 1;
    if (failure === undefined) {
      await this.#database.run(
        `update logout_notices set state = 'delivered', attempts = ?, next_attempt_at = null, lease_until = null,
                last_failure = null, done_at = ? where id = ? and state = 'pending'`,
        [attempts, now, notice.id],
      );
      return 'delivered';
    }
    const last = notice.createdAt + LOGOUT_GIVE_UP_AFTER_MS;
    if (!mayRetry(failure) || now >= last) {
      await this.#database.run(
        `update logout_notices set state = 'given_up', attempts = ?, next_attempt_at = null, lease_until = null,
                last_failure = ?, done_at = ? where id = ? and state = 'pending'`,
        [attempts, failure, now, notice.id],
      );
      // The app and the kind of failure, never the person.
      this.#log(
        `The logout notice for app ${notice.clientId} was given up after ${attempts} attempt(s) (${failure}).`,
      );
      return 'given_up';
    }
    // The last try is made at the day's end, not skipped because the usual wait would run past it.
    await this.#database.run(
      `update logout_notices set attempts = ?, next_attempt_at = ?, lease_until = null, last_failure = ?
        where id = ? and state = 'pending'`,
      [attempts, Math.min(now + logoutRetryDelay(attempts), last), failure, notice.id],
    );
    return 'failed';
  }

  /** One attempt: undefined when the app answered `2xx`, otherwise the kind of failure. A redirect is not followed. */
  async #send(notice: Due): Promise<string | undefined> {
    const { rows } = await this.#database.run(
      `select ${NAMES.client.metadata} as metadata, ${NAMES.client.backchannelLogoutUri} as uri, ${NAMES.client.disabled} as disabled
         from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
      [notice.clientId],
    );
    const row = rows[0];
    if (!row) return 'no_app';
    if (row.disabled === true || row.disabled === 1) return 'disabled';
    const address = backchannelAddressOf(row.metadata, row.uri);
    if (!address) return 'no_address';
    try {
      const token = await this.#sign(notice);
      const response = await this.#fetch(address, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({ logout_token: token }),
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
}

/** One round of sending what is due, signing with `auth`'s keys. Never throws: what failed is tried on the next round. */
export async function deliverDueLogoutNotices(
  database: Database,
  auth: Pick<Auth, '$context'>,
  options: LogoutDeliveryOptions = {},
): Promise<LogoutRound | undefined> {
  try {
    return await new LogoutDelivery(
      database,
      (notice) => signLogoutToken(auth, notice),
      options,
    ).runDue();
  } catch (error) {
    console.warn(
      `Sending logout notices failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return undefined;
  }
}
