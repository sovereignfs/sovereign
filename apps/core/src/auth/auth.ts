import type { Database } from '@sovereignfs/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { KeyVault } from '../keys/vault';
import { hashPassword } from 'better-auth/crypto';
import { twoFactor } from 'better-auth/plugins/two-factor';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { hasValidInvite, inviteVouchesFor, markInvitesAccepted } from '../invites';
import { confirmPassword } from './confirm-password';
import { deviceIdFrom } from '../lock/device';
import { lockStatus } from '../lock/store';
import { advancedCookieOptions } from './cookies';
import { isSignInValue } from '@sovereignfs/crypto';
import type { AuthMail } from './mail';
import { isFirstAccount, type RegistrationPolicy } from './registration';
import {
  deliverDueLogoutNotices,
  planLogoutNotices,
  queueLogoutNotices,
  EndingSessions,
} from '../oauth/logout-notices';
import { oidcPlugins } from '../oauth/provider';
import { assertMayOpenSession } from './session-gate';
import { ROLE_OWNER, ROLE_USER } from './roles';
import type { AuthSettings } from './settings';
import { cleanName, refuseImageInput } from '../profile/name';
import { localeOrNull } from './locale';
import { signUpRecord, timezoneOrNull } from './terms';

/** The longest request body, in characters, for a password; core's policy sets the real limit. */
const BODY_LIMIT = 1024;

function adapterFor(database: Database) {
  // The tables are named user, session, account, verification and rateLimit inside better-auth;
  // ours are plural snake_case (see the schema files), so the adapter is given the mapping.
  const schema =
    database.family === 'postgres'
      ? {
          user: postgresSchema.users,
          session: postgresSchema.sessions,
          account: postgresSchema.accounts,
          verification: postgresSchema.verifications,
          rateLimit: postgresSchema.rateLimits,
          twoFactor: postgresSchema.twoFactors,
          passkey: postgresSchema.passkeys,
          jwks: postgresSchema.jwks,
          oauthClient: postgresSchema.oauthClients,
          oauthResource: postgresSchema.oauthResources,
          oauthClientResource: postgresSchema.oauthClientResources,
          oauthRefreshToken: postgresSchema.oauthRefreshTokens,
          oauthAccessToken: postgresSchema.oauthAccessTokens,
          oauthConsent: postgresSchema.oauthConsents,
          oauthClientAssertion: postgresSchema.oauthClientAssertions,
        }
      : {
          user: sqliteSchema.users,
          session: sqliteSchema.sessions,
          account: sqliteSchema.accounts,
          verification: sqliteSchema.verifications,
          rateLimit: sqliteSchema.rateLimits,
          twoFactor: sqliteSchema.twoFactors,
          passkey: sqliteSchema.passkeys,
          jwks: sqliteSchema.jwks,
          oauthClient: sqliteSchema.oauthClients,
          oauthResource: sqliteSchema.oauthResources,
          oauthClientResource: sqliteSchema.oauthClientResources,
          oauthRefreshToken: sqliteSchema.oauthRefreshTokens,
          oauthAccessToken: sqliteSchema.oauthAccessTokens,
          oauthConsent: sqliteSchema.oauthConsents,
          oauthClientAssertion: sqliteSchema.oauthClientAssertions,
        };
  return drizzleAdapter(database.drizzle as never, {
    provider: database.family === 'postgres' ? 'pg' : 'sqlite',
    schema,
  });
}

/**
 * better-auth stores a password only by hashing it, whichever way it got there: sign-up, a reset, a change, or a server-side
 * `setPassword` that no HTTP route reaches. Core never receives a password (core-app §5.2): what arrives is a sign-in value the
 * browser derived from it, so this is where anything else is refused, and nothing is stored. The policy cannot be checked here,
 * since the password is not here: the browser checks it before deriving. The hash itself is better-auth's own.
 */
function policedHash() {
  return async (password: string) => {
    if (!isSignInValue(password)) {
      throw new APIError('BAD_REQUEST', {
        message: 'A password must be sent as the sign-in value the page makes from it.',
        code: 'PASSWORD_NOT_DERIVED',
      });
    }
    return hashPassword(password);
  };
}

/** A passkey answer that was not unlocked on the device, which core does not accept. */
const notUnlocked = () =>
  new APIError('BAD_REQUEST', {
    message:
      'The passkey was not unlocked on the device. Use one that asks for a PIN or biometrics.',
    code: 'PASSKEY_NOT_UNLOCKED',
  });

export type Auth = ReturnType<typeof createAuth>;

/**
 * Core's better-auth instance, on core's own database.
 *
 * - Sign-in is by email and password; the password policy is enforced here, on the server, for
 *   every request that sets a password (core-app §3.3.2).
 * - **No fresh-session requirement** (`freshAge: 0`): better-auth's fresh gate answers 403 for a
 *   session older than a day, which breaks sensitive actions with no flow to recover. Sensitive
 *   actions ask for the password instead (docs/architecture-rules.md).
 * - Every session is read from the database: the signed cookie cache is off, so a session that has
 *   ended stops working at once everywhere; authentication endpoints are rate limited, with the
 *   counters in the database.
 * - better-auth's telemetry is off: core reports nothing to anyone.
 */
/** What `createAuth` needs besides the database and the settings. */
export type AuthDependencies = {
  registration: RegistrationPolicy;
  mail: AuthMail;
  /**
   * Runs a send without making the request wait for it. The default lets it run on its own: an
   * answer that waited for the mail server would take longer for an address that has an account,
   * which tells whoever asks. Tests pass a function that keeps the sends, to wait for them.
   */
  background?: (task: Promise<unknown>) => void;
};

/** Requests that send an email, and so cannot be answered when mail is not set up. */
const NEEDS_MAIL = new Set(['/send-verification-email', '/request-password-reset']);

/** The second sign-in step's two ways to answer, which also take a `trustDevice` flag core never offers. */
const SECOND_STEP = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);

/**
 * better-auth's routes that ask a signed-in person for their password again, and the field it comes in. Each is checked
 * through `confirmPassword` first, so wrong answers are counted the way every other page that asks counts them (core-app
 * §3.4.1): five in ten minutes and every answer is refused for the rest of the window.
 */
const PASSWORD_AGAIN: Readonly<Record<string, 'password' | 'currentPassword'>> = {
  '/two-factor/enable': 'password',
  '/two-factor/disable': 'password',
  '/two-factor/generate-backup-codes': 'password',
  '/two-factor/get-totp-uri': 'password',
  '/change-password': 'currentPassword',
};

/**
 * better-auth's routes a browser with a locked session may still use (RFC 0006 B3): signing out, here or from an app; signing in afresh,
 * which asks for everything signing in always asks for and gives a new session; and the emailed links, each of which carries its own
 * proof (verifying an address, which signs in afresh, and resetting a password, which ends every session). Every other one refuses a
 * locked session, `get-session` included; the authorization endpoint sends it to the lock page instead. Unlocking is core's own
 * (`src/lock/passkey.ts`), on the same session.
 */
const OPEN_WHEN_LOCKED = new Set([
  '/sign-out',
  '/oauth2/end-session',
  '/sign-in/email',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  ...SECOND_STEP,
  '/verify-email',
  '/request-password-reset',
  '/reset-password/:token',
  '/reset-password',
]);

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * How long a session lasts without use, and how often its end is pushed back while it is used (core-app §3.5, RFC 0006 A1): seven
 * days, and once a day. Set here rather than left to better-auth's defaults, so a change of library cannot move what apps plan
 * against (an app checks its session against core's, sdk §9.7).
 */
export const SESSION_LIFETIME = { expiresIn: 7 * ONE_DAY, updateAge: ONE_DAY } as const;

export function createAuth(
  database: Database,
  settings: AuthSettings,
  { registration, mail, background = (task) => void task.catch(() => undefined) }: AuthDependencies,
) {
  // The apps to tell about each session being deleted, read before it goes (deleting it clears the tokens' pointer to it).
  const endingSessions = new EndingSessions();
  return betterAuth({
    appName: 'Sovereign',
    baseURL: settings.baseUrl,
    secret: settings.secret,
    database: adapterFor(database),
    telemetry: { enabled: false },
    trustedOrigins: settings.trustedOrigins,
    user: {
      // Set by core when the account is made. `input: false` makes better-auth refuse a request
      // that tries to choose it.
      additionalFields: {
        role: { type: 'string', required: false, input: false, defaultValue: ROLE_USER },
        // What the person sends at sign-up, and may change later. Each is checked in the create
        // hook below and again in the update hook.
        timezone: { type: 'string', required: false, input: true },
        locale: { type: 'string', required: false, input: true },
        agreedToTerms: { type: 'boolean', required: false, input: true, defaultValue: false },
        // Set by core from `agreedToTerms`: when, and which text.
        termsAcceptedAt: { type: 'date', required: false, input: false },
        termsVersion: { type: 'string', required: false, input: false },
        // Set by deactivating the account (`accounts/states.ts`), never by a request.
        deactivatedAt: { type: 'date', required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        // A session that ends (signing out, ending it from the identity pages, a password reset) is told to every app that used it
        // and has a back-channel address, by core alone (core-app §3.6.5): the notices are written once it is gone, and sent at
        // once and then by a timer until each app answers (`logout-notices.ts`). The provider sends none of its own, since no app
        // has an address in its field.
        delete: {
          before: async (session) => {
            const planned = await planLogoutNotices(database, { sessionId: session.id });
            endingSessions.hold(session.id, planned);
          },
          after: async (session, context) => {
            const planned = endingSessions.take(session.id);
            if (!planned) return;
            await queueLogoutNotices(database, planned);
            // Sent now when there is a request to sign with; otherwise the next round of the timer sends them.
            if (context) {
              background(
                deliverDueLogoutNotices(database, {
                  $context: Promise.resolve(context.context),
                } as unknown as Pick<Auth, '$context'>),
              );
            }
          },
        },
        create: {
          // Every session, whichever way it is opened: password, passkey, the second step, a
          // verification link. A deactivated account has none, and neither does one whose address
          // must be verified and is not.
          before: async (session) => {
            const { rows } = await database.run(
              'select email_verified, deactivated_at from users where id = ?',
              [session.userId],
            );
            const row = rows[0];
            if (!row) throw new APIError('UNAUTHORIZED', { message: 'No such account.' });
            assertMayOpenSession(
              {
                emailVerified: row.email_verified === true || row.email_verified === 1,
                deactivatedAt: row.deactivated_at as number | string | null,
              },
              settings,
            );
          },
        },
      },
      user: {
        create: {
          // Every account is made through here, whatever the route: the sign-up endpoint, or a
          // server-side call that has no route (a request hook cannot see those).
          before: async (user, context) => {
            // The name, the terms, the time zone and the language first: they are the person's to put right, whoever
            // they are. No picture comes with a sign-up: one is uploaded afterwards.
            if (user.image !== undefined && user.image !== null) refuseImageInput();
            const name = cleanName(user.name);
            const record = { ...signUpRecord(user), name };
            // The first account is exempt from invite-only and is the owner. A second sign-up
            // racing for it loses at the database, which holds one owner at most.
            if (await isFirstAccount(database)) return { data: { ...record, role: ROLE_OWNER } };
            if (
              (await registration.inviteOnly()) &&
              !(await hasValidInvite(database, user.email, Date.now()))
            ) {
              // One answer for no invite, an expired one, a cancelled one and a used one, so it
              // says nothing about invitations other people hold.
              // Not 403: with verification required, better-auth answers a 403 from a hook with a
              // made-up success, so the person would wait for an email that never comes.
              throw new APIError('UNPROCESSABLE_ENTITY', {
                message: 'Sign-up needs an invitation, and there is no valid one for this address.',
                code: 'INVITE_REQUIRED',
              });
            }
            // A sign-up from the link of an invitation core emailed to this address has shown it reads
            // the address: it is verified now, and no second email asks the same (core-app §3.3.3).
            // Only the link's id counts, sent by the sign-up page, never the address alone.
            const invite = (context?.body as { invite?: unknown } | undefined)?.invite;
            if (await inviteVouchesFor(database, invite, user.email, Date.now())) {
              return { data: { ...record, role: ROLE_USER, emailVerified: true } };
            }
            return { data: { ...record, role: ROLE_USER } };
          },
          after: async (user) => {
            await markInvitesAccepted(database, user.email, Date.now());
            // With verification required, the notice waits until the address is verified: nobody
            // is told about an account on an address nobody has shown to be theirs. One verified by
            // its invitation is told now.
            if (!settings.requireEmailVerification || user.emailVerified) {
              background(mail.accountCreated({ email: user.email, name: user.name }));
            }
          },
        },
        update: {
          // The terms are accepted once, at sign-up, and recorded; an update cannot rewrite that. A
          // name, a time zone and a language can be changed, and are checked as they were at sign-up. The picture
          // is not set here: it is uploaded, which is the only thing that sets it.
          before: (data) => {
            if ('agreedToTerms' in data) {
              throw new APIError('BAD_REQUEST', {
                message: 'The terms are accepted when the account is created.',
                code: 'FIELD_NOT_ALLOWED',
              });
            }
            // better-auth passes `name` and `image` on every update, undefined when not sent.
            if (data.image !== undefined) refuseImageInput();
            const patch: { name?: string; timezone?: string | null; locale?: string | null } = {};
            if (data.name !== undefined) patch.name = cleanName(data.name);
            if ('timezone' in data) patch.timezone = timezoneOrNull(data.timezone);
            if ('locale' in data) patch.locale = localeOrNull(data.locale);
            return Promise.resolve(Object.keys(patch).length > 0 ? { data: patch } : undefined);
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // better-auth's own length limits would answer first, with its own wording; core's policy
      // says it all, in one sentence. These only keep an absurdly long body from reaching it.
      minPasswordLength: 1,
      maxPasswordLength: BODY_LIMIT,
      password: { hash: policedHash() },
      autoSignIn: true,
      requireEmailVerification: settings.requireEmailVerification,
      // A reset link works once and for an hour, and completing it ends every session.
      sendResetPassword: ({ user, url }) =>
        mail.passwordReset({ email: user.email, name: user.name }, url),
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      // better-auth sends one at every sign-up while verification is required, even for an address its
      // invitation has already verified; that one gets none.
      sendVerificationEmail: ({ user, url }) =>
        user.emailVerified
          ? Promise.resolve()
          : mail.verification({ email: user.email, name: user.name }, url),
      sendOnSignUp: settings.requireEmailVerification,
      // Signing in with an unverified address does not send another link: asking for one is its
      // own request, so a wrong guess at a password cannot be used to fill an inbox.
      sendOnSignIn: false,
      // Following the link signs the person in; a second use finds the address already verified
      // and does nothing, so the link opens a session once.
      autoSignInAfterVerification: true,
      expiresIn: ONE_HOUR,
      afterEmailVerification: (user) => {
        if (settings.requireEmailVerification) {
          background(mail.accountCreated({ email: user.email, name: user.name }));
        }
        return Promise.resolve();
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // A locked session gets nothing from better-auth's routes either (RFC 0006 B3). This is for requests from a browser: core's own
        // server code reads the session through `getSession` (src/auth/session.ts), which applies the lock itself, and the lock page
        // has to read a locked session to say whose it is.
        if (ctx.request && !OPEN_WHEN_LOCKED.has(ctx.path)) {
          const current = await getSessionFromCtx(ctx);
          if (current) {
            const { locked } = await lockStatus(database, {
              sessionId: current.session.id,
              userId: current.user.id,
              deviceId: deviceIdFrom(ctx.headers?.get('cookie') ?? null, settings.secureCookies),
            });
            if (locked) {
              // An app's sign-in, or its hourly check, waits for the unlock and then carries on.
              if (ctx.path === '/oauth2/authorize') {
                const asked = `/api/auth/oauth2/authorize${new URL(ctx.request.url).search}`;
                throw ctx.redirect(`/lock?returnTo=${encodeURIComponent(asked)}`);
              }
              throw new APIError('UNAUTHORIZED', {
                message: 'This session is locked.',
                code: 'SESSION_LOCKED',
              });
            }
          }
        }
        // A person's second factor is theirs alone: core offers no "trust this device" that would
        // skip the second step for a month, so a request asking for one is refused, not ignored.
        if (SECOND_STEP.has(ctx.path) && (ctx.body as { trustDevice?: unknown })?.trustDevice) {
          throw new APIError('BAD_REQUEST', {
            message: 'Trusting a device is not offered.',
            code: 'TRUST_DEVICE_NOT_OFFERED',
          });
        }
        // Signing in with anything but a sign-in value is refused before any account is looked up, with the answer a wrong
        // password gets. Left to the route, an unknown address would reach the hash (better-auth hashes there to even out the
        // time) and be refused differently from a known one, which would tell who has an account (core-app §5.2).
        // The same for signing up: an address that has an account is answered before anything is hashed, and an unknown one
        // would reach the hash and be refused there, differently (core-app §5.2).
        if (
          ctx.path === '/sign-up/email' &&
          !isSignInValue((ctx.body as { password?: unknown })?.password)
        ) {
          throw new APIError('BAD_REQUEST', {
            message: 'A password must be sent as the sign-in value the page makes from it.',
            code: 'PASSWORD_NOT_DERIVED',
          });
        }
        if (
          ctx.path === '/sign-in/email' &&
          !isSignInValue((ctx.body as { password?: unknown })?.password)
        ) {
          throw new APIError('UNAUTHORIZED', {
            message: 'Invalid email or password',
            code: 'INVALID_EMAIL_OR_PASSWORD',
          });
        }
        // The password asked for again is counted as `confirmPassword` counts it, before better-auth checks it too. A wrong
        // one is answered as better-auth answers it; a limited one as a rate limit.
        const field = Object.hasOwn(PASSWORD_AGAIN, ctx.path)
          ? PASSWORD_AGAIN[ctx.path]
          : undefined;
        if (field) {
          const session = await getSessionFromCtx(ctx);
          if (session) {
            const given = (ctx.body as Record<string, unknown> | undefined)?.[field];
            const check = await confirmPassword(
              database,
              { $context: Promise.resolve(ctx.context) } as unknown as Pick<Auth, '$context'>,
              session.user.id,
              given,
            );
            if (check === 'limited') {
              throw new APIError('TOO_MANY_REQUESTS', {
                message: 'Too many wrong passwords. Wait ten minutes, then try again.',
                code: 'TOO_MANY_ATTEMPTS',
              });
            }
            if (check === 'wrong') {
              throw new APIError('BAD_REQUEST', {
                message: 'Invalid password',
                code: 'INVALID_PASSWORD',
              });
            }
          }
        }
        // Two-factor is for an address that has been shown to be the person's. An unverified
        // account that turned it on could later follow a verification link, which opens a session
        // without a second step.
        if (ctx.path === '/two-factor/enable') {
          const session = await getSessionFromCtx(ctx);
          const user = session && (await ctx.context.internalAdapter.findUserById(session.user.id));
          if (user && !user.emailVerified) {
            throw new APIError('BAD_REQUEST', {
              message: 'Verify your email address before turning on two-factor sign-in.',
              code: 'EMAIL_NOT_VERIFIED',
            });
          }
        }
        // Before anything is looked up, so the answer is the same for every address: a request that
        // needs email is refused while email is not set up. (Verification also gates sign-up.)
        const needsMail =
          NEEDS_MAIL.has(ctx.path) ||
          (settings.requireEmailVerification && ctx.path === '/sign-up/email');
        if (!needsMail) return;
        const reason = await mail.unavailable();
        if (reason === undefined) return;
        console.warn(`${reason} A request that needs email was refused.`);
        throw new APIError('SERVICE_UNAVAILABLE', {
          message: "Email isn't set up on this instance, so this can't be done yet.",
          code: 'EMAIL_NOT_AVAILABLE',
        });
      }),
      // A passkey removed takes its way into the person's keys with it (core-app §5.5). Reading the vault already leaves out a way
      // in whose passkey is gone; this deletes it.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/passkey/delete-passkey') return;
        const session = await getSessionFromCtx(ctx);
        if (session) await new KeyVault(database).dropRemovedPasskeys(session.user.id);
      }),
    },
    // The JWT plugin's own `/token` hands any session a signed JWT. Core signs nothing for a session: only
    // the OAuth provider's token endpoint issues tokens.
    disabledPaths: [
      '/token',
      // Consent is removed only by `removeAccess`, which also revokes the app's tokens; the provider's own
      // endpoints delete or narrow it and leave the app's refresh tokens alive.
      '/oauth2/delete-consent',
      '/oauth2/update-consent',
      // A client is written only by the registry (`src/clients`), which applies every rule of core-app §3.7
      // whoever asks: the provider's own endpoints for it would reach a client row around those rules.
      '/oauth2/register',
      '/oauth2/create-client',
      '/oauth2/update-client',
      '/oauth2/delete-client',
      '/oauth2/client/rotate-secret',
      '/oauth2/client/rotate-keys',
    ],
    plugins: [
      // Authenticator app (TOTP) with backup codes. The code sent by email or text is not offered:
      // no `sendOTP` is given, so those endpoints answer that they are not configured. The secret and
      // the backup codes are stored encrypted with SV_AUTH_SECRET by better-auth.
      twoFactor({ issuer: 'Sovereign', backupCodeOptions: { amount: 10 } }),
      // Passkeys (core-app §3.4.2). A passkey must be unlocked on the device (a PIN or a biometric), so
      // using one is possession plus something the person knows or is: it is two factors by itself and
      // does not ask for the authenticator app's code on top. better-auth asks the device for that
      // ("preferred") but does not require it, so both ceremonies refuse an answer that was not
      // user-verified; an authenticator that cannot unlock (a bare security key) is refused.
      passkey({
        rpID: settings.webauthn.rpId,
        rpName: settings.webauthn.rpName,
        origin:
          settings.webauthn.origins.length === 1
            ? settings.webauthn.origins[0]
            : settings.webauthn.origins,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          afterVerification: ({ verification }) => {
            if (!verification.registrationInfo?.userVerified) throw notUnlocked();
          },
        },
        authentication: {
          afterVerification: async ({ ctx, verification, clientData }) => {
            if (!verification.authenticationInfo.userVerified) throw notUnlocked();
            // The same checks as a password sign-in: this is another way to open a session.
            const found = await ctx.context.adapter.findOne<{ userId: string }>({
              model: 'passkey',
              where: [{ field: 'credentialID', value: clientData.id }],
            });
            const user = found && (await ctx.context.internalAdapter.findUserById(found.userId));
            if (user) assertMayOpenSession(user, settings);
          },
        },
      }),
      // Core as a sign-in server for other apps (core-app §3.6).
      ...oidcPlugins(database, settings),
    ],
    session: {
      ...SESSION_LIFETIME,
      freshAge: 0,
      // No signed cookie cache: with one, a session that had ended (a sign-out elsewhere, a password
      // reset, a deactivation) went on working for up to 300 seconds for every better-auth endpoint, and
      // the OAuth provider's authorize endpoint would still have issued a code to it. Each check reads
      // the session from the database instead: one primary-key lookup.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      // Asking to sign in with a passkey writes a challenge for anyone who asks, so it is limited like
      // the other ways of signing in.
      customRules: {
        '/passkey/generate-authenticate-options': { window: 10, max: 5 },
        '/passkey/verify-authentication': { window: 10, max: 5 },
      },
    },
    advanced: {
      // Never off: better-auth switches the origin check off by itself when NODE_ENV is "test".
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // `__Host-` names while core is on its own host over https, `__Secure-` when a cookie domain shares them, and
      // none over http (src/auth/cookies.ts).
      ...advancedCookieOptions({ secure: settings.secureCookies, domain: settings.cookieDomain }),
      backgroundTasks: { handler: background },
      // Without trusted proxies better-auth believes only a single-address X-Forwarded-For, and
      // gives every other request one shared limit; it never believes the leftmost of a chain.
      ...(settings.trustedProxies.length > 0
        ? { ipAddress: { trustedProxies: settings.trustedProxies } }
        : {}),
      ...(settings.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: settings.cookieDomain } }
        : {}),
    },
  });
}
