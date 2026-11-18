import { redirect } from 'next/navigation';
import { withReturnTo } from './return-to';
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
  if (!session) redirect(withReturnTo('/sign-in', returnTo));
  return session;
}

/**
 * The other side, for the pages before signing in (sign-in, its second step, sign-up, a forgotten password): someone
 * already signed in is sent on to `returnTo`, unless an app asked for a fresh sign-in (`prompt=login`), which brings
 * the provider's signed request (`sig`) with it and must show the form.
 */
export async function sendOnIfSignedIn(
  returnTo: string,
  query: { sig?: string | string[] | undefined } = {},
): Promise<void> {
  if (query.sig !== undefined) return;
  if (await getSession()) redirect(returnTo);
}
