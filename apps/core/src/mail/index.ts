import { getAuthSettings } from '../auth';
import { getConfig } from '../config';
import { getDatabase } from '../database';
import { getInstanceIdentity } from '../instance/service';
import { getSettings } from '../settings';
import { emailLink, EmailService } from './emails';
import { MailForAppsService } from './apps';
import { MailService } from './service';

export { emailLink, EmailService } from './emails';
export { MailService, mailStartupWarning } from './service';
export { AppMailError, MailForAppsService } from './apps';

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

let openedForApps: Promise<MailForAppsService> | undefined;

/**
 * Core's email for apps (core-app §4.2), for the life of the process. It draws in core's template and sends from the instance's own
 * mail. An instance whose own address is `http` is a development instance, and accepts an `http` link on `localhost`.
 */
export function getMailForAppsService(): Promise<MailForAppsService> {
  openedForApps ??= Promise.all([getDatabase(), getMailService(), getEmailService()])
    .then(
      ([database, mail, emails]) =>
        new MailForAppsService(
          database,
          mail,
          (request) => emails.render(request),
          emailLink(getConfig(), '/preferences'),
          { development: new URL(getAuthSettings().baseUrl).protocol === 'http:' },
        ),
    )
    .catch((error: unknown) => {
      openedForApps = undefined;
      throw error;
    });
  return openedForApps;
}
