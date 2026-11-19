/**
 * `@sovereignfs/auth/next` — the sign-in in a Next.js app's pages (auth.md §2, §6): the guard every signed-in page calls, and its other
 * side for the pages before signing in.
 */
import { redirect } from 'next/navigation';
import { withReturnTo } from '../return-to.js';

/** What the guards need of the app. */
export type SessionGuardOptions<S> = {
  /** The app's checked session read (`readSession`, or core's `getSession`, which applies the lock). */
  getSession: () => Promise<S | null>;
  /** Where someone with no session signs in. Default `/sign-in`. */
  signInPath?: string;
  /**
   * When there is no usable session: where to send someone whose session the app's check refused, instead of to sign in (core sends a
   * locked session to the lock page). It redirects, or returns to let the guard go on.
   */
  whenRefused?: (returnTo: string) => Promise<void>;
  /** A page was opened in the session (core restarts the lock's idle time). Best effort: it never stops the page. */
  onPage?: (session: S) => Promise<void>;
};

/** The two page guards, for the app's session (auth.md §6). */
export function sessionGuards<S>({
  getSession,
  signInPath = '/sign-in',
  whenRefused,
  onPage,
}: SessionGuardOptions<S>) {
  /**
   * The guard of every page that needs someone signed in: their session, or the sign-in page with the way back here. An app's proxy
   * may turn away a request with no session cookie; this is the check that counts, since a cookie can outlive its session.
   *
   * `returnTo` is this page's own path and query, which the sign-in page keeps only if it is a path on this site.
   */
  async function requireSignedIn(returnTo: string): Promise<S> {
    const session = await getSession();
    if (!session) {
      await whenRefused?.(returnTo);
      redirect(withReturnTo(signInPath, returnTo));
    }
    await onPage?.(session);
    return session;
  }

  /**
   * The other side, for the pages before signing in (sign-in, its second step, sign-up, a forgotten password): someone already signed
   * in is sent on to `returnTo`, unless a fresh sign-in was asked for (`sig`, core's signed request for `prompt=login`), which must
   * show the form. Someone whose session the app's check refused is sent where `whenRefused` says, unless `checkRefused` is false.
   */
  async function sendOnIfSignedIn(
    returnTo: string,
    query: { sig?: string | string[] | undefined } = {},
    { checkRefused = true }: { checkRefused?: boolean } = {},
  ): Promise<void> {
    if (query.sig !== undefined) return;
    if (await getSession()) redirect(returnTo);
    if (checkRefused) await whenRefused?.(returnTo);
  }

  return { requireSignedIn, sendOnIfSignedIn };
}
