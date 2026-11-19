import { redirect } from 'next/navigation';
import { withReturnTo } from './return-to';
import { sendToLockIfLocked, notePageActivity } from '../lock/guard';
import { getSession } from './session';

/**
 * The guard of every page that needs someone signed in (core-app §3.5): their session, or the sign-in page with the
 * way back here. The proxy turns away a request with no session cookie; this is the check that counts, since a cookie
 * can outlive its session. Pages of the Console use `requireConsole`, which asks for more.
 *
 * `returnTo` is this page's own path and query, which the sign-in page keeps only if it is a path on this site.
 */
export async function requireSignedIn(returnTo: string) {
  const session = await getSession();
  if (!session) {
    // A locked session is sent to the lock page, not to sign in (RFC 0006 B3).
    await sendToLockIfLocked(returnTo);
    redirect(withReturnTo('/sign-in', returnTo));
  }
  await notePageActivity(session);
  return session;
}

/**
 * The other side, for the pages before signing in (sign-in, its second step, sign-up, a forgotten password): someone
 * already signed in is sent on to `returnTo`, unless an app asked for a fresh sign-in (`prompt=login`), which brings
 * the provider's signed request (`sig`) with it and must show the form. Someone whose session is locked is sent to the lock page.
 */
export async function sendOnIfSignedIn(
  returnTo: string,
  query: { sig?: string | string[] | undefined } = {},
  options: { toLock?: boolean } = {},
): Promise<void> {
  if (query.sig !== undefined) return;
  if (await getSession()) redirect(returnTo);
  // Someone whose session is locked unlocks it, rather than signing in again (RFC 0006 B4); the second step is left alone, since
  // whoever reached it has just given the password.
  if (options.toLock !== false) await sendToLockIfLocked(returnTo);
}
