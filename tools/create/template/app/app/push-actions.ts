'use server';

import { enqueuePush } from '@sovereignfs/push';
import { currentAccount } from '@/lib/account';
import { database } from '@/lib/db';
import { appPush, pushStore, sendDuePushes } from '@/lib/push';

/**
 * Sends the signed-in person a test notification on every device they turned notifications on in. It shows the whole path: the push is
 * queued in a transaction, as a push raised by a change would be, and sent from the outbox after it commits.
 */
export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const account = await currentAccount();
  if (!account) return { ok: false, message: 'Sign in again to send a test notification.' };
  if (!appPush()) return { ok: false, message: 'This app doesn’t send notifications.' };
  const db = await database();
  const queued = await db.transaction(async (tx) =>
    // Your change would be written here, on the same transaction (`tx.run`): if it fails, the push is never sent.
    enqueuePush(pushStore(tx), {
      account,
      message: {
        title: 'Test notification',
        body: 'Notifications from __TITLE__ work on this device.',
        path: '/',
      },
      now: Date.now(),
      ttlMs: 10 * 60_000,
    }),
  );
  if (queued === 0) return { ok: false, message: 'Turn notifications on for this device first.' };
  await sendDuePushes();
  return { ok: true, message: 'Sent. It should arrive in a moment.' };
}
