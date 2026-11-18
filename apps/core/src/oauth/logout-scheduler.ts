import { getAuth } from '../auth';
import { getDatabase } from '../database';
import { deliverDueLogoutNotices } from './logout-notices';
import { moveBackchannelAddresses } from '../clients/registry';

const EVERY_MS = 60_000;

/** One round of logout notices, with core's database and keys. Says nothing when it cannot: the next round tries again. */
export async function sendDueLogoutNotices(): Promise<void> {
  try {
    await deliverDueLogoutNotices(await getDatabase(), await getAuth());
  } catch (error) {
    console.warn(
      `Sending logout notices failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts logout notices when core starts (core-app §3.6.5): first every app's back-channel address is moved to core's own settings, so
 * the provider sends none of its own; then what is due is sent, once now and then every minute. What is due is read from the table,
 * so a process that stopped loses nothing. Safe to call twice.
 */
export async function startLogoutDelivery(): Promise<void> {
  if (timer) return;
  try {
    const moved = await moveBackchannelAddresses(await getAuth());
    if (moved > 0)
      console.log(`Moved the logout notice address of ${moved} app(s) to core's own settings.`);
  } catch (error) {
    console.warn(
      `Moving apps' logout notice addresses failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  void sendDueLogoutNotices();
  timer = setInterval(() => void sendDueLogoutNotices(), EVERY_MS);
  timer.unref();
}
