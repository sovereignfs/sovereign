import type { Database } from '@sovereignfs/database';
import { betterAuth } from 'better-auth';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import {
  createAuthPreset,
  SECOND_STEP,
  SESSION_LIFETIME,
  type RequestContext,
} from '@sovereignfs/auth/server';
import { KeyVault } from '../keys/vault';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { hasValidInvite, inviteVouchesFor, markInvitesAccepted } from '../invites';
import { deviceIdFrom } from '../lock/device';
import { lockStatus } from '../lock/store';
import type { AuthMail } from './mail';
import { isFirstAccount, type RegistrationPolicy } from './registration';
import {
  deliverDueLogoutNotices,
  planLogoutNotices,
  queueLogoutNotices,
  EndingSessions,
} from '../oauth/logout-notices';
import { oidcPlugins } from '../oauth/provider';
import { appOnlySignOut } from '../oauth/app-only-sign-out';
import type { JSONWebKeySet } from 'jose';
import { ROLE_OWNER, ROLE_USER } from './roles';
import type { AuthSettings } from './settings';
import { signUpRecord } from './terms';

export { SESSION_LIFETIME };

/** Core's tables under better-auth's model names: the sign-in package's, with core's columns, and the OIDC provider's. */
function tablesFor(database: Database) {
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
  return schema;
}

export type Auth = ReturnType<typeof createAuth>;

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

/**
 * Core's better-auth instance, on core's own database: the sign-in package's preset (auth.md §4, every rule a sign-in holds), with
 * what only core has on top (auth.md §4, "Core's additions"): the owner and invitations, the terms, logout notices, the lock, a
 * removed passkey's way into the keys, and the OIDC provider (core-app §3.6).
 */
export function createAuth(
  database: Database,
  settings: AuthSettings,
  { registration, mail, background = (task) => void task.catch(() => undefined) }: AuthDependencies,
) {
  // The apps to tell about each session being deleted, read before it goes (deleting it clears the tokens' pointer to it).
  const endingSessions = new EndingSessions();
  // The instance's own keys, for checking a hint on signing out of an app (`appOnlySignOut`): read through the instance once it exists.
  const own: { jwks?: () => Promise<unknown> } = {};
  const auth = betterAuth(
    createAuthPreset({
      appName: 'Sovereign',
      database,
      tables: tablesFor(database),
      settings,
      mail,
      background,
      // Who may get an account (core-app §3.3.1): the first account is the owner; after it, invite-only unless the operator opened it.
      registration: async (user, context, fields) => {
        // The first account is exempt from invite-only and is the owner. A second sign-up
        // racing for it loses at the database, which holds one owner at most.
        if (await isFirstAccount(database)) return { ...fields, role: ROLE_OWNER };
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
          return { ...fields, role: ROLE_USER, emailVerified: true };
        }
        return { ...fields, role: ROLE_USER };
      },
      userFields: {
        // Set by core when the account is made. `input: false` makes better-auth refuse a request
        // that tries to choose it.
        role: { type: 'string', required: false, input: false, defaultValue: ROLE_USER },
        agreedToTerms: { type: 'boolean', required: false, input: true, defaultValue: false },
        // Set by core from `agreedToTerms`: when, and which text.
        termsAcceptedAt: { type: 'date', required: false, input: false },
        termsVersion: { type: 'string', required: false, input: false },
      },
      hooks: {
        // A locked session gets nothing from better-auth's routes either (RFC 0006 B3). This is for requests from a browser: core's own
        // server code reads the session through `getSession` (src/auth/session.ts), which applies the lock itself, and the lock page
        // has to read a locked session to say whose it is.
        beforeRequest: async (ctx: RequestContext) => {
          // Signing out of an app whose setting keeps the core session ends nothing of core's (core-app §3.6.5). Apart from the lock
          // below, which leaves this route open.
          const jwks = own.jwks;
          if (ctx.path === '/oauth2/end-session' && jwks) {
            const to = await appOnlySignOut(
              ctx,
              async () => (await jwks()) as JSONWebKeySet,
              new URL(settings.baseUrl).origin,
            );
            if (to) throw ctx.redirect(to);
          }
          if (!ctx.request || OPEN_WHEN_LOCKED.has(ctx.path)) return;
          const current = await getSessionFromCtx(ctx);
          if (!current) return;
          const { locked } = await lockStatus(database, {
            sessionId: current.session.id,
            userId: current.user.id,
            deviceId: deviceIdFrom(ctx.headers?.get('cookie') ?? null, settings.secureCookies),
          });
          if (!locked) return;
          // An app's sign-in, or its hourly check, waits for the unlock and then carries on.
          if (ctx.path === '/oauth2/authorize') {
            const asked = `/api/auth/oauth2/authorize${new URL(ctx.request.url).search}`;
            throw ctx.redirect(`/lock?returnTo=${encodeURIComponent(asked)}`);
          }
          throw new APIError('UNAUTHORIZED', {
            message: 'This session is locked.',
            code: 'SESSION_LOCKED',
          });
        },
        // A passkey removed takes its way into the person's keys with it (core-app §5.5). Reading the vault already leaves out a way
        // in whose passkey is gone; this deletes it.
        afterRequest: async (ctx: RequestContext) => {
          if (ctx.path !== '/passkey/delete-passkey') return;
          const session = await getSessionFromCtx(ctx);
          if (session) await new KeyVault(database).dropRemovedPasskeys(session.user.id);
        },
        // The terms, accepted at sign-up and recorded: when, and which text (core-app §3.3.5).
        userCheck: (user) => signUpRecord(user),
        userCreated: async (user) => {
          await markInvitesAccepted(database, user.email, Date.now());
        },
        // The terms are accepted once, at sign-up, and recorded; an update cannot rewrite that.
        userUpdateCheck: (data) => {
          if ('agreedToTerms' in data) {
            throw new APIError('BAD_REQUEST', {
              message: 'The terms are accepted when the account is created.',
              code: 'FIELD_NOT_ALLOWED',
            });
          }
        },
        sessionDelete: {
          // A session that ends (signing out, ending it from the identity pages, a password reset) is told to every app that used it
          // and has a back-channel address, by core alone (core-app §3.6.5): the notices are written once it is gone, and sent at
          // once and then by a timer until each app answers (`logout-notices.ts`). The provider sends none of its own, since no app
          // has an address in its field.
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
                  $context: Promise.resolve((context as { context: unknown }).context),
                } as unknown as Pick<Auth, '$context'>),
              );
            }
          },
        },
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
      // Core as a sign-in server for other apps (core-app §3.6).
      plugins: oidcPlugins(database, settings),
    }),
  );
  own.jwks = () => auth.api.getJwks();
  return auth;
}
