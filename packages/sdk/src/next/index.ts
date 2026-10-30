import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignInError } from '../errors';
import type { Session } from '../session';
import type { Sovereign } from '../sovereign';

export type NextAuthOptions = {
  /** Where the route is mounted. It must match the SDK's `redirectPath` (`/auth/callback`) and `postLogoutPath`. `/auth` unless changed. */
  basePath?: string;
  /** Where a person goes when a sign-in fails. `/` with `?error=signin` unless changed. */
  errorPath?: string;
};

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Binds the SDK's sign-in to Next.js (sdk §9): the route handlers for `/auth/login`, `/auth/callback`, `/auth/logout` and
 * `/auth/backchannel-logout`, and the session as a Server Component, route or action reads it. Mount the handlers once:
 *
 *   // app/auth/[action]/route.ts
 *   export const { GET, POST } = nextAuth(sv).handlers;
 *
 * `next` is an optional peer dependency of the SDK, and this is the only entry that uses it.
 */
export function nextAuth(sv: Sovereign, options: NextAuthOptions = {}) {
  const base = (options.basePath ?? '/auth').replace(/\/+$/, '');
  const errorPath = options.errorPath ?? '/?error=signin';

  const go = (url: string, setCookies: string[], status = 303): Response => {
    const headers = new Headers({ location: url, 'cache-control': 'no-store' });
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
    return new Response(null, { status, headers });
  };

  const actionOf = (request: Request): string => {
    const path = new URL(request.url).pathname;
    return path.startsWith(`${base}/`) ? path.slice(base.length + 1).replace(/\/+$/, '') : '';
  };

  const GET: RouteHandler = async (request) => {
    switch (actionOf(request)) {
      case 'login': {
        const returnTo = new URL(request.url).searchParams.get('returnTo') ?? undefined;
        const step = await sv.auth.beginSignIn(returnTo ? { returnTo } : {});
        return go(step.url, step.setCookies, 302);
      }
      case 'callback': {
        try {
          const done = await sv.auth.completeSignIn(request);
          return go(done.returnTo, done.setCookies);
        } catch (error) {
          if (!(error instanceof SignInError)) throw error;
          return go(errorPath, []);
        }
      }
      default:
        return new Response('Not found', { status: 404 });
    }
  };

  const POST: RouteHandler = async (request) => {
    switch (actionOf(request)) {
      case 'logout': {
        const step = await sv.auth.signOut(request);
        return go(step.url, step.setCookies);
      }
      case 'backchannel-logout':
        return sv.auth.handleBackChannelLogout(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  };

  /** The session in this request, from its cookies. It makes no call to core. */
  const getSession = async (): Promise<Session | null> => {
    const store = await cookies();
    const request = new Request(sv.links.profile, { headers: { cookie: store.toString() } });
    return sv.auth.getSession(request);
  };

  /** The session, or the person is sent to sign in and comes back to `returnTo`. */
  const requireSession = async (returnTo = '/'): Promise<Session> => {
    const session = await getSession();
    if (session) return session;
    return redirect(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return { handlers: { GET, POST }, getSession, requireSession };
}
