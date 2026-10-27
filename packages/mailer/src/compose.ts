import { isEmailAddress, isSender } from './address.js';
import { MailError } from './errors.js';
import type { ComposedMessage, MailMessage } from './types.js';

const MAX_RECIPIENTS = 50;
const MAX_SUBJECT = 998; // the SMTP line limit
const MAX_BODY_BYTES = 1_000_000;

/**
 * Checks a message and settles its sender. Nothing reaches a transport that fails here, so the
 * errors are about the message and name no server. A subject or address with a line break would
 * let a caller smuggle in headers, so those are refused rather than cleaned.
 */
export function compose(message: MailMessage, defaultFrom: string): ComposedMessage {
  const invalid = (reason: string) =>
    new MailError('invalid-message', `The message cannot be sent: ${reason}.`);

  const to = typeof message.to === 'string' ? [message.to] : [...message.to];
  if (to.length === 0) throw invalid('it has no recipient');
  if (to.length > MAX_RECIPIENTS) throw invalid(`it has more than ${MAX_RECIPIENTS} recipients`);
  if (!to.every(isEmailAddress)) throw invalid('a recipient is not a valid email address');

  const from = message.from ?? defaultFrom;
  if (!isSender(from)) throw invalid('the sender is not a valid email address');

  if (message.subject.trim() === '') throw invalid('it has no subject');
  if (message.subject.length > MAX_SUBJECT) throw invalid('the subject is too long');
  if (/[\r\n]/.test(message.subject)) throw invalid('the subject contains a line break');

  if (message.text === undefined && message.html === undefined) throw invalid('it has no body');
  for (const body of [message.text, message.html]) {
    if (body !== undefined && Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      throw invalid('the body is too large');
    }
  }
  return { from, to, subject: message.subject, text: message.text, html: message.html };
}
