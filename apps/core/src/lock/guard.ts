import { redirect } from 'next/navigation';
import { getDatabase } from '../database';
import { currentLock, getSessionEvenIfLocked } from '../auth/session';
import { withReturnTo } from '../auth/return-to';
import { noteActivity } from './store';

/**
 * What a page does about the lock (RFC 0006 B2, B3). Neither decides access: `getSession` already gives a locked session nothing.
 * These only choose where a person is sent and when their idle time starts again, so a failure in them never shows anything; it is
 * taken as "no lock here", which at worst sends a locked person to sign in rather than to the lock page.
 */

/** When the page found no session: if the browser has a locked one, the person is sent to the lock page instead of to sign in. */
export async function sendToLockIfLocked(returnTo: string): Promise<void> {
  let locked: boolean;
  try {
    const session = await getSessionEvenIfLocked();
    locked = session !== null && (await currentLock(session)).locked;
  } catch {
    locked = false;
  }
  if (locked) redirect(withReturnTo('/lock', returnTo));
}

/** A page was opened in the session: its idle time starts again, at most each half minute, and only for a session under a lock. */
export async function notePageActivity(session: { session: { id: string } }): Promise<void> {
  try {
    await noteActivity(await getDatabase(), session.session.id);
  } catch {
    // Best effort: the next page or the watcher's ping writes it.
  }
}
