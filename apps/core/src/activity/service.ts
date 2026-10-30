import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '@sovereignfs/database';
import { countCall } from '../api/rate-limit';
import { appOrigins, hasUsed, linkProblem } from '../clients/use';
import { NAMES } from '../oauth/schema-names';

const DAY = 24 * 60 * 60 * 1000;
const SUMMARY_MAX = 200;
const KEY_MAX = 100;
const KEPT_FOR = 90 * DAY;
const PER_PERSON = 500;
const PAST_ALLOWED = DAY;
const FUTURE_ALLOWED = 60_000;
/** Records in a minute for an app, and in an hour for one app about one person (core-app §4.3). */
export const APP_LIMIT = { count: 600, windowMs: 60_000 };
export const PAIR_LIMIT = { count: 120, windowMs: 60 * 60_000 };

/** One entry as the person sees it. Times are milliseconds since the epoch. */
export type ActivityItem = {
  id: string;
  clientId: string;
  /** The app's name, for the page. */
  appName: string;
  summary: string;
  link: string | null;
  at: number;
};

/** What an app records (core-app §4.3). */
export type RecordInput = {
  to: unknown;
  summary: unknown;
  link?: unknown;
  at?: unknown;
  key?: unknown;
};

export type Problem = { field: string; message: string };

export class ActivityError extends Error {
  override name = 'ActivityError';

  constructor(
    readonly code: 'invalid' | 'rate-limited',
    message: string,
    readonly problems: readonly Problem[] = [],
    /** For `rate-limited`: seconds to wait. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export type ActivityOptions = {
  now?: () => number;
  /** A development instance, whose own address is `http`, accepts an `http` link on `localhost` (core-app §3.7.1). */
  development?: boolean;
};

const num = (value: unknown): number => Number(value);

/**
 * The only writer of activity (core-app §4.3), and the only reader: a person's record is read for that person and no one else, by
 * the id of their own account that the caller names. It decides who may be recorded about, what an entry may say and how many, and
 * answers a record about someone who may not have it exactly as a kept one, so a recorder learns nothing about the person. Nothing
 * here takes an account from a request.
 */
export class ActivityService {
  readonly #database: Database;
  readonly #now: () => number;
  readonly #development: boolean;

  constructor(database: Database, options: ActivityOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? Date.now;
    this.#development = options.development ?? false;
  }

  // ---- recording ----------------------------------------------------------------

  /**
   * Records an entry from an app about a person. `clientId` is the app, taken from its token. Throws `invalid` for what cannot be
   * used (before anything is counted or kept) and `rate-limited` over a limit. Whether the person is recorded about is not said.
   */
  async record(clientId: string, input: RecordInput): Promise<{ id: string }> {
    const now = this.#now();
    const app = await appOrigins(this.#database, clientId);
    const entry = this.#checked(input, now, app?.origins ?? []);
    await this.#count(`activity-app|${clientId}`, APP_LIMIT);
    await this.#count(`activity-pair|${clientId}|${entry.to}`, PAIR_LIMIT);

    if (!(await this.#mayRecord(clientId, entry.to))) return { id: randomUUID() };

    if (entry.key !== null) {
      const { rows } = await this.#database.run(
        `select id from activity where client_id = ? and user_id = ? and idem_key = ? and created_at > ? limit 1`,
        [clientId, entry.to, entry.key, now - DAY],
      );
      if (rows[0]) return { id: String(rows[0].id) };
    }

    const id = randomUUID();
    await this.#database.transaction(async (tx) => {
      await tx.run(`delete from activity where user_id = ? and at <= ?`, [
        entry.to,
        now - KEPT_FOR,
      ]);
      await tx.run(
        `insert into activity (id, user_id, client_id, summary, link, at, created_at, idem_key) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, entry.to, clientId, entry.summary, entry.link, entry.at, now, entry.key],
      );
      // A person keeps at most so many in all: the oldest go first.
      const { rows } = await tx.run(
        `select id from activity where user_id = ? order by at desc, id desc`,
        [entry.to],
      );
      for (const row of rows.slice(PER_PERSON)) {
        await tx.run('delete from activity where id = ?', [String(row.id)]);
      }
    });
    return { id };
  }

  #checked(input: RecordInput, now: number, origins: readonly string[]) {
    const problems: Problem[] = [];
    const text = (field: string, value: unknown, max: number, required: boolean): string | null => {
      if (value === undefined || value === null) {
        if (required) problems.push({ field, message: 'is required' });
        return null;
      }
      if (typeof value !== 'string' || (required && value.trim() === '')) {
        problems.push({ field, message: required ? 'is required' : 'must be text' });
        return null;
      }
      if (value.length > max)
        problems.push({ field, message: `must be at most ${max} characters` });
      // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
      if (/[\u0000-\u001f\u007f]/.test(value)) {
        problems.push({ field, message: 'must be one line of plain text' });
      }
      return value;
    };
    const to = text('to', input.to, 255, true);
    const summary = text('summary', input.summary, SUMMARY_MAX, true);
    const key = text('key', input.key, KEY_MAX, false);

    let link: string | null = null;
    if (input.link !== undefined && input.link !== null) {
      const problem = linkProblem(input.link, origins, this.#development);
      if (problem) problems.push({ field: 'link', message: problem });
      else link = String(input.link);
    }

    let at = now;
    if (input.at !== undefined && input.at !== null) {
      const when = typeof input.at === 'string' ? Date.parse(input.at) : Number.NaN;
      if (!Number.isFinite(when))
        problems.push({ field: 'at', message: 'must be a date and time' });
      else if (when < now - PAST_ALLOWED)
        problems.push({ field: 'at', message: 'must be within the last day' });
      else if (when > now + FUTURE_ALLOWED)
        problems.push({ field: 'at', message: 'must not be in the future' });
      else at = when;
    }

    if (problems.length > 0 || to === null || summary === null) {
      throw new ActivityError('invalid', 'Some of what was sent cannot be used.', problems);
    }
    return { to, summary: summary.trim(), link, at, key };
  }

  async #count(key: string, limit: { count: number; windowMs: number }): Promise<void> {
    const result = await countCall(this.#database, key, limit.count, limit.windowMs, this.#now());
    if (!result.allowed) {
      throw new ActivityError('rate-limited', 'Too many records.', [], result.retryAfter);
    }
  }

  /** Whether an app may record about this person: an active account that has used the app. There is no switch (core-app §4.3). */
  async #mayRecord(clientId: string, userId: string): Promise<boolean> {
    const user = (
      await this.#database.run('select deactivated_at from users where id = ?', [userId])
    ).rows[0];
    if (!user || (user.deactivated_at !== null && user.deactivated_at !== undefined)) return false;
    return hasUsed(this.#database, userId, clientId);
  }

  // ---- the person's own record -----------------------------------------------------

  /** A person's entries, newest first. `clientId` limits them to one app's. Entries older than 90 days are not shown. */
  async list(
    userId: string,
    options: { clientId?: string; limit?: number } = {},
  ): Promise<ActivityItem[]> {
    const limit = Math.min(PER_PERSON, Math.max(1, Math.floor(options.limit ?? PER_PERSON)));
    const { rows } = await this.#database.run(
      `select a.id, a.client_id, a.summary, a.link, a.at, o.name as app_name
         from activity a left join ${NAMES.clients} o on o.${NAMES.client.clientId} = a.client_id
        where a.user_id = ? and a.at > ?${options.clientId === undefined ? '' : ' and a.client_id = ?'}
        order by a.at desc, a.id desc limit ${limit}`,
      options.clientId === undefined
        ? [userId, this.#now() - KEPT_FOR]
        : [userId, this.#now() - KEPT_FOR, options.clientId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      clientId: String(row.client_id),
      appName:
        row.app_name === null || row.app_name === undefined ? 'An app' : String(row.app_name),
      summary: String(row.summary),
      link: row.link === null || row.link === undefined ? null : String(row.link),
      at: num(row.at),
    }));
  }

  /** The apps that have recorded something about this person, to choose among: id, name and how many. */
  async apps(userId: string): Promise<{ clientId: string; name: string; count: number }[]> {
    const { rows } = await this.#database.run(
      `select a.client_id, o.name as app_name, count(*) as n
         from activity a left join ${NAMES.clients} o on o.${NAMES.client.clientId} = a.client_id
        where a.user_id = ? and a.at > ?
        group by a.client_id, o.name`,
      [userId, this.#now() - KEPT_FOR],
    );
    return rows
      .map((row) => ({
        clientId: String(row.client_id),
        name: row.app_name === null || row.app_name === undefined ? 'An app' : String(row.app_name),
        count: num(row.n),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Deletes one of this person's entries. Returns whether there was one. */
  async delete(userId: string, id: string): Promise<boolean> {
    const { rowsAffected } = await this.#database.run(
      'delete from activity where id = ? and user_id = ?',
      [id, userId],
    );
    return rowsAffected > 0;
  }

  /** Deletes everything one app recorded about this person. Returns how many. */
  async deleteApp(userId: string, clientId: string): Promise<number> {
    const { rowsAffected } = await this.#database.run(
      'delete from activity where user_id = ? and client_id = ?',
      [userId, clientId],
    );
    return rowsAffected;
  }

  /** Deletes everything recorded about this person. Returns how many. */
  async deleteAll(userId: string): Promise<number> {
    const { rowsAffected } = await this.#database.run('delete from activity where user_id = ?', [
      userId,
    ]);
    return rowsAffected;
  }
}

/** Removes what one app recorded about one person: what Remove access ends (core-app §3.6.4, §4.3). */
export async function removeActivity(
  tx: Pick<Executor, 'run'>,
  userId: string,
  clientId: string,
): Promise<void> {
  await tx.run('delete from activity where user_id = ? and client_id = ?', [userId, clientId]);
}

/** Removes everything an app recorded: what deleting the app ends. */
export async function removeAppActivity(
  tx: Pick<Executor, 'run'>,
  clientId: string,
): Promise<void> {
  await tx.run('delete from activity where client_id = ?', [clientId]);
}
