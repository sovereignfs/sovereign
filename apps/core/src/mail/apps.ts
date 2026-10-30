import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '@sovereignfs/database';
import type { RenderedEmail, SentMail, SmtpStatus } from '@sovereignfs/mailer';
import type { EmailRequest } from '@sovereignfs/mailer';
import { countCall } from '../api/rate-limit';
import { appOrigins, hasUsed, linkProblem } from '../clients/use';
import { NAMES } from '../oauth/schema-names';
import { storedList } from '../oauth/stored-list';

const DAY = 24 * 60 * 60 * 1000;
const SUBJECT_MAX = 150;
const BODY_MAX = 5000;
const KEY_MAX = 100;
/** Sends in a minute for an app, and for one app to one person in an hour and in a day (core-app §4.2). */
export const APP_LIMIT = { count: 100, windowMs: 60_000 };
export const PAIR_HOUR_LIMIT = { count: 5, windowMs: 60 * 60_000 };
export const PAIR_DAY_LIMIT = { count: 20, windowMs: DAY };

export type Problem = { field: string; message: string };

/** What an app sends (core-app §4.2). */
export type EmailInput = {
  to: unknown;
  subject: unknown;
  body: unknown;
  link?: unknown;
  key?: unknown;
};

export class AppMailError extends Error {
  override name = 'AppMailError';

  constructor(
    /** `unavailable`: the instance has no mail, so the operation is not there (404). */
    readonly code: 'invalid' | 'rate-limited' | 'unavailable',
    message: string,
    readonly problems: readonly Problem[] = [],
    /** For `rate-limited`: seconds to wait. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export type AppMailOptions = {
  now?: () => number;
  /** A development instance, whose own address is `http`, accepts an `http` link on `localhost` (core-app §3.7.1). */
  development?: boolean;
  /** Told, without the text or the person, why a send was dropped or failed. The operator's log. */
  log?: (line: string) => void;
};

/** What the service needs of core's mail, so it can be tried without a mail server. */
export type AppMailTransport = {
  status(): Promise<SmtpStatus>;
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    unsubscribe: string;
  }): Promise<SentMail>;
};

/** Draws a message in core's template, with the instance's name and logo. */
export type AppMailRenderer = (request: EmailRequest) => Promise<RenderedEmail>;

/**
 * Email from an app to a person it names by `sub` (core-app §4.2). The address never leaves core: this looks it up, draws the
 * message in core's own template and sends it from the instance's own mail. Like notifications it answers a send that may not be
 * delivered exactly as a delivered one, says nothing of delivery, and keeps no message: only the key an app gave a send, for a day.
 */
export class MailForAppsService {
  readonly #database: Database;
  readonly #mail: AppMailTransport;
  readonly #render: AppMailRenderer;
  readonly #manageUrl: string;
  readonly #now: () => number;
  readonly #development: boolean;
  readonly #log: (line: string) => void;
  readonly #delivering = new Set<Promise<void>>();

  constructor(
    database: Database,
    mail: AppMailTransport,
    render: AppMailRenderer,
    /** Where a person switches an app's emails off: a page on core. */
    manageUrl: string,
    options: AppMailOptions = {},
  ) {
    this.#database = database;
    this.#mail = mail;
    this.#render = render;
    this.#manageUrl = manageUrl;
    this.#now = options.now ?? Date.now;
    this.#development = options.development ?? false;

    this.#log = options.log ?? ((line) => console.warn(line));
  }

  /** Whether this instance can send mail at all: what the instance document lists, and whether the operation is there. */
  async available(): Promise<boolean> {
    return (await this.#mail.status()).state === 'configured';
  }

  /**
   * Sends an email from an app to a person. `clientId` is the app, taken from its token. Throws `unavailable` when the instance has
   * no mail, `invalid` for what cannot be used (before anything is counted), `rate-limited` over a limit. Whether the person is
   * written to is not said, and the message is handed to the mail server after the answer, so the answer takes no longer for a
   * delivered message than for a dropped one.
   */
  async send(clientId: string, input: EmailInput): Promise<{ id: string }> {
    if (!(await this.available())) {
      throw new AppMailError('unavailable', 'This instance does not send email for apps.');
    }
    const now = this.#now();
    const app = await appOrigins(this.#database, clientId);
    const message = this.#checked(input, app?.origins ?? []);
    await this.#count(`mail-app|${clientId}`, APP_LIMIT);
    await this.#count(`mail-pair-hour|${clientId}|${message.to}`, PAIR_HOUR_LIMIT);
    await this.#count(`mail-pair-day|${clientId}|${message.to}`, PAIR_DAY_LIMIT);

    const person = await this.#recipient(clientId, message.to);
    if (!person.ok) {
      this.#log(`Email from app ${clientId} was not sent: ${person.reason}.`);
      return { id: randomUUID() };
    }

    const id = randomUUID();
    if (message.key !== null) {
      const seen = await this.#database.run(
        `select id from app_mail_keys where client_id = ? and user_id = ? and idem_key = ? and created_at > ? limit 1`,
        [clientId, message.to, message.key, now - DAY],
      );
      if (seen.rows[0]) return { id: String(seen.rows[0].id) };
      await this.#database.transaction(async (tx) => {
        await tx.run('delete from app_mail_keys where created_at <= ?', [now - DAY]);
        await tx.run(
          `insert into app_mail_keys (id, user_id, client_id, idem_key, created_at) values (?, ?, ?, ?, ?)`,
          [id, message.to, clientId, message.key, now],
        );
      });
    }

    this.#deliver(clientId, person.address, app?.name ?? 'An app', message);
    return { id };
  }

  /** Waits for the messages handed to the mail server so far: for a test, and for a process that is stopping. */
  async settled(): Promise<void> {
    await Promise.all([...this.#delivering]);
  }

  #deliver(
    clientId: string,
    address: string,
    appName: string,
    message: { subject: string; body: string; link: string | null },
  ): void {
    const work = (async () => {
      try {
        const email = await this.#render({
          template: 'appMessage',
          appName,
          subject: message.subject,
          body: message.body,
          ...(message.link === null ? {} : { appLink: message.link }),
          manageUrl: this.#manageUrl,
        });
        await this.#mail.send({
          to: address,
          subject: email.subject,
          text: email.text,
          html: email.html,
          // The line at the foot of the message links to the same switches (core-app §4.2).
          unsubscribe: this.#manageUrl,
        });
      } catch (error) {
        // Not kept and not retried (core-app §4.2). The log names the app and the kind of failure, never the person or the text.
        this.#log(
          `Email from app ${clientId} could not be sent: ${error instanceof Error ? error.name : 'unknown failure'}.`,
        );
      }
    })();
    this.#delivering.add(work);
    void work.finally(() => this.#delivering.delete(work));
  }

  #checked(input: EmailInput, origins: readonly string[]) {
    const problems: Problem[] = [];
    const text = (
      field: string,
      value: unknown,
      max: number,
      required: boolean,
      multiline: boolean,
    ): string | null => {
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
      // Control characters are refused; a body may keep its line breaks and tabs, a subject and a key may not.
      const refused = multiline
        ? // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
        : // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
          /[\u0000-\u001f\u007f]/;
      if (refused.test(value)) {
        problems.push({
          field,
          message: multiline ? 'must be plain text' : 'must be one line of plain text',
        });
      }
      return value;
    };
    const to = text('to', input.to, 255, true, false);
    const subject = text('subject', input.subject, SUBJECT_MAX, true, false);
    const body = text('body', input.body, BODY_MAX, true, true);
    const key = text('key', input.key, KEY_MAX, false, false);

    let link: string | null = null;
    if (input.link !== undefined && input.link !== null) {
      const problem = linkProblem(input.link, origins, this.#development);
      if (problem) problems.push({ field: 'link', message: problem });
      else link = String(input.link);
    }

    if (problems.length > 0 || to === null || subject === null || body === null) {
      throw new AppMailError('invalid', 'Some of what was sent cannot be used.', problems);
    }
    return { to, subject: subject.trim(), body, link, key };
  }

  async #count(key: string, limit: { count: number; windowMs: number }): Promise<void> {
    const result = await countCall(this.#database, key, limit.count, limit.windowMs, this.#now());
    if (!result.allowed) {
      throw new AppMailError('rate-limited', 'Too many emails.', [], result.retryAfter);
    }
  }

  /**
   * The address of a person this app may write to: active, address verified, has used the app, has not switched its emails off.
   * The reason it may not is for the operator's log only.
   */
  async #recipient(
    clientId: string,
    userId: string,
  ): Promise<{ ok: true; address: string } | { ok: false; reason: string }> {
    const user = (
      await this.#database.run(
        'select email, email_verified, deactivated_at from users where id = ?',
        [userId],
      )
    ).rows[0];
    if (!user) return { ok: false, reason: 'no such person' };
    if (user.deactivated_at !== null && user.deactivated_at !== undefined) {
      return { ok: false, reason: 'the account is deactivated' };
    }
    if (Number(user.email_verified) !== 1) {
      return { ok: false, reason: 'the address is not verified' };
    }
    const off = (
      await this.#database.run(
        'select enabled from app_mail_settings where user_id = ? and client_id = ?',
        [userId, clientId],
      )
    ).rows[0];
    if (off && Number(off.enabled) === 0) return { ok: false, reason: 'the person turned it off' };
    if (!(await hasUsed(this.#database, userId, clientId))) {
      return { ok: false, reason: 'the person has not used the app' };
    }
    return { ok: true, address: String(user.email) };
  }

  // ---- what a person controls -----------------------------------------------------

  /** The apps that can email this person, with whether each is on: the apps they have used that hold `email:send`. */
  async apps(userId: string): Promise<{ clientId: string; name: string; enabled: boolean }[]> {
    const { rows } = await this.#database.run(
      `select o.${NAMES.client.clientId} as client_id, o.name as name, o.${NAMES.client.appScopes} as app_scopes,
              s.enabled as enabled
         from ${NAMES.clients} o
         left join app_mail_settings s on s.client_id = o.${NAMES.client.clientId} and s.user_id = ?
        where o.${NAMES.client.clientId} in (
                select ${NAMES.consent.clientId} from ${NAMES.consents} where ${NAMES.consent.userId} = ?
                union select ${NAMES.refresh.clientId} from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ? and ${NAMES.refresh.revoked} is null
                union select ${NAMES.access.clientId} from ${NAMES.accessTokens} where ${NAMES.access.userId} = ? and ${NAMES.access.revoked} is null)`,
      [userId, userId, userId, userId],
    );
    return rows
      .filter((row) => storedList(row.app_scopes).includes('email:send'))
      .map((row) => ({
        clientId: String(row.client_id),
        name: row.name === null || row.name === undefined ? 'An app' : String(row.name),
        enabled:
          row.enabled === null || row.enabled === undefined ? true : Number(row.enabled) !== 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Switches an app's emails for this person on or off. */
  async setEnabled(userId: string, clientId: string, enabled: boolean): Promise<void> {
    await this.#database.run(
      `insert into app_mail_settings (user_id, client_id, enabled) values (?, ?, ?)
       on conflict (user_id, client_id) do update set enabled = excluded.enabled`,
      [userId, clientId, enabled ? 1 : 0],
    );
  }
}

/** Removes a person's switch and the keys for one app: what Remove access ends (core-app §3.6.4, §4.2). */
export async function removeAppMail(
  tx: Pick<Executor, 'run'>,
  userId: string,
  clientId: string,
): Promise<void> {
  await tx.run('delete from app_mail_settings where user_id = ? and client_id = ?', [
    userId,
    clientId,
  ]);
  await tx.run('delete from app_mail_keys where user_id = ? and client_id = ?', [userId, clientId]);
}

/** Removes every switch and key for an app: what deleting the app ends. */
export async function removeAppMailOfApp(
  tx: Pick<Executor, 'run'>,
  clientId: string,
): Promise<void> {
  await tx.run('delete from app_mail_settings where client_id = ?', [clientId]);
  await tx.run('delete from app_mail_keys where client_id = ?', [clientId]);
}
