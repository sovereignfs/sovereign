import { getAuth } from '../auth';
import { getDatabase } from '../database';
import { DeletionDelivery, signAccountDeletedToken } from './deletion-delivery';

const EVERY_MS = 60_000;

let delivery: Promise<DeletionDelivery> | undefined;

/** Core's delivery of account-deleted notices, for the life of the process (core-app §4.5). */
export function getDeletionDelivery(): Promise<DeletionDelivery> {
  delivery ??= getDatabase()
    .then(
      (database) =>
        new DeletionDelivery(database, async (clientId, sub) =>
          signAccountDeletedToken(await getAuth(), clientId, sub),
        ),
    )
    .catch((error: unknown) => {
      delivery = undefined;
      throw error;
    });
  return delivery;
}

/** Sends what is due now, and says nothing when it cannot: the next round tries again. */
export async function sendDueDeletionNotices(): Promise<void> {
  try {
    await (await getDeletionDelivery()).runDue();
  } catch (error) {
    console.warn(
      `Sending account-deletion notices failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts sending notices when core starts: what is due is read from the table, so a process that stopped loses nothing. Once at
 * start and then every minute. Safe to call twice.
 */
export function startDeletionDelivery(): void {
  if (timer) return;
  void sendDueDeletionNotices();
  timer = setInterval(() => void sendDueDeletionNotices(), EVERY_MS);
  timer.unref();
}
