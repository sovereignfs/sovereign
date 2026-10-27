import { createHash } from 'node:crypto';
import {
  createMailer,
  createSmtpTransport,
  createUnavailableMailer,
  describeSmtpProblem,
  resolveSmtp,
  type Mailer,
  type MailMessage,
  type SentMail,
  type SmtpSettings,
  type SmtpStatus,
  type Transport,
} from '@sovereignfs/mailer';
import { SETTINGS } from '../settings/definitions';
import type { SettingsStore } from '../settings/store';

export type TransportFactory = (settings: SmtpSettings) => Transport;

/**
 * How core sends mail: through the SMTP server its settings describe, read afresh on every send
 * (a value saved in the Console wins over `SV_SMTP_*`, and a change applies without a restart).
 *
 * When email is not set up, or only half set up, `send` **fails**, saying what is missing: a flow
 * that needs mail (an invitation, a password reset) must never carry on as if it had been sent.
 * The one transport in use is kept while the settings stay the same, and closed when they change.
 */
export class MailService {
  readonly #store: SettingsStore;
  readonly #createTransport: TransportFactory;
  #current: { fingerprint: string; transport: Transport; mailer: Mailer } | undefined;

  constructor(store: SettingsStore, options: { createTransport?: TransportFactory } = {}) {
    this.#store = store;
    this.#createTransport =
      options.createTransport ?? ((settings) => createSmtpTransport(settings));
  }

  /** Whether mail can be sent now, and if not, what is missing. */
  async status(): Promise<SmtpStatus> {
    const [host, port, user, from, password] = await Promise.all([
      this.#store.get(SETTINGS.smtpHost),
      this.#store.get(SETTINGS.smtpPort),
      this.#store.get(SETTINGS.smtpUser),
      this.#store.get(SETTINGS.smtpFrom),
      this.#store.get(SETTINGS.smtpPassword),
    ]);
    return resolveSmtp({
      host: host.value,
      port: port.value,
      user: user.value,
      from: from.value,
      password: password.value,
      passwordUnreadable: password.unreadable,
    });
  }

  /** Sends a message, or throws a `MailError` that says why it could not be. */
  async send(message: MailMessage): Promise<SentMail> {
    return (await this.#mailer()).send(message);
  }

  async #mailer(): Promise<Mailer> {
    const status = await this.status();
    if (status.state !== 'configured') {
      this.#drop();
      return createUnavailableMailer(describeSmtpProblem(status));
    }
    // The settings include the password, so only a digest of them is kept for comparison.
    const fingerprint = createHash('sha256').update(JSON.stringify(status.settings)).digest('hex');
    if (this.#current?.fingerprint !== fingerprint) {
      this.#drop();
      const transport = this.#createTransport(status.settings);
      this.#current = {
        fingerprint,
        transport,
        mailer: createMailer(transport, { from: status.settings.from }),
      };
    }
    return this.#current.mailer;
  }

  #drop(): void {
    this.#current?.transport.close?.();
    this.#current = undefined;
  }
}

/**
 * The warning logged at start-up when email cannot be sent, or `undefined` when it can. It says
 * the consequence that matters most: with email verification required (the default), nobody can
 * finish signing up (core-app §3.14).
 */
export function mailStartupWarning(status: SmtpStatus): string | undefined {
  if (status.state === 'configured') return undefined;
  return (
    `${describeSmtpProblem(status)} Until it is, nothing that needs email can be sent: ` +
    'invitations, password resets and notices fail with this message, and sign-up that requires ' +
    'email verification (the default) cannot be completed.'
  );
}
