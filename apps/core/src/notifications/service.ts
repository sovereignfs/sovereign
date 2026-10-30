import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '@sovereignfs/database';
import { countCall } from '../api/rate-limit';
import { NAMES } from '../oauth/schema-names';
import { storedList } from '../oauth/stored-list';

export const CATEGORIES = ['info', 'success', 'warning', 'error'] as const;
export type Category = (typeof CATEGORIES)[number];

const DAY = 24 * 60 * 60 * 1000;
const TITLE_MAX = 120;
const BODY_MAX = 500;
const KEY_MAX = 100;
const DEFAULT_LIFE = 30 * DAY;
const MAX_LIFE = 90 * DAY;
const DISMISSED_KEPT = 7 * DAY;
const PER_APP_PER_PERSON = 200;
const LIST_DEFAULT = 50;
const LIST_MAX = 100;
/** Sends in a minute for an app, and in an hour for one app to one person (core-app §4.1). */
export const APP_LIMIT = { count: 600, windowMs: 60_000 };
export const PAIR_LIMIT = { count: 60, windowMs: 60 * 60_000 };

/** One notification as a person or an app sees it. Times are milliseconds since the epoch. */
export type NotificationItem = {
  id: string;
  clientId: string;
  /** The app's name and icon, for the panel. */
  appName: string;
  appIcon: string | null;
  title: string;
  body: string | null;
  url: string | null;
  category: Category;
  createdAt: number;
  readAt: number | null;
  expiresAt: number;
};

/** What an app sends (core-app §4.1). */
export type SendInput = {
  to: unknown;
  title: unknown;
  body?: unknown;
  url?: unknown;
  category?: unknown;
  expiresAt?: unknown;
  key?: unknown;
};

export type Problem = { field: string; message: string };

export class NotificationError extends Error {
  override name = 'NotificationError';

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

export type NotificationOptions = {
  now?: () => number;
  /** A development instance, whose own address is `http`, accepts an `http` link on `localhost` (core-app §3.7.1). */
  development?: boolean;
};

const num = (value: unknown): number => Number(value);
const optional = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/**
 * The only writer of notifications (core-app §4.1). It decides who may be written to, what a message may say, and how many; it
 * answers a send to someone who may not receive it exactly as a delivered one, so a sender learns nothing about the person; and
 * it reads and changes only what it is asked about for the one account (and, for an app, the one app) it is given. Nothing here
 * takes an account from a request: the caller names it.
 */
export class NotificationService {
  readonly #database: Database;
  readonly #now: () => number;
  readonly #development: boolean;

  constructor(database: Database, options: NotificationOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? Date.now;
    this.#development = options.development ?? false;
  }

  // ---- sending -----------------------------------------------------------------

  /**
   * Sends a notification from an app to a person. `clientId` is the app, taken from its token. Throws `invalid` for what cannot be
   * used (before anything is counted or kept) and `rate-limited` over a limit. Whether the person is written to is not said:
   * a message that may not be delivered is dropped, and the answer is the same.
   */
  async send(clientId: string, input: SendInput): Promise<{ id: string }> {
    const now = this.#now();
    const app = await this.#app(clientId);
    const message = this.#checked(input, now, app?.origins ?? []);
    await this.#count(`notify-app|${clientId}`, APP_LIMIT);
    await this.#count(`notify-pair|${clientId}|${message.to}`, PAIR_LIMIT);

    if (!(await this.#mayWrite(clientId, message.to))) return { id: randomUUID() };

    if (message.key !== null) {
      const { rows } = await this.#database.run(
        `select id from notifications where client_id = ? and user_id = ? and idem_key = ? and created_at > ? limit 1`,
        [clientId, message.to, message.key, now - DAY],
      );
      if (rows[0]) return { id: String(rows[0].id) };
    }

    const id = randomUUID();
    await this.#database.transaction(async (tx) => {
      await tx.run(
        `delete from notifications where user_id = ? and (expires_at <= ? or (dismissed_at is not null and dismissed_at <= ?))`,
        [message.to, now, now - DISMISSED_KEPT],
      );
      await tx.run(
        `insert into notifications (id, user_id, client_id, title, body, url, category, created_at, read_at, dismissed_at, expires_at, idem_key)
         values (?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)`,
        [
          id,
          message.to,
          clientId,
          message.title,
          message.body,
          message.url,
          message.category,
          now,
          message.expiresAt,
          message.key,
        ],
      );
      // A person keeps at most so many from one app: the oldest go.
      const { rows } = await tx.run(
        `select id from notifications where user_id = ? and client_id = ? order by created_at desc, id desc`,
        [message.to, clientId],
      );
      for (const row of rows.slice(PER_APP_PER_PERSON)) {
        await tx.run('delete from notifications where id = ?', [String(row.id)]);
      }
    });
    return { id };
  }

  #checked(input: SendInput, now: number, origins: readonly string[]) {
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
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        problems.push({ field, message: 'must be plain text' });
      }
      return value;
    };
    const to = text('to', input.to, 255, true);
    const title = text('title', input.title, TITLE_MAX, true);
    const body = text('body', input.body, BODY_MAX, false);
    const key = text('key', input.key, KEY_MAX, false);

    let category: Category = 'info';
    if (input.category !== undefined) {
      if (
        typeof input.category === 'string' &&
        (CATEGORIES as readonly string[]).includes(input.category)
      ) {
        category = input.category as Category;
      } else {
        problems.push({ field: 'category', message: `must be ${CATEGORIES.join(', ')}` });
      }
    }

    let url: string | null = null;
    if (input.url !== undefined && input.url !== null) {
      const problem = this.#urlProblem(input.url, origins);
      if (problem) problems.push({ field: 'url', message: problem });
      else url = String(input.url);
    }

    let expiresAt = now + DEFAULT_LIFE;
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const at = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : Number.NaN;
      if (!Number.isFinite(at))
        problems.push({ field: 'expiresAt', message: 'must be a date and time' });
      else if (at <= now) problems.push({ field: 'expiresAt', message: 'must be in the future' });
      else if (at > now + MAX_LIFE)
        problems.push({ field: 'expiresAt', message: 'must be within 90 days' });
      else expiresAt = at;
    }

    if (problems.length > 0 || to === null || title === null) {
      throw new NotificationError('invalid', 'Some of what was sent cannot be used.', problems);
    }
    return { to, title: title.trim(), body, url, category, expiresAt, key };
  }

  /** A link is `https` (or `http` on localhost on a development instance) and on an origin of the app's own addresses. */
  #urlProblem(value: unknown, origins: readonly string[]): string | undefined {
    if (typeof value !== 'string' || value === '' || value.length > 2048)
      return 'must be an address';
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'must be an address';
    }
    if (url.username !== '' || url.password !== '')
      return 'must not contain a user name or password';
    const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost');
    if (url.protocol !== 'https:' && !(this.#development && local && url.protocol === 'http:')) {
      return 'must be https';
    }
    if (!origins.includes(url.origin)) return "must be on one of the app's own addresses";
    return undefined;
  }

  async #count(key: string, limit: { count: number; windowMs: number }): Promise<void> {
    const result = await countCall(this.#database, key, limit.count, limit.windowMs, this.#now());
    if (!result.allowed) {
      throw new NotificationError('rate-limited', 'Too many notifications.', [], result.retryAfter);
    }
  }

  /** The origins an app has registered: where a link of its may go. */
  async #app(clientId: string): Promise<{ origins: string[] } | undefined> {
    const { rows } = await this.#database.run(
      `select ${NAMES.client.redirectUris} as redirect_uris, ${NAMES.client.metadata} as metadata from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
      [clientId],
    );
    const row = rows[0];
    if (!row) return undefined;
    const addresses = storedList(row.redirect_uris);
    let metadata: unknown = row.metadata;
    for (let step = 0; step < 3 && typeof metadata === 'string'; step += 1) {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = undefined;
      }
    }
    const launchUrl = (metadata as { launcher?: { launchUrl?: unknown } } | undefined)?.launcher
      ?.launchUrl;
    if (typeof launchUrl === 'string') addresses.push(launchUrl);
    const origins = new Set<string>();
    for (const address of addresses) {
      try {
        origins.add(new URL(address).origin);
      } catch {
        // Not an address; it names no origin.
      }
    }
    return { origins: [...origins] };
  }

  /** Whether this person may be written to by this app: active, has used the app, has not switched it off. */
  async #mayWrite(clientId: string, userId: string): Promise<boolean> {
    const user = (
      await this.#database.run('select deactivated_at from users where id = ?', [userId])
    ).rows[0];
    if (!user || (user.deactivated_at !== null && user.deactivated_at !== undefined)) return false;
    const off = (
      await this.#database.run(
        'select enabled from notification_settings where user_id = ? and client_id = ?',
        [userId, clientId],
      )
    ).rows[0];
    if (off && Number(off.enabled) === 0) return false;
    return this.#hasUsed(userId, clientId);
  }

  /** A person has used an app when they agreed to it, or hold tokens it was given that are not revoked. */
  async #hasUsed(userId: string, clientId: string): Promise<boolean> {
    const found = async (sql: string) =>
      (await this.#database.run(sql, [userId, clientId])).rows.length > 0;
    return (
      (await found(
        `select 1 from ${NAMES.consents} where ${NAMES.consent.userId} = ? and ${NAMES.consent.clientId} = ? limit 1`,
      )) ||
      (await found(
        `select 1 from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ? and ${NAMES.refresh.clientId} = ? and ${NAMES.refresh.revoked} is null limit 1`,
      )) ||
      (await found(
        `select 1 from ${NAMES.accessTokens} where ${NAMES.access.userId} = ? and ${NAMES.access.clientId} = ? and ${NAMES.access.revoked} is null limit 1`,
      ))
    );
  }

  // ---- reading and changing, for one account ------------------------------------

  /** A person's notifications, newest first: not expired, not dismissed. `clientId` limits them to one app's. */
  async list(
    userId: string,
    options: { clientId?: string; unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationItem[]> {
    const limit = Math.min(LIST_MAX, Math.max(1, Math.floor(options.limit ?? LIST_DEFAULT)));
    const { rows } = await this.#database.run(
      `select n.id, n.client_id, n.title, n.body, n.url, n.category, n.created_at, n.read_at, n.expires_at,
              o.name as app_name, o.icon as app_icon
         from notifications n left join ${NAMES.clients} o on o.${NAMES.client.clientId} = n.client_id
        where n.user_id = ? and n.dismissed_at is null and n.expires_at > ?
          ${options.clientId === undefined ? '' : 'and n.client_id = ?'}
          ${options.unreadOnly ? 'and n.read_at is null' : ''}
        order by n.created_at desc, n.id desc limit ${limit}`,
      options.clientId === undefined
        ? [userId, this.#now()]
        : [userId, this.#now(), options.clientId],
    );
    return rows.map(itemOf);
  }

  /** How many a person has not read: what the bell shows. */
  async unreadCount(userId: string): Promise<number> {
    const { rows } = await this.#database.run(
      `select count(*) as n from notifications where user_id = ? and read_at is null and dismissed_at is null and expires_at > ?`,
      [userId, this.#now()],
    );
    return num(rows[0]?.n ?? 0);
  }

  /** Marks one read. Returns it, or nothing when this person has no such notification (or, for an app, none of its own). */
  markRead(userId: string, id: string, clientId?: string): Promise<NotificationItem | undefined> {
    return this.#change(userId, id, clientId, 'read_at = coalesce(read_at, ?)');
  }

  dismiss(userId: string, id: string, clientId?: string): Promise<NotificationItem | undefined> {
    return this.#change(
      userId,
      id,
      clientId,
      'dismissed_at = coalesce(dismissed_at, ?), read_at = coalesce(read_at, ?)',
    );
  }

  async #change(
    userId: string,
    id: string,
    clientId: string | undefined,
    set: string,
  ): Promise<NotificationItem | undefined> {
    const now = this.#now();
    const stamps = set.split('?').length - 1;
    const { rowsAffected } = await this.#database.run(
      `update notifications set ${set} where id = ? and user_id = ? and expires_at > ?${clientId === undefined ? '' : ' and client_id = ?'}`,
      [
        ...Array.from({ length: stamps }, () => now),
        id,
        userId,
        now,
        ...(clientId === undefined ? [] : [clientId]),
      ],
    );
    if (rowsAffected === 0) return undefined;
    const { rows } = await this.#database.run(
      `select n.id, n.client_id, n.title, n.body, n.url, n.category, n.created_at, n.read_at, n.expires_at,
              o.name as app_name, o.icon as app_icon
         from notifications n left join ${NAMES.clients} o on o.${NAMES.client.clientId} = n.client_id
        where n.id = ? and n.user_id = ?`,
      [id, userId],
    );
    return rows[0] ? itemOf(rows[0]) : undefined;
  }

  async markAllRead(userId: string, clientId?: string): Promise<number> {
    const now = this.#now();
    const { rowsAffected } = await this.#database.run(
      `update notifications set read_at = ? where user_id = ? and read_at is null and dismissed_at is null and expires_at > ?${clientId === undefined ? '' : ' and client_id = ?'}`,
      clientId === undefined ? [now, userId, now] : [now, userId, now, clientId],
    );
    return rowsAffected;
  }

  async dismissAll(userId: string, clientId?: string): Promise<number> {
    const now = this.#now();
    const { rowsAffected } = await this.#database.run(
      `update notifications set dismissed_at = ?, read_at = coalesce(read_at, ?) where user_id = ? and dismissed_at is null${clientId === undefined ? '' : ' and client_id = ?'}`,
      clientId === undefined ? [now, now, userId] : [now, now, userId, clientId],
    );
    return rowsAffected;
  }

  // ---- what a person controls -----------------------------------------------------

  /** The apps that can write to this person, with whether each is on: the apps they have used that hold `notifications:send`. */
  async apps(userId: string): Promise<{ clientId: string; name: string; enabled: boolean }[]> {
    const { rows } = await this.#database.run(
      `select o.${NAMES.client.clientId} as client_id, o.name as name, o.${NAMES.client.appScopes} as app_scopes,
              s.enabled as enabled
         from ${NAMES.clients} o
         left join notification_settings s on s.client_id = o.${NAMES.client.clientId} and s.user_id = ?
        where o.${NAMES.client.clientId} in (
                select ${NAMES.consent.clientId} from ${NAMES.consents} where ${NAMES.consent.userId} = ?
                union select ${NAMES.refresh.clientId} from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ? and ${NAMES.refresh.revoked} is null
                union select ${NAMES.access.clientId} from ${NAMES.accessTokens} where ${NAMES.access.userId} = ? and ${NAMES.access.revoked} is null)`,
      [userId, userId, userId, userId],
    );
    return rows
      .filter((row) => storedList(row.app_scopes).includes('notifications:send'))
      .map((row) => ({
        clientId: String(row.client_id),
        name: row.name === null || row.name === undefined ? 'An app' : String(row.name),
        enabled:
          row.enabled === null || row.enabled === undefined ? true : Number(row.enabled) !== 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Switches an app's notifications for this person on or off. */
  async setEnabled(userId: string, clientId: string, enabled: boolean): Promise<void> {
    await this.#database.run(
      `insert into notification_settings (user_id, client_id, enabled) values (?, ?, ?)
       on conflict (user_id, client_id) do update set enabled = excluded.enabled`,
      [userId, clientId, enabled ? 1 : 0],
    );
  }

  /** Clears everything this person was told, from every app. */
  async clearAll(userId: string): Promise<number> {
    return this.dismissAll(userId);
  }
}

/** Removes what one app sent one person, and the person's switch for it: what Remove access ends (core-app §3.6.4, §4.1). */
export async function removeNotifications(
  tx: Pick<Executor, 'run'>,
  userId: string,
  clientId: string,
): Promise<void> {
  await tx.run('delete from notifications where user_id = ? and client_id = ?', [userId, clientId]);
  await tx.run('delete from notification_settings where user_id = ? and client_id = ?', [
    userId,
    clientId,
  ]);
}

/** Removes everything an app sent and every switch for it: what deleting the app ends. */
export async function removeAppNotifications(
  tx: Pick<Executor, 'run'>,
  clientId: string,
): Promise<void> {
  await tx.run('delete from notifications where client_id = ?', [clientId]);
  await tx.run('delete from notification_settings where client_id = ?', [clientId]);
}

function itemOf(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    appName: row.app_name === null || row.app_name === undefined ? 'An app' : String(row.app_name),
    appIcon: row.app_icon === null || row.app_icon === undefined ? null : String(row.app_icon),
    title: String(row.title),
    body: row.body === null || row.body === undefined ? null : String(row.body),
    url: row.url === null || row.url === undefined ? null : String(row.url),
    category: String(row.category) as Category,
    createdAt: num(row.created_at),
    readAt: optional(row.read_at),
    expiresAt: num(row.expires_at),
  };
}
