export type MailErrorCode =
  /** No usable SMTP configuration: nothing was attempted. */
  | 'not-configured'
  /** The message itself is wrong (an address, a subject, no body): nothing was attempted. */
  | 'invalid-message'
  /** The server could not be reached (refused, timed out, name not found, TLS failed). */
  | 'connection-failed'
  /** The server refused the credentials. */
  | 'authentication-failed'
  /** The server refused the message or an address in it. */
  | 'rejected'
  /** Anything else that went wrong while sending. */
  | 'send-failed';

/**
 * Sending mail failed, and says why in words an operator can act on. A flow that needs mail
 * (an invitation, a password reset) lets this reach the person, so that a missing or wrong
 * configuration is never silent. The message never includes a credential, the body, or the
 * underlying library's own text, which can echo the user name or the server's reply.
 */
export class MailError extends Error {
  override name = 'MailError';

  constructor(
    readonly code: MailErrorCode,
    message: string,
    /** The SMTP reply code, when the server gave one (535 for bad credentials, say). */
    readonly responseCode?: number,
  ) {
    super(message);
  }
}

export function isMailError(error: unknown): error is MailError {
  return error instanceof MailError;
}
