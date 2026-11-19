import { describeSmtpProblem } from '@sovereignfs/mailer';
import type { EmailService } from '../mail/emails';
import type { MailService } from '../mail/service';
import type { AuthMail, Recipient } from '@sovereignfs/auth/server';

export type { AuthMail, Recipient };

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
