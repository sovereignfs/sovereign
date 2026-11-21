import { sessionGuards } from '@sovereignfs/auth/next';
import { sendToLockIfLocked, notePageActivity } from '../lock/guard';
import { getSession } from './session';

/**
 * Core's page guards: the sign-in package's (auth.md §6), on core's session, which applies the lock. A locked session is sent to the
 * lock page, not to sign in (RFC 0006 B3), and a page opened restarts the lock's idle time. Pages of the Console use
 * `requireConsole`, which asks for more.
 */
const guards = sessionGuards({
  getSession: () => getSession(),
  whenRefused: (returnTo) => sendToLockIfLocked(returnTo),
  onPage: (session) => notePageActivity(session),
});

/** The guard of every page that needs someone signed in (core-app §3.5): their session, or the sign-in page with the way back here. */
export const requireSignedIn = guards.requireSignedIn;

/**
 * The other side, for the pages before signing in: someone already signed in is sent on to `returnTo`, unless an app asked for a fresh
 * sign-in (`sig`). Someone whose session is locked unlocks it, rather than signing in again (RFC 0006 B4); the second step passes
 * `toLock: false`, since whoever reached it has just given the password.
 */
export async function sendOnIfSignedIn(
  returnTo: string,
  query: { sig?: string | string[] | undefined } = {},
  options: { toLock?: boolean } = {},
): Promise<void> {
  await guards.sendOnIfSignedIn(returnTo, query, { checkRefused: options.toLock !== false });
}
