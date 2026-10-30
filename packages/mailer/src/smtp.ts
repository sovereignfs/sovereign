import nodemailer, { type Transporter } from 'nodemailer';
import { MailError } from './errors.js';
import type { SentMail, SmtpSettings, Transport } from './types.js';

/**
 * nodemailer's own defaults are two minutes to connect and ten minutes of socket idle. Every send
 * is awaited from a request (sign-up, password reset), so an unreachable server would hold the
 * request that long. These bound the worst case; a slow relay still has room.
 */
export const SMTP_TIMEOUTS_MS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

export type SmtpTransportOptions = {
  timeouts?: Partial<Record<keyof typeof SMTP_TIMEOUTS_MS, number>>;
  /** Extra TLS options (a private CA, say). The default verifies the server's certificate. */
  tls?: { ca?: string | Buffer };
};

/**
 * An SMTP transport.
 *
 * **Credentials never travel in the clear.** With a user and password, the connection must be
 * encrypted: implicit TLS (port 465, or `secure`) or a STARTTLS upgrade that is required, not
 * merely offered. A server that does not offer TLS makes the send fail, instead of the password
 * going out unprotected. Without credentials STARTTLS is used when offered, so a local mail catcher
 * on a plain port still works. The server's certificate is verified.
 */
export function createSmtpTransport(
  settings: SmtpSettings,
  options: SmtpTransportOptions = {},
): Transport {
  const secure = settings.secure ?? settings.port === 465;
  const authenticated = Boolean(settings.user && settings.password);
  const transporter: Transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure,
    requireTLS: authenticated && !secure,
    auth: authenticated
      ? { user: settings.user as string, pass: settings.password as string }
      : undefined,
    tls: { minVersion: 'TLSv1.2', ...(options.tls?.ca ? { ca: options.tls.ca } : {}) },
    ...SMTP_TIMEOUTS_MS,
    ...options.timeouts,
  });

  return {
    async send(message): Promise<SentMail> {
      try {
        const result = await transporter.sendMail({
          from: message.from,
          to: [...message.to],
          subject: message.subject,
          ...(message.text === undefined ? {} : { text: message.text }),
          ...(message.html === undefined ? {} : { html: message.html }),
          ...(message.unsubscribe === undefined
            ? {}
            : { list: { unsubscribe: message.unsubscribe } }),
        });
        return {
          accepted: (result.accepted ?? []).map(String),
          rejected: (result.rejected ?? []).map(String),
        };
      } catch (error) {
        throw translate(error);
      }
    },
    close() {
      transporter.close();
    },
  };
}

const CONNECTION = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETLS',
  'EPROTOCOL',
]);

/**
 * nodemailer's error text can echo the user name or the server's reply, so it is not passed on:
 * the message is ours, from the error's code, and only the numeric SMTP reply is kept.
 */
function translate(error: unknown): MailError {
  const code = (error as { code?: unknown }).code;
  const responseCode = (error as { responseCode?: unknown }).responseCode;
  const reply = typeof responseCode === 'number' ? responseCode : undefined;

  if (code === 'EAUTH') {
    return new MailError(
      'authentication-failed',
      'The mail server refused the SMTP user name or password.',
      reply,
    );
  }
  if (code === 'EENVELOPE' || code === 'EMESSAGE' || (reply !== undefined && reply >= 500)) {
    return new MailError(
      'rejected',
      'The mail server rejected the message or an address in it.',
      reply,
    );
  }
  if (typeof code === 'string' && CONNECTION.has(code)) {
    return new MailError(
      'connection-failed',
      'The mail server could not be reached, or the secure connection to it could not be set up.',
      reply,
    );
  }
  return new MailError(
    'send-failed',
    `Sending the email failed${typeof code === 'string' ? ` (${code})` : ''}.`,
    reply,
  );
}
