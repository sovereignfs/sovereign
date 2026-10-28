import { describeSmtpProblem } from '@sovereignfs/mailer';
import type { EmailService } from '../mail/emails';
import type { MailService } from '../mail/service';

/** The person an email is for. */
export type Recipient = { email: string; name: string };

/**
 * The emails sign-in sends (core-app §3.3, §3.14), apart from better-auth so tests can watch them.
 *
 * Whether mail can be sent at all is asked up front (`unavailable`), so a request that needs it
 * fails the same way for every address. A send that goes wrong after that (the mail server is
 * down) is logged and never thrown: the request has already answered, in the same words as when
 * it works, because an answer that changed with a failed send would tell whether the address has
 * an account.
 */
export type AuthMail = {
  /** Why mail cannot be sent now, for the log, or `undefined` when it can. */
  unavailable(): Promise<string | undefined>;
  verification(to: Recipient, link: string): Promise<void>;
  passwordReset(to: Recipient, link: string): Promise<void>;
  accountCreated(to: Recipient): Promise<void>;
};

export function authMailFrom(
  emails: EmailService,
  mail: MailService,
  log: (message: string) => void = (message) => console.warn(message),
): AuthMail {
  const send = async (
    what: string,
    to: Recipient,
    request: Parameters<EmailService['send']>[1],
  ) => {
    try {
      await emails.send(to.email, request);
    } catch (error) {
      // A MailError's message is written to be shown; it never repeats a credential.
      log(
        `Could not send the ${what} email: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  };
  return {
    async unavailable() {
      const status = await mail.status();
      return status.state === 'configured' ? undefined : describeSmtpProblem(status);
    },
    verification: (to, link) => send('verification', to, { template: 'verifyEmail', link }),
    passwordReset: (to, link) => send('password reset', to, { template: 'passwordReset', link }),
    accountCreated: (to) =>
      send('account created', to, {
        template: 'accountCreated',
        link: emails.link('/sign-in'),
        name: to.name,
      }),
  };
}
