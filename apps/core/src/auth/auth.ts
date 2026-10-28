import type { Database } from '@sovereignfs/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { hashPassword } from 'better-auth/crypto';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { hasValidInvite, markInvitesAccepted } from '../invites';
import { passwordPolicyMessage, passwordProblems, type PasswordPolicy } from './password-policy';
import { isFirstAccount, type RegistrationPolicy } from './registration';
import { ROLE_OWNER, ROLE_USER } from './roles';
import type { AuthSettings } from './settings';

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
        }
      : {
          user: sqliteSchema.users,
          session: sqliteSchema.sessions,
          account: sqliteSchema.accounts,
          verification: sqliteSchema.verifications,
          rateLimit: sqliteSchema.rateLimits,
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
export function createAuth(
  database: Database,
  settings: AuthSettings,
  registration: RegistrationPolicy,
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
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every account is made through here, whatever the route: the sign-up endpoint, or a
          // server-side call that has no route (a request hook cannot see those).
          before: async (user) => {
            // The first account is exempt from invite-only and is the owner. A second sign-up
            // racing for it loses at the database, which holds one owner at most.
            if (await isFirstAccount(database)) return { data: { role: ROLE_OWNER } };
            if (
              (await registration.inviteOnly()) &&
              !(await hasValidInvite(database, user.email, Date.now()))
            ) {
              // One answer for no invite, an expired one, a cancelled one and a used one, so it
              // says nothing about invitations other people hold.
              throw new APIError('FORBIDDEN', {
                message: 'Sign-up needs an invitation, and there is no valid one for this address.',
                code: 'INVITE_REQUIRED',
              });
            }
            return { data: { role: ROLE_USER } };
          },
          after: async (user) => {
            await markInvitesAccepted(database, user.email, Date.now());
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
    },
    session: {
      freshAge: 0,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'rateLimit' },
    advanced: {
      // Never off: better-auth switches the origin check off by itself when NODE_ENV is "test".
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: settings.secureCookies,
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
