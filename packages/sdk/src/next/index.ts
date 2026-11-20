import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignInError } from '../errors';
import type { SignInOptions } from '../auth';
import type { Session } from '../session';
import type { Sovereign } from '../sovereign';
import { trimTrailingSlashes } from '../slashes.js';

export type NextAuthOptions = {
  /** Where the route is mounted. It must match the SDK's `redirectPath` (`/auth/callback`) and `postLogoutPath`. `/auth` unless changed. */
  basePath?: string;
  /** Where a person goes when a sign-in fails. `/` with `?error=signin` unless changed. */
  errorPath?: string;
  /**
   * Deletes what the app holds of a person who deleted their account, and mounts `/auth/account-deleted` for core to tell it so (sdk §9.1). Without
   * it that address is not there. It must be safe to run twice, and it must not resolve until the data is gone.
   */
  onAccountDeleted?: (person: { readonly sub: string }) => Promise<void> | void;
  /** The app's part of a person's export (sdk §9.1): mounted at `/auth/export` when given. */
  onExport?: {
    prefix: string;
    version: string;
    handler: (part: {
      readonly sub: string;
      readonly writer: import('@sovereignfs/export').ExportWriter;
    }) => Promise<void>;
  };
};

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Binds the SDK's sign-in to Next.js (sdk §9): the route handlers for `/auth/login`, `/auth/callback`, `/auth/logout`,
 * `/auth/key-secret` (for `@sovereignfs/sdk/keys`, sdk §9.2) and `/auth/backchannel-logout` (and `/auth/account-deleted` when `onAccountDeleted` is given), and the session as a Server Component, route or action reads it. Mount the handlers once:
 *
 *   // app/auth/[action]/route.ts
 *   export const { GET, POST } = nextAuth(sv).handlers;
 *
 * `next` is an optional peer dependency of the SDK, and this is the only entry that uses it.
 *
 * @deprecated Sign people in with `@sovereignfs/auth` instead, whose `./core` is core as one way in beside the app's own accounts
 * (RFC 0007; `docs/upgrade.md`, "Moving off `nextAuth`"). It keeps working, and is removed only in a major version of the SDK.
 */
export function nextAuth(sv: Sovereign, options: NextAuthOptions = {}) {
  const base = trimTrailingSlashes(options.basePath ?? '/auth');
  const errorPath = options.errorPath ?? '/?error=signin';

  const go = (url: string, setCookies: string[], status = 303): Response => {
    const headers = new Headers({ location: url, 'cache-control': 'no-store' });
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
    return new Response(null, { status, headers });
  };

  const actionOf = (request: Request): string => {
    const path = new URL(request.url).pathname;
    return path.startsWith(`${base}/`) ? trimTrailingSlashes(path.slice(base.length + 1)) : '';
  };

  const GET: RouteHandler = async (request) => {
    switch (actionOf(request)) {
      case 'login': {
        const step = await sv.auth.beginSignIn(
          signInOptionsFrom(new URL(request.url).searchParams),
        );
        return go(step.url, step.setCookies, 302);
      }
      case 'key-secret': {
        // The app's own pages only: a browser says where a request comes from, and a request from another site is refused.
        const site = request.headers.get('sec-fetch-site');
        if (site !== null && site !== 'same-origin') {
          return new Response('Not found', { status: 404 });
        }
        const found = await sv.auth.keySecret(request);
        return new Response(JSON.stringify(found ?? { error: 'not_signed_in' }), {
          status: found ? 200 : 401,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      case 'callback': {
        try {
          const done = await sv.auth.completeSignIn(request);
          return go(done.returnTo, done.setCookies);
        } catch (error) {
          if (!(error instanceof SignInError)) throw error;
          // A check found the person signed out at core: the app's session has ended, and they sign in the usual way, to the
          // same page (sdk §9.7).
          if (error.reason === 'login_required') {
            const query = new URLSearchParams({ returnTo: error.returnTo ?? '/' });
            return go(`${base}/login?${query.toString()}`, [sv.auth.endSessionCookie]);
          }
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
      case 'account-deleted':
        return options.onAccountDeleted
          ? sv.auth.handleAccountDeleted(request, options.onAccountDeleted)
          : new Response('Not found', { status: 404 });
      case 'export':
        return options.onExport
          ? sv.auth.handleExportRequest(
              request,
              { prefix: options.onExport.prefix, version: options.onExport.version },
              options.onExport.handler,
            )
          : new Response('Not found', { status: 404 });
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

  /**
   * The session, or the person is sent to sign in and comes back to `returnTo`. With `maxAgeSeconds`, a session whose sign-in
   * at core is older (or unknown) sends the person to sign in again, for something that wants a recent one (sdk §9.6).
   */
  const requireSession = async (
    returnTo = '/',
    options: { maxAgeSeconds?: number } = {},
  ): Promise<Session> => {
    const session = await getSession();
    const maxAge = options.maxAgeSeconds;
    const query = new URLSearchParams({ returnTo });
    if (session && (maxAge === undefined || sv.auth.signedInWithin(session, maxAge))) {
      if (!sv.auth.needsCheck(session)) return session;
      // Due a check against core (sdk §9.7): through core with `prompt=none`, which shows nothing while core's session lives.
      query.set('prompt', 'none');
      return redirect(`${base}/login?${query.toString()}`);
    }
    if (maxAge !== undefined) query.set('max_age', String(maxAge));
    return redirect(`${base}/login?${query.toString()}`);
  };

  return { handlers: { GET, POST }, getSession, requireSession };
}

/**
 * What `/auth/login` passes on from its query: `returnTo`, `prompt` (`login` or `none`, anything else ignored) and `max_age` (a
 * whole number of seconds, anything else ignored). None of it can do harm: core checks the request, and the callback the age.
 */
function signInOptionsFrom(query: URLSearchParams): SignInOptions {
  const returnTo = query.get('returnTo');
  const prompt = query.get('prompt');
  const maxAge = query.get('max_age');
  return {
    ...(returnTo ? { returnTo } : {}),
    ...(prompt === 'login' || prompt === 'none' ? { prompt } : {}),
    ...(maxAge !== null && /^\d{1,9}$/.test(maxAge) ? { maxAgeSeconds: Number(maxAge) } : {}),
  };
}
