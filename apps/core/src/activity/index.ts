import { getAuthSettings } from '../auth';
import { getDatabase } from '../database';
import { ActivityService } from './service';

export { ActivityError, ActivityService, type ActivityItem } from './service';

let opened: Promise<ActivityService> | undefined;

/**
 * Core's activity service, for the life of the process. An instance whose own address is `http` is a development instance, and
 * accepts an `http` link on `localhost` (core-app §3.7.1, §4.3).
 */
export function getActivityService(): Promise<ActivityService> {
  opened ??= getDatabase()
    .then(
      (database) =>
        new ActivityService(database, {
          development: new URL(getAuthSettings().baseUrl).protocol === 'http:',
        }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
