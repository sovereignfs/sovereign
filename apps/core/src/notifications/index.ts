import { getAuthSettings } from '../auth';
import { getDatabase } from '../database';
import { NotificationService } from './service';

export { NotificationError, NotificationService, type NotificationItem } from './service';

let opened: Promise<NotificationService> | undefined;

/**
 * Core's notification service, for the life of the process. An instance whose own address is `http` is a development instance, and
 * accepts an `http` link on `localhost` (core-app §3.7.1, §4.1).
 */
export function getNotificationService(): Promise<NotificationService> {
  opened ??= getDatabase()
    .then(
      (database) =>
        new NotificationService(database, {
          development: new URL(getAuthSettings().baseUrl).protocol === 'http:',
        }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
