import { compose } from './compose.js';
import { MailError } from './errors.js';
import type { Mailer, MailMessage, SentMail, Transport } from './types.js';

/** A mailer over a transport. `from` is the sender of every message that does not name its own. */
export function createMailer(transport: Transport, options: { from: string }): Mailer {
  return {
    send(message: MailMessage): Promise<SentMail> {
      let composed;
      try {
        composed = compose(message, options.from);
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return transport.send(composed).catch((error: unknown) => {
        // Already a MailError (the SMTP transport translates its own): pass it on unchanged.
        if (error instanceof MailError) throw error;
        throw new MailError('send-failed', 'Sending the email failed.');
      });
    },
  };
}

/** A mailer for when email is not set up: every send fails, saying so, so no flow ignores it. */
export function createUnavailableMailer(message: string): Mailer {
  return {
    send(): Promise<SentMail> {
      return Promise.reject(new MailError('not-configured', message));
    },
  };
}
