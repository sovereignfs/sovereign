import type { Database } from '@sovereignfs/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { hashPassword } from 'better-auth/crypto';
import { twoFactor } from 'better-auth/plugins/two-factor';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { hasValidInvite, markInvitesAccepted } from '../invites';
import { passwordPolicyMessage, passwordProblems, type PasswordPolicy } from './password-policy';
import type { AuthMail } from './mail';
import { isFirstAccount, type RegistrationPolicy } from './registration';
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
        }
      : {
          user: sqliteSchema.users,
          session: sqliteSchema.sessions,
          account: sqliteSchema.accounts,
          verification: sqliteSchema.verifications,
          rateLimit: sqliteSchema.rateLimits,
          twoFactor: sqliteSchema.twoFactors,
          passkey: sqliteSchema.passkeys,
        };
  return drizzleAdapter(database.drizzle as never, {
    provider: database.family === 'postgres' ? 'pg' : 'sqlite',
    schema,
  });
}

/**
 * better-auth stores a password only by hashing it, whichever way it got there: sign-up, a reset, a
 * change, or a server-side `setPassword` that no HTTP route reaches (and that no request hook can
 * see, because it has no path). So the policy is checked in the hash function: a password that
 * breaks it is refused with the reason, and nothing is stored. The hash itself is better-auth's own,
 * so existing accounts keep working.
 */
function policedHash(policy: PasswordPolicy) {
  return async (password: string) => {
    const problems = passwordProblems(password, policy);
    if (problems.length > 0) {
      throw new APIError('BAD_REQUEST', {
        message: passwordPolicyMessage(problems),
        code: 'PASSWORD_DOES_NOT_MEET_POLICY',
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
 * - Sessions are verified from a signed cookie cache valid for 300 seconds, with a server-side
 *   fallback; authentication endpoints are rate limited, with the counters in the database.
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

const ONE_HOUR = 60 * 60;

export function createAuth(
  database: Database,
  settings: AuthSettings,
  { registration, mail, background = (task) => void task.catch(() => undefined) }: AuthDependencies,
) {
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
          before: async (user) => {
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
            return { data: { ...record, role: ROLE_USER } };
          },
          after: async (user) => {
            await markInvitesAccepted(database, user.email, Date.now());
            // With verification required, the notice waits until the address is verified: nobody
            // is told about an account on an address nobody has shown to be theirs.
            if (!settings.requireEmailVerification) {
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
      password: { hash: policedHash(settings.passwordPolicy) },
      autoSignIn: true,
      requireEmailVerification: settings.requireEmailVerification,
      // A reset link works once and for an hour, and completing it ends every session.
      sendResetPassword: ({ user, url }) =>
        mail.passwordReset({ email: user.email, name: user.name }, url),
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) =>
        mail.verification({ email: user.email, name: user.name }, url),
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
        // A person's second factor is theirs alone: core offers no "trust this device" that would
        // skip the second step for a month, so a request asking for one is refused, not ignored.
        if (SECOND_STEP.has(ctx.path) && (ctx.body as { trustDevice?: unknown })?.trustDevice) {
          throw new APIError('BAD_REQUEST', {
            message: 'Trusting a device is not offered.',
            code: 'TRUST_DEVICE_NOT_OFFERED',
          });
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
    },
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
    ],
    session: {
      freshAge: 0,
      cookieCache: { enabled: true, maxAge: 300 },
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
      useSecureCookies: settings.secureCookies,
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
