import { isSender } from './address.js';
import type { SmtpSettings } from './types.js';

/** What the settings say, before it is known whether they are usable. */
export type SmtpInput = {
  host?: string | undefined;
  port?: number | undefined;
  user?: string | undefined;
  password?: string | undefined;
  from?: string | undefined;
  /** A password is saved but cannot be decrypted (its key left the key ring). */
  passwordUnreadable?: boolean | undefined;
};

export type SmtpStatus =
  /** Nothing is set: email is simply off. */
  | { state: 'not-configured'; reasons: string[] }
  /** Something is set but not enough to send, or something is wrong. */
  | { state: 'incomplete'; reasons: string[] }
  | { state: 'configured'; settings: SmtpSettings };

export const DEFAULT_SMTP_PORT = 587;

/**
 * Whether the settings can send mail, and if not, what is missing, in words for the person who
 * has to fix it. A half-set configuration is `incomplete`, not `not-configured`: that is
 * someone's mistake and should be said, where nothing set at all is a choice.
 */
export function resolveSmtp(input: SmtpInput): SmtpStatus {
  const host = input.host?.trim() || undefined;
  const from = input.from?.trim() || undefined;
  const user = input.user?.trim() || undefined;
  const hasPassword = input.password !== undefined && input.password !== '';

  if (
    !host &&
    !from &&
    !user &&
    !hasPassword &&
    !input.passwordUnreadable &&
    input.port === undefined
  ) {
    return { state: 'not-configured', reasons: ['no SMTP server is set'] };
  }

  const reasons: string[] = [];
  if (!host) reasons.push('the SMTP server (host) is missing');
  if (!from) reasons.push('the "from" address is missing');
  else if (!isSender(from)) reasons.push('the "from" address is not a valid email address');
  if (input.passwordUnreadable) {
    reasons.push('the saved SMTP password cannot be decrypted; enter it again');
  } else if (Boolean(user) !== hasPassword) {
    reasons.push('the SMTP user and password must be set together');
  }
  if (reasons.length > 0 || !host || !from) return { state: 'incomplete', reasons };

  return {
    state: 'configured',
    settings: {
      host,
      port: input.port ?? DEFAULT_SMTP_PORT,
      ...(user && hasPassword ? { user, password: input.password } : {}),
      from,
    },
  };
}

/** The sentence an operator reads when mail is wanted and cannot be sent. */
export function describeSmtpProblem(status: Exclude<SmtpStatus, { state: 'configured' }>): string {
  return (
    `Email is not set up: ${status.reasons.join('; ')}. ` +
    'Set SV_SMTP_HOST and SV_SMTP_FROM (and SV_SMTP_USER with SV_SMTP_PASSWORD if the server needs a login), ' +
    'or configure SMTP in the Console.'
  );
}
