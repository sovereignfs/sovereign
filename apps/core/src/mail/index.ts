import { getConfig } from '../config';
import { getInstanceIdentity } from '../instance/service';
import { getSettings } from '../settings';
import { EmailService } from './emails';
import { MailService } from './service';

export { emailLink, EmailService } from './emails';
export { MailService, mailStartupWarning } from './service';

let opened: Promise<MailService> | undefined;

/** Core's mail service, for the life of the process. */
export function getMailService(): Promise<MailService> {
  opened ??= getSettings()
    .then((settings) => new MailService(settings))
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}

let openedEmails: Promise<EmailService> | undefined;

/** Core's emails (rendering and sending), for the life of the process. */
export function getEmailService(): Promise<EmailService> {
  openedEmails ??= Promise.all([getMailService(), getSettings()])
    .then(
      ([mail, settings]) =>
        new EmailService({
          mail,
          settings,
          config: getConfig(),
          logoUrl: async () => (await getInstanceIdentity()).emailLogo,
        }),
    )
    .catch((error: unknown) => {
      openedEmails = undefined;
      throw error;
    });
  return openedEmails;
}
