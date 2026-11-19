import type { Database } from '@sovereignfs/database';
import { isSignInValue } from '@sovereignfs/crypto';
import { passkey } from '@better-auth/passkey';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';

/** A field on an account, as better-auth declares one. */
type UserField = NonNullable<NonNullable<BetterAuthOptions['user']>['additionalFields']>[string];
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { hashPassword } from 'better-auth/crypto';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { advancedCookieOptions } from '../cookies.js';
import { confirmPassword, type PasswordVerifier } from './confirm-password.js';
import type { AuthMail } from './mail.js';
import { assertMayOpenSession } from './session-gate.js';
import type { AuthSettings } from './settings.js';
import { cleanName, localeOrNull, refuseImageInput, timezoneOrNull } from './validators.js';

/** The longest request body, in characters, for a password; the app's policy sets the real limit. */
const BODY_LIMIT = 1024;

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * How long a session lasts without use, and how often its end is pushed back while it is used (auth.md §4 rule 11, core-app §3.5,
 * RFC 0006 A1): seven days, and once a day. Set here rather than left to better-auth's defaults, so a change of library cannot move
 * what apps plan against.
 */
export const SESSION_LIFETIME = { expiresIn: 7 * ONE_DAY, updateAge: ONE_DAY } as const;

/** Requests that send an email, and so cannot be answered when mail is not set up. */
const NEEDS_MAIL = new Set(['/send-verification-email', '/request-password-reset']);

/** The second sign-in step's two ways to answer, which also take a `trustDevice` flag the package never offers. */
export const SECOND_STEP: ReadonlySet<string> = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

/**
 * better-auth's routes that ask a signed-in person for their password again, and the field it comes in. Each is checked through
 * `confirmPassword` first, so wrong answers are counted the way every other page that asks counts them (auth.md §4, rule 3): five in
 * ten minutes and every answer is refused for the rest of the window.
 */
const PASSWORD_AGAIN: Readonly<Record<string, 'password' | 'currentPassword'>> = {
  '/two-factor/enable': 'password',
  '/two-factor/disable': 'password',
  '/two-factor/generate-backup-codes': 'password',
  '/two-factor/get-totp-uri': 'password',
  '/change-password': 'currentPassword',
};

/**
 * better-auth stores a password only by hashing it, whichever way it got there: sign-up, a reset, a change, or a server-side
 * `setPassword` that no HTTP route reaches. The server never receives a password (auth.md §4 rule 1, core-app §5.2): what arrives is a
 * sign-in value the browser derived from it, so this is where anything else is refused, and nothing is stored. The policy cannot be
 * checked here, since the password is not here: the browser checks it before deriving. The hash itself is better-auth's own.
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

/** A passkey answer that was not unlocked on the device, which the package does not accept (auth.md §4, rule 5). */
const notUnlocked = () =>
  new APIError('BAD_REQUEST', {
    message:
      'The passkey was not unlocked on the device. Use one that asks for a PIN or biometrics.',
    code: 'PASSKEY_NOT_UNLOCKED',
  });

/** better-auth's request context, as its middleware gives it. */
export type RequestContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** A person as better-auth hands them to the user hooks. */
export type UserInput = Record<string, unknown> & { email: string; name: string; image?: unknown };

/** What the app adds to the sign-in (auth.md §3): every one is optional, and none replaces a rule of the package. */
export type AuthPresetHooks = {
  /** Before the package's own checks of a request, for a request from a browser or a server call alike. Core's lock is here. */
  beforeRequest?: (ctx: RequestContext) => Promise<void>;
  /** After a request has been answered. Core drops a removed passkey's way into the keys here. */
  afterRequest?: (ctx: RequestContext) => Promise<void>;
  /**
   * When an account is made, after its picture and name are checked and before its time zone and language: what else the
   * sign-up must carry (core's terms), returned as fields to store. Throw to refuse it.
   */
  userCheck?: (user: UserInput) => Record<string, unknown>;
  /** After an account is made, before the package tells the person about it. */
  userCreated?: (user: { email: string; name: string; emailVerified: boolean }) => Promise<void>;
  /** Before an update of an account is checked: what the app refuses in one (core: the terms, which are accepted once). */
  userUpdateCheck?: (data: Record<string, unknown>) => void;
  /** Around a session's deletion: core's logout notices. */
  sessionDelete?: {
    before?: (session: { id: string }) => Promise<void>;
    after?: (session: { id: string }, context: unknown) => Promise<void>;
  };
};

/**
 * Who may get an account (auth.md §3): called when an account is made, once everything else is checked, with the fields so far. It
 * returns the fields to store, or throws to refuse the account. `signUpPolicy` gives the usual ones; core decides the owner and its
 * invitations here.
 */
export type Registration = (
  user: UserInput,
  context: { body?: unknown } | null | undefined,
  fields: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** Refused because sign-up is closed: one answer whatever the address, so it says nothing about who has an account. */
const signUpClosed = () =>
  new APIError('UNPROCESSABLE_ENTITY', {
    message: 'Sign-up is closed.',
    code: 'SIGNUP_CLOSED',
  });

/**
 * The registration of `AUTH_SIGNUP` (auth.md §5): `open`, anyone; `closed`, the first account only. `invite` needs the app's own
 * check of its invitations, so an app that offers it writes its own `Registration`.
 */
export function signUpPolicy(database: Database, mode: 'open' | 'closed'): Registration {
  return async (_user, _context, fields) => {
    if (mode === 'open') return fields;
    const { rows } = await database.run('select 1 as found from users limit 1');
    if (rows.length > 0) throw signUpClosed();
    return fields;
  };
}

/** What an app gives the package (auth.md §3). */
export type AuthPresetOptions<
  Plugins extends readonly BetterAuthPlugin[],
  Fields extends Record<string, UserField>,
> = {
  /** The app's name: what better-auth and the authenticator app call it. */
  appName: string;
  database: Database;
  /**
   * The app's tables under better-auth's model names (`user`, `session`, `account`, `verification`, `rateLimit`, `twoFactor`,
   * `passkey`, and any its plugins add), for the adapter: the package's own (`authTables`), or the app's with more columns.
   */
  tables: Record<string, unknown>;
  settings: AuthSettings;
  mail: AuthMail;
  /** Who may get an account. Required: no app is open to everyone by leaving it out. */
  registration: Registration;
  /**
   * Runs a send without making the request wait for it. The default lets it run on its own: an answer that waited for the mail
   * server would take longer for an address that has an account, which tells whoever asks (auth.md §4, rule 9).
   */
  background?: (task: Promise<unknown>) => void;
  /** More fields on an account, beside the package's own (`timezone`, `locale`, `deactivatedAt`). */
  userFields?: Fields;
  hooks?: AuthPresetHooks;
  /** Routes of better-auth or of the app's plugins to switch off. */
  disabledPaths?: string[];
  /** More better-auth plugins, run after the package's own (the second step and passkeys). */
  plugins?: Plugins;
};

const noHook = () => Promise.resolve();

/** The package's own fields on an account. */
const BASE_FIELDS = {
  // What the person sends at sign-up, and may change later. Each is checked in the create hook and again in the update hook (rule 7).
  timezone: { type: 'string', required: false, input: true },
  locale: { type: 'string', required: false, input: true },
  // Set by deactivating the account, never by a request (rule 6).
  deactivatedAt: { type: 'date', required: false, input: false },
} as const satisfies Record<string, UserField>;

/**
 * better-auth's options for an app's sign-in (auth.md §4): every rule of the package, with the app's additions given as options.
 * The app calls `betterAuth` with what this returns.
 *
 * - The server never receives a password (rule 1), and better-auth's origin and CSRF checks are never off (rule 2).
 * - **No fresh-session requirement** (`freshAge: 0`, rule 3): a sensitive action asks for the password again, counted.
 * - Every session is read from the database (rule 8): the signed cookie cache is off, so a session that has ended stops working
 *   at once everywhere; authentication routes are rate limited, with the counters in the database (rule 12).
 * - better-auth's telemetry is off: the app reports nothing to anyone.
 */
export function createAuthPreset<
  const Plugins extends readonly BetterAuthPlugin[] = [],
  const Fields extends Record<string, UserField> = Record<never, never>,
>(options: AuthPresetOptions<Plugins, Fields>) {
  const {
    appName,
    database,
    tables,
    settings,
    mail,
    background = (task: Promise<unknown>) => void task.catch(() => undefined),
    hooks = {},
  } = options;
  const userFields = (options.userFields ?? {}) as Fields;
  const extraPlugins = (options.plugins ?? []) as unknown as Plugins;
  const verifier = (ctx: RequestContext): PasswordVerifier => ({
    $context: Promise.resolve(ctx.context) as unknown as PasswordVerifier['$context'],
  });

  return {
    appName,
    baseURL: settings.baseUrl,
    secret: settings.secret,
    database: drizzleAdapter(database.drizzle as never, {
      provider: database.family === 'postgres' ? 'pg' : 'sqlite',
      schema: tables,
    }),
    telemetry: { enabled: false },
    trustedOrigins: settings.trustedOrigins,
    user: {
      additionalFields: {
        ...BASE_FIELDS,
        ...userFields,
      },
    },
    databaseHooks: {
      session: {
        delete: {
          before: async (session: { id: string }) => {
            await hooks.sessionDelete?.before?.(session);
          },
          after: async (session: { id: string }, context: unknown) => {
            await hooks.sessionDelete?.after?.(session, context);
          },
        },
        create: {
          // Every session, whichever way it is opened: password, passkey, the second step, a verification link (rule 6). A
          // deactivated account has none, and neither does one whose address must be verified and is not.
          before: async (session: { userId: string }) => {
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
          // Every account is made through here, whatever the route: the sign-up endpoint, or a server-side call that has no route
          // (a request hook cannot see those). Registration is decided here, and nowhere else (rule 7).
          before: async (user: UserInput, context: { body?: unknown } | null | undefined) => {
            // The picture, the name, what the app asks for, the time zone and the language, in that order: they are the
            // person's to put right, whoever they are. No picture comes with a sign-up: one is uploaded afterwards.
            if (user.image !== undefined && user.image !== null) refuseImageInput();
            const name = cleanName(user.name);
            const extra = hooks.userCheck?.(user) ?? {};
            const fields = {
              ...extra,
              timezone: timezoneOrNull(user.timezone),
              locale: localeOrNull(user.locale),
              name,
            };
            return { data: await options.registration(user, context, fields) };
          },
          after: async (user: { email: string; name: string; emailVerified: boolean }) => {
            await hooks.userCreated?.(user);
            // With verification required, the notice waits until the address is verified: nobody is told about an account on an
            // address nobody has shown to be theirs. One verified already is told now.
            if (!settings.requireEmailVerification || user.emailVerified) {
              background(mail.accountCreated({ email: user.email, name: user.name }));
            }
          },
        },
        update: {
          // A name, a time zone and a language can be changed, and are checked as they were at sign-up. The picture is not set
          // here: it is uploaded, which is the only thing that sets it (rule 17).
          before: (data: Record<string, unknown>) => {
            hooks.userUpdateCheck?.(data);
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
      // better-auth's own length limits would answer first, with its own wording; the app's policy says it all, in one sentence.
      // These only keep an absurdly long body from reaching it.
      minPasswordLength: 1,
      maxPasswordLength: BODY_LIMIT,
      password: { hash: policedHash() },
      autoSignIn: true,
      requireEmailVerification: settings.requireEmailVerification,
      // A reset link works once and for an hour, and completing it ends every session.
      sendResetPassword: ({ user, url }: { user: { email: string; name: string }; url: string }) =>
        mail.passwordReset({ email: user.email, name: user.name }, url),
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      // better-auth sends one at every sign-up while verification is required, even for an address already verified (core's
      // invitation verifies one); that one gets none.
      sendVerificationEmail: ({
        user,
        url,
      }: {
        user: { email: string; name: string; emailVerified: boolean };
        url: string;
      }) =>
        user.emailVerified
          ? Promise.resolve()
          : mail.verification({ email: user.email, name: user.name }, url),
      sendOnSignUp: settings.requireEmailVerification,
      // Signing in with an unverified address does not send another link: asking for one is its own request, so a wrong guess
      // at a password cannot be used to fill an inbox.
      sendOnSignIn: false,
      // Following the link signs the person in; a second use finds the address already verified and does nothing, so the link
      // opens a session once.
      autoSignInAfterVerification: true,
      expiresIn: ONE_HOUR,
      afterEmailVerification: (user: { email: string; name: string }) => {
        if (settings.requireEmailVerification) {
          background(mail.accountCreated({ email: user.email, name: user.name }));
        }
        return Promise.resolve();
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await (hooks.beforeRequest ?? noHook)(ctx);
        // A person's second factor is theirs alone: there is no "trust this device" that would skip the second step for a month,
        // so a request asking for one is refused, not ignored (rule 4).
        if (SECOND_STEP.has(ctx.path) && (ctx.body as { trustDevice?: unknown })?.trustDevice) {
          throw new APIError('BAD_REQUEST', {
            message: 'Trusting a device is not offered.',
            code: 'TRUST_DEVICE_NOT_OFFERED',
          });
        }
        // Signing in with anything but a sign-in value is refused before any account is looked up, with the answer a wrong
        // password gets. Left to the route, an unknown address would reach the hash (better-auth hashes there to even out the
        // time) and be refused differently from a known one, which would tell who has an account (rule 1). The same for
        // signing up: an address that has an account is answered before anything is hashed, and an unknown one would reach the
        // hash and be refused there, differently.
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
        // The password asked for again is counted as `confirmPassword` counts it, before better-auth checks it too (rule 3). A
        // wrong one is answered as better-auth answers it; a limited one as a rate limit.
        const field = Object.hasOwn(PASSWORD_AGAIN, ctx.path)
          ? PASSWORD_AGAIN[ctx.path]
          : undefined;
        if (field) {
          const session = await getSessionFromCtx(ctx);
          if (session) {
            const given = (ctx.body as Record<string, unknown> | undefined)?.[field];
            const check = await confirmPassword(database, verifier(ctx), session.user.id, given);
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
        // The second step is for an address that has been shown to be the person's. An unverified account that turned it on
        // could later follow a verification link, which opens a session without a second step.
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
        // Before anything is looked up, so the answer is the same for every address: a request that needs email is refused while
        // email is not set up (rule 9). (Verification also gates sign-up.)
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
      after: createAuthMiddleware(async (ctx) => {
        await (hooks.afterRequest ?? noHook)(ctx);
      }),
    },
    disabledPaths: options.disabledPaths ?? [],
    plugins: [
      // Authenticator app (TOTP) with backup codes. The code sent by email or text is not offered: no `sendOTP` is given, so those
      // endpoints answer that they are not configured. The secret and the backup codes are stored encrypted with the app's secret
      // by better-auth.
      twoFactor({ issuer: appName, backupCodeOptions: { amount: 10 } }),
      // Passkeys (rule 5). A passkey must be unlocked on the device (a PIN or a biometric), so using one is possession plus something
      // the person knows or is: it is two factors by itself and does not ask for the authenticator app's code on top. better-auth
      // asks the device for that ("preferred") but does not require it, so both ceremonies refuse an answer that was not
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
            // The same checks as a password sign-in: this is another way to open a session (rule 6).
            const found = await ctx.context.adapter.findOne<{ userId: string }>({
              model: 'passkey',
              where: [{ field: 'credentialID', value: clientData.id }],
            });
            const user = found && (await ctx.context.internalAdapter.findUserById(found.userId));
            if (user) assertMayOpenSession(user, settings);
          },
        },
      }),
      ...extraPlugins,
    ] as [ReturnType<typeof twoFactor>, ReturnType<typeof passkey>, ...Plugins],
    session: {
      ...SESSION_LIFETIME,
      freshAge: 0,
      // No signed cookie cache (rule 8): with one, a session that had ended (a sign-out elsewhere, a password reset, a
      // deactivation) went on working for up to 300 seconds for every better-auth endpoint. Each check reads the session from the
      // database instead: one primary-key lookup.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database' as const,
      modelName: 'rateLimit',
      // Asking to sign in with a passkey writes a challenge for anyone who asks, so it is limited like the other ways of signing in.
      customRules: {
        '/passkey/generate-authenticate-options': { window: 10, max: 5 },
        '/passkey/verify-authentication': { window: 10, max: 5 },
      },
    },
    advanced: {
      // Never off: better-auth switches the origin check off by itself when NODE_ENV is "test" (rule 2).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // `__Host-` names while the app is on its own host over https, `__Secure-` when a cookie domain shares them, and none over
      // http (rule 10).
      ...advancedCookieOptions({ secure: settings.secureCookies, domain: settings.cookieDomain }),
      backgroundTasks: { handler: background },
      // Without trusted proxies better-auth believes only a single-address X-Forwarded-For, and gives every other request one
      // shared limit; it never believes the leftmost of a chain.
      ...(settings.trustedProxies.length > 0
        ? { ipAddress: { trustedProxies: settings.trustedProxies } }
        : {}),
      ...(settings.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: settings.cookieDomain } }
        : {}),
    },
  } satisfies BetterAuthOptions;
}
