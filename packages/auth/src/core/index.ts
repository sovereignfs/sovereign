/**
 * `@sovereignfs/auth/core` — core as a way in for an app (auth.md §8): a better-auth plugin built on the SDK, so the app's session is
 * its own and core's refresh token stays the SDK's alone. better-auth's `genericOAuth` is not used: it would keep and refresh core's
 * token itself, and core takes a token used twice for theft.
 *
 * - `sovereignSignIn(options)` is the plugin: `GET /sign-in/sovereign` starts a sign-in, `GET /callback/sovereign` finishes it (the
 *   address core knows as `<app>/api/auth/callback/sovereign`).
 * - `coreNotices(options)` answers core's two notices as plain routes (`POST /api/sovereign/backchannel-logout` and
 *   `POST /api/sovereign/account-deleted`), which no browser makes.
 * - `POST /sv/link-sovereign` links the signed-in person's own account to core, after their password (auth.md §8.2).
 * - `coreSignOutUrl` is core's sign-out for the session, and `needsCoreCheck` says when to ask core again (sdk §9.7).
 */
import type { Database, Migration } from '@sovereignfs/database';
import {
  verifyAccountDeletedToken,
  verifyLogoutToken,
  type SignedIn,
  type User,
} from '@sovereignfs/sdk';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie, setSessionCookie } from 'better-auth/cookies';
import { safeReturnTo, withReturnTo } from '../return-to.js';
import { confirmPassword, type PasswordVerifier } from '../server/confirm-password.js';
import { asCoreArrival } from '../server/preset.js';
import { userOf, type SessionUser } from '../server/user.js';

/** better-auth's name for the link between an account and core: the `providerId` of its row in `accounts`, whose `accountId` is `sub`. */
export const CORE_PROVIDER = 'sovereign';

/** The cookie that says this session asked to link its account to core, signed, for ten minutes, and read once (auth.md §8.2). */
const LINK_COOKIE = 'sv_core_link';
const LINK_SECONDS = 10 * 60;

/** How long a session goes before it is checked against core again (sdk §9.7). */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** What the plugin needs of the app's SDK instance (`createSovereign`). */
export type SovereignSteps = {
  auth: {
    beginSignIn(options?: {
      returnTo?: string;
      prompt?: 'login' | 'none' | 'create';
    }): Promise<{ url: string; setCookies: string[] }>;
    finishSignIn(request: Request): Promise<SignedIn>;
    endSessionUrl(idToken: string | undefined): Promise<string>;
  };
};

export type SovereignSignInOptions = {
  sovereign: SovereignSteps;
  database: Database;
  /** The app's sign-in page, where a sign-in through core that did not work comes back with `error`. Default `/sign-in`. */
  signInPage?: string;
};

type Row = Record<string, unknown>;

/** The core sign-in a session of the app came from: core's `sid`, the ID token for signing out, and when it was last checked. */
type CoreSignIn = {
  sessionId: string;
  sub: string;
  sid: string | null;
  idToken: string | null;
  checkedAt: number;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

async function readSignIn(database: Database, sessionId: string): Promise<CoreSignIn | undefined> {
  const row = (
    await database.run(
      'select session_id, sub, sid, id_token, checked_at from sv_core_sign_ins where session_id = ?',
      [sessionId],
    )
  ).rows[0] as Row | undefined;
  if (!row) return undefined;
  return {
    sessionId: String(row.session_id),
    sub: String(row.sub),
    sid: text(row.sid) ?? null,
    idToken: text(row.id_token) ?? null,
    checkedAt: Number(row.checked_at),
  };
}

/** A name to keep: core's, or the address's local part when core gave none (the account must have one). */
function nameFrom(claims: Record<string, unknown>, email: string): string {
  return text(claims.name)?.trim() || email.split('@')[0] || 'Sovereign user';
}

/**
 * The plugin (auth.md §8). Starting a sign-in is the SDK's (PKCE, state, nonce, `prompt`, a pending record in the SDK's store);
 * finishing one is the SDK's `finishSignIn`, which keeps the refresh token, and then the plugin opens the app's session for the account
 * linked to core's `sub`, through better-auth's own adapter, so every hook of the preset runs (a deactivated account gets none).
 */
export function sovereignSignIn({
  sovereign,
  database,
  signInPage = '/sign-in',
}: SovereignSignInOptions) {
  const failed = (reason: string, returnTo: string) => {
    const page = withReturnTo(signInPage, returnTo);
    return `${page}${page.includes('?') ? '&' : '?'}error=${reason}`;
  };

  return {
    id: 'sovereign-sign-in',
    endpoints: {
      startSovereignSignIn: createAuthEndpoint(
        '/sign-in/sovereign',
        { method: 'GET', metadata: { isAction: false } },
        async (ctx) => {
          const query = (ctx.query ?? {}) as Record<string, unknown>;
          const prompt =
            query.prompt === 'none' || query.prompt === 'login' || query.prompt === 'create'
              ? query.prompt
              : undefined;
          const step = await sovereign.auth.beginSignIn({
            returnTo: safeReturnTo(text(query.returnTo)),
            ...(prompt ? { prompt } : {}),
          });
          for (const cookie of step.setCookies) ctx.responseHeaders?.append('set-cookie', cookie);
          throw ctx.redirect(step.url);
        },
      ),
      linkSovereign: createAuthEndpoint(
        '/sv/link-sovereign',
        { method: 'POST', metadata: { isAction: false } },
        async (ctx) => {
          // Linking is the person's own, from a session of theirs, after their password (auth.md §8.2): never by an address that matches.
          const current = await getSessionFromCtx(ctx);
          if (!current) throw ctx.error('UNAUTHORIZED', { message: 'Sign in first.' });
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const accounts = await ctx.context.internalAdapter.findAccounts(current.user.id);
          if (accounts.some((account) => account.providerId === CORE_PROVIDER))
            throw ctx.error('BAD_REQUEST', {
              message: 'This account already signs in through Sovereign.',
              code: 'ALREADY_LINKED',
            });
          const verifier = {
            $context: Promise.resolve(ctx.context),
          } as unknown as PasswordVerifier;
          const check = await confirmPassword(database, verifier, current.user.id, body.password);
          if (check === 'limited')
            throw ctx.error('TOO_MANY_REQUESTS', {
              message: 'Too many wrong passwords. Wait ten minutes, then try again.',
              code: 'PASSWORD_LIMITED',
            });
          if (check !== 'ok')
            throw ctx.error('UNAUTHORIZED', {
              message: 'The password is incorrect.',
              code: 'INVALID_PASSWORD',
            });
          const returnTo = safeReturnTo(text(body.returnTo));
          const cookie = ctx.context.createAuthCookie(LINK_COOKIE, { maxAge: LINK_SECONDS });
          await ctx.setSignedCookie(
            cookie.name,
            `${current.session.id}|${Date.now() + LINK_SECONDS * 1000}`,
            ctx.context.secret,
            cookie.attributes,
          );
          // Core asks the person to sign in there, whatever session it has: the link is to whoever signs in now.
          const step = await sovereign.auth.beginSignIn({ returnTo, prompt: 'login' });
          for (const set of step.setCookies) ctx.responseHeaders?.append('set-cookie', set);
          // The page goes there itself: the browser client never follows a redirect (auth.md §4, rule 14).
          return ctx.json({ url: step.url });
        },
      ),
      sovereignCallback: createAuthEndpoint(
        '/callback/sovereign',
        { method: 'GET', metadata: { isAction: false } },
        async (ctx) => {
          if (!ctx.request) throw ctx.redirect(failed('sovereign', '/'));
          const current = await getSessionFromCtx(ctx);
          let signedIn: SignedIn;
          try {
            signedIn = await sovereign.auth.finishSignIn(ctx.request);
          } catch (error) {
            const reason = (error as { reason?: unknown }).reason;
            const returnTo = safeReturnTo(text((error as { returnTo?: unknown }).returnTo));
            // The person is signed out at core: the session that came from it ends here too (sdk §9.7).
            if (reason === 'login_required') {
              // Only a session that came from core ends: the start route is a link anyone could make, and a local account's session
              // is not core's to end.
              if (current && (await readSignIn(database, current.session.id))) {
                await ctx.context.internalAdapter.deleteSession(current.session.token);
                deleteSessionCookie(ctx);
              }
              throw ctx.redirect(withReturnTo(signInPage, returnTo));
            }
            throw ctx.redirect(failed('sovereign', returnTo));
          }
          for (const cookie of signedIn.setCookies)
            ctx.responseHeaders?.append('set-cookie', cookie);
          const email = text(signedIn.claims.email);
          if (!email) throw ctx.redirect(failed('sovereign_email', signedIn.returnTo));

          // Linking, when this session asked to (auth.md §8.2): read once, and only for the session that asked, before it runs out.
          const cookie = ctx.context.createAuthCookie(LINK_COOKIE);
          const asked = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
          if (asked) ctx.setCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 });
          const [askedBy, until] = typeof asked === 'string' ? asked.split('|') : [];
          if (current && askedBy === current.session.id && Number(until) > Date.now()) {
            const back = (reason?: string) =>
              reason
                ? `${signedIn.returnTo}${signedIn.returnTo.includes('?') ? '&' : '?'}link=${reason}`
                : `${signedIn.returnTo}${signedIn.returnTo.includes('?') ? '&' : '?'}link=done`;
            const owner = (await ctx.context.adapter.findOne<{ userId: string }>({
              model: 'account',
              where: [
                { field: 'providerId', value: CORE_PROVIDER },
                { field: 'accountId', value: signedIn.sub },
              ],
            })) as { userId: string } | null;
            // That Sovereign account is already another account's here: it is never moved.
            if (owner && owner.userId !== current.user.id) throw ctx.redirect(back('taken'));
            const byAddress = await ctx.context.internalAdapter.findUserByEmail(email);
            // Its address is another account's here: neither is joined to the other.
            if (byAddress && byAddress.user.id !== current.user.id)
              throw ctx.redirect(back('address'));
            if (!owner)
              await ctx.context.internalAdapter.linkAccount({
                userId: current.user.id,
                providerId: CORE_PROVIDER,
                accountId: signedIn.sub,
              });
            // The person just signed in at core: this session is one through core from now on, checked against it as any other.
            await database.run(
              `insert into sv_core_sign_ins (session_id, sub, sid, id_token, checked_at) values (?, ?, ?, ?, ?)
                 on conflict (session_id) do update set sub = excluded.sub, sid = excluded.sid, id_token = excluded.id_token,
                   checked_at = excluded.checked_at`,
              [
                current.session.id,
                signedIn.sub,
                signedIn.sid ?? null,
                signedIn.idToken ?? null,
                Date.now(),
              ],
            );
            throw ctx.redirect(back());
          }

          // The account is the one linked to core's `sub`, never one that has the same address (auth.md §9).
          const linked = (await ctx.context.adapter.findOne<{ userId: string }>({
            model: 'account',
            where: [
              { field: 'providerId', value: CORE_PROVIDER },
              { field: 'accountId', value: signedIn.sub },
            ],
          })) as { userId: string } | null;
          let userId = linked?.userId;
          if (!userId) {
            if (await ctx.context.internalAdapter.findUserByEmail(email)) {
              // An address that is a local account's is refused until the person links the two from a signed-in session.
              throw ctx.redirect(failed('account_not_linked', signedIn.returnTo));
            }
            let created;
            try {
              created = await asCoreArrival(() =>
                ctx.context.internalAdapter.createOAuthUser(
                  {
                    name: nameFrom(signedIn.claims, email),
                    email,
                    emailVerified: signedIn.claims.email_verified === true,
                  },
                  { providerId: CORE_PROVIDER, accountId: signedIn.sub },
                ),
              );
            } catch {
              throw ctx.redirect(failed('sovereign', signedIn.returnTo));
            }
            userId = created.user.id;
          }

          const now = Date.now();
          // A check of this browser's session against core renews it in place (sdk §9.7).
          if (current && current.user.id === userId) {
            await database.run(
              'update sv_core_sign_ins set sid = ?, id_token = ?, checked_at = ? where session_id = ?',
              [signedIn.sid ?? null, signedIn.idToken ?? null, now, current.session.id],
            );
            const name = text(signedIn.claims.name);
            if (name && name !== current.user.name) {
              await ctx.context.internalAdapter.updateUser(userId, { name });
            }
            throw ctx.redirect(signedIn.returnTo);
          }
          if (current) await ctx.context.internalAdapter.deleteSession(current.session.token);
          let session;
          try {
            session = await ctx.context.internalAdapter.createSession(userId);
          } catch {
            // The preset's gate refused the session (a deactivated account, an address to verify).
            throw ctx.redirect(failed('sovereign_refused', signedIn.returnTo));
          }
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!session || !user) throw ctx.redirect(failed('sovereign', signedIn.returnTo));
          await database.run(
            'insert into sv_core_sign_ins (session_id, sub, sid, id_token, checked_at) values (?, ?, ?, ?, ?)',
            [session.id, signedIn.sub, signedIn.sid ?? null, signedIn.idToken ?? null, now],
          );
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(signedIn.returnTo);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** The claims of an ID token this package checked and kept (`sv_core_sign_ins`), read without checking it again; nothing when unreadable. */
function keptClaims(idToken: string | null): Record<string, unknown> {
  const payload = idToken?.split('.')[1];
  if (!payload) return {};
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Who is signed in on a session, typed (sdk §9.9): `userOf` with what core said of the person on this session, when they came through
 * core. Its roles are those of the ID token core signed for this session, kept when it was checked and renewed with each check.
 */
export async function signedInUser(
  database: Database,
  session: { session: { id: string }; user: SessionUser },
): Promise<User> {
  const signIn = await readSignIn(database, session.session.id);
  return userOf(
    session.user,
    signIn ? { sub: signIn.sub, claims: keptClaims(signIn.idToken) } : undefined,
  );
}

/** The app's own user for a person core names by `sub`, or nothing when they never signed in here through core. */
export async function userIdForSub(database: Database, sub: string): Promise<string | undefined> {
  const { rows } = await database.run(
    'select user_id from accounts where provider_id = ? and account_id = ?',
    [CORE_PROVIDER, sub],
  );
  return rows[0] ? String(rows[0].user_id) : undefined;
}

/**
 * The `sub` core knows a person by, from the app's own user id (RFC 0007 amendment 1 A3): the account id of their `sovereign` row, or
 * nothing when they never signed in here through core. The inverse of `userIdForSub`, and the only way an app finds it: it keeps no copy.
 */
export async function coreSubOf(database: Database, userId: string): Promise<string | undefined> {
  const { rows } = await database.run(
    'select account_id from accounts where provider_id = ? and user_id = ?',
    [CORE_PROVIDER, userId],
  );
  return rows[0] ? String(rows[0].account_id) : undefined;
}

/** Whether a session that came from core is due to be checked against it again (sdk §9.7); a local session never is. */
export async function needsCoreCheck(
  database: Database,
  sessionId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const signIn = await readSignIn(database, sessionId);
  return signIn !== undefined && now - signIn.checkedAt >= CHECK_EVERY_MS;
}

/**
 * Where signing out of a session sends the person: core's sign-out for a session that came from core (core decides what it ends,
 * core-app §3.6.5), or nowhere further for a local one.
 */
export async function coreSignOutUrl(
  database: Database,
  sovereign: SovereignSteps,
  sessionId: string,
): Promise<string | undefined> {
  const signIn = await readSignIn(database, sessionId);
  if (!signIn) return undefined;
  return sovereign.auth.endSessionUrl(signIn.idToken ?? undefined);
}

/** What the notice handlers need. */
export type CoreNoticeOptions = {
  database: Database;
  /** better-auth's context, whose adapter ends sessions so every hook runs (auth.md §4, rule 13). */
  auth: {
    $context: Promise<{ internalAdapter: { deleteSession(token: string): Promise<unknown> } }>;
  };
  coreUrl: string;
  clientId: string;
  /** The app's own deletion of a person's data, run before the notice is answered (core-app §4.5). */
  onAccountDeleted?: (sub: string) => Promise<void>;
  /** Drops the person's refresh token from the SDK's token store, for a notice that names the whole person. */
  dropRefreshToken?: (sub: string) => Promise<void>;
  fetch?: typeof fetch;
};

const answer = (status: number) => new Response(null, { status });

/**
 * Core's two notices, as plain request handlers (auth.md §8), for the app's routes `POST /api/sovereign/backchannel-logout` and
 * `POST /api/sovereign/account-deleted`. Each is verified by the SDK (signature, issuer, audience, event, expiry) and remembered by its
 * `jti` until it expires, so a replay ends nothing. A logout notice for a `sid` ends the sessions of that core session; one for a `sub`
 * ends every session of that person and drops their refresh token.
 */
export function coreNotices(options: CoreNoticeOptions) {
  const { database } = options;
  const seen = async (jti: string, expiresAt: number): Promise<boolean> => {
    await database.run('delete from sv_core_notices where expires_at < ?', [Date.now()]);
    const before = (
      await database.run('select 1 as found from sv_core_notices where jti = ?', [jti])
    ).rows;
    if (before.length > 0) return true;
    await database.run('insert into sv_core_notices (jti, expires_at) values (?, ?)', [
      jti,
      expiresAt,
    ]);
    return false;
  };
  const verifying = {
    coreUrl: options.coreUrl,
    clientId: options.clientId,
    seen,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };

  async function endSessions(where: { sid?: string; sub?: string }): Promise<void> {
    const { rows } = await database.run(
      where.sid
        ? 'select s.token as token from sv_core_sign_ins c join sessions s on s.id = c.session_id where c.sid = ?'
        : 'select s.token as token from sv_core_sign_ins c join sessions s on s.id = c.session_id where c.sub = ?',
      [where.sid ?? where.sub ?? ''],
    );
    const adapter = (await options.auth.$context).internalAdapter;
    for (const row of rows) await adapter.deleteSession(String(row.token));
  }

  async function backChannelLogout(request: Request): Promise<Response> {
    let named: { sub?: string; sid?: string };
    try {
      named = await verifyLogoutToken(request, verifying);
    } catch (error) {
      return answer((error as { name?: unknown }).name === 'CoreUnavailableError' ? 503 : 400);
    }
    if (named.sid) await endSessions({ sid: named.sid });
    else if (named.sub) {
      await endSessions({ sub: named.sub });
      await options.dropRefreshToken?.(named.sub);
    }
    return answer(200);
  }

  async function accountDeleted(request: Request): Promise<Response> {
    let named: { sub: string };
    try {
      named = await verifyAccountDeletedToken(request, verifying);
    } catch (error) {
      return answer((error as { name?: unknown }).name === 'CoreUnavailableError' ? 503 : 400);
    }
    // Answered only after the app's deletion has run: core keeps trying until then (core-app §4.5).
    try {
      await options.onAccountDeleted?.(named.sub);
    } catch {
      return answer(500);
    }
    await endSessions({ sub: named.sub });
    await options.dropRefreshToken?.(named.sub);
    return answer(200);
  }

  return { backChannelLogout, accountDeleted };
}

const BREAK = '\n--> statement-breakpoint\n';

/** The table the plugin's migrations are recorded in, apart from the app's own and the account tables'. */
export const CORE_SIGN_IN_MIGRATIONS_TABLE = 'sv_core_sign_in_migrations';

/**
 * The plugin's tables (auth.md §10): the core sign-in each session came from, ended with its session, and the notices already seen.
 * Run after `accountMigrations`, which makes `sessions`.
 */
export function coreSignInMigrations(family: 'sqlite' | 'postgres'): Migration[] {
  const time = family === 'postgres' ? 'bigint' : 'integer';
  return [
    {
      name: '0000_core_sign_ins',
      sql: [
        `CREATE TABLE sv_core_sign_ins (\n\tsession_id text PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,\n\tsub text NOT NULL,\n\tsid text,\n\tid_token text,\n\tchecked_at ${time} NOT NULL\n)`,
        'CREATE INDEX sv_core_sign_ins_sid_idx ON sv_core_sign_ins (sid)',
        'CREATE INDEX sv_core_sign_ins_sub_idx ON sv_core_sign_ins (sub)',
        `CREATE TABLE sv_core_notices (\n\tjti text PRIMARY KEY NOT NULL,\n\texpires_at ${time} NOT NULL\n)`,
      ].join(BREAK),
    },
  ];
}
