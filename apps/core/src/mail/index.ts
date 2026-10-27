import { getSettings } from '../settings';
import { MailService } from './service';

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
