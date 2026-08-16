import { getBroker } from './notification-broker';

export interface BackupNotificationPayload {
  jobId: string;
  scope: 'instance' | 'user';
  status: 'complete' | 'failed';
  errorMessage?: string;
}

/**
 * Send a notification when a backup job completes (RFC 0084, epic task 8.16).
 * This is the platform-level (non-plugin) integration point into the existing
 * notification broker that `NotificationBell`/`sdk.notifications` already
 * surface through.
 *
 * The notification is sent to the user who requested the backup (if any).
 * For instance-level backups, the notification goes to all admins.
 */
export async function notifyBackupCompletion(_payload: BackupNotificationPayload): Promise<void> {
  const broker = getBroker();
  if (!broker) return;

  // For now, we'll just log the notification — the actual notification
  // sending will be wired in a follow-up
  // TODO: wire the actual notification sending
  // The recipientUserId should be passed in from the job record
}
