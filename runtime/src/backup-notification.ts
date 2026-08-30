import { randomUUID } from 'node:crypto';
import { sendNotification } from '@sovereignfs/db';
import { getPlatformDb } from './db';
import { logger } from './logger';
import { getBroker } from './notification-broker';
import { fanOutPushToUser } from './push';

export interface BackupNotificationPayload {
  jobId: string;
  scope: 'instance' | 'user';
  status: 'complete' | 'failed';
  errorMessage?: string;
  /** The `backup_jobs` row's `requestedByUserId` — null for an instance-scope
   *  job with no identifiable requester. */
  recipientUserId: string | null;
}

/**
 * Send a notification when a backup job completes (RFC 0084, epic task 8.16).
 * This is the platform-level (non-plugin) integration point into the existing
 * notification broker/push infrastructure that `NotificationBell`/
 * `sdk.notifications` already surface through.
 *
 * Notifies the user who requested the backup, when known. An instance-scope
 * job with no identifiable requester (`recipientUserId: null`) is an
 * explicit, logged gap: there is no primitive anywhere in `packages/db` or
 * `runtime/src` today that enumerates admin user IDs (role data lives in the
 * separate `apps/auth` service, not the platform DB) — this does NOT silently
 * no-op, it logs a warning naming the gap.
 *
 * Deliberately does not go through `sdk.notifications.send()`
 * (`runtime/src/sdk-host.ts`'s `notifications.send`) — that path hardcodes
 * `source: pluginId, sourceType: 'plugin'` and assumes a real plugin route
 * context this tick doesn't have (the backup worker runs outside any
 * request, the same class of gap `sdk.storage`/`sdk.env`/`sdk.db.getClient()`
 * already hit and fixed via background-context fallbacks). Calls the
 * DB/broker/push primitives directly instead, using `SendNotificationInput`'s
 * `sourceType: 'platform'` literal.
 */
export async function notifyBackupCompletion(payload: BackupNotificationPayload): Promise<void> {
  if (payload.recipientUserId === null) {
    logger.warn(
      'backup-notification: instance-scope job has no requester to notify; admin fan-out is not implemented',
      { jobId: payload.jobId, scope: payload.scope },
    );
    return;
  }

  const title =
    payload.status === 'complete'
      ? 'Backup complete'
      : `Backup failed${payload.errorMessage ? `: ${payload.errorMessage}` : ''}`;
  const body =
    payload.status === 'complete'
      ? `Your ${payload.scope} backup finished successfully.`
      : `Your ${payload.scope} backup could not be completed.`;
  // No url yet: this deliberately doesn't link anywhere -- the backup
  // download route (epic tasks 8.17/8.18) hasn't shipped, and linking to a
  // route that doesn't exist would be worse than omitting the link.

  const pdb = await getPlatformDb();
  const notificationId = randomUUID();
  await sendNotification(pdb, {
    id: notificationId,
    recipientUserId: payload.recipientUserId,
    source: 'backup',
    sourceType: 'platform',
    title,
    body,
    category: 'backup',
  });

  const broker = getBroker();
  if (broker) {
    void broker.publish(payload.recipientUserId, {
      notificationId,
      userId: payload.recipientUserId,
      title,
      body,
      category: 'backup',
      source: 'backup',
    });
  }

  void fanOutPushToUser(payload.recipientUserId, {
    title,
    body,
    category: 'backup',
  });
}
