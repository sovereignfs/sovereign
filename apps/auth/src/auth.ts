import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { jwt } from 'better-auth/plugins/jwt';
import { passkey } from '@better-auth/passkey';
import { oauthProvider } from '@better-auth/oauth-provider';
import { renderPasswordResetEmail, renderSubject } from '@sovereignfs/mailer';
import { authGet, authRun, getAuthDatabase } from './db';
import { getEmailBranding, getPasswordResetCopy } from './email-branding';
import { getEnv } from './env';
import { isValidTimezone } from './timezone';
import { resolveInvitePluginGrants } from './invite-plugin-grants';
import { isMailerConfigured, sendAuthPlatformEmail } from './platform-email';
import { readInviteOnlySetting, resolveInviteOnly } from './settings';
import { runtimePublicUrl } from './runtime-url';
import { recomputeVerificationLevel, userHasMfa } from './verification';

function buildOptions(): BetterAuthOptions {
  const env = getEnv();

  if (env.requireEmailVerification && !isMailerConfigured()) {
    // Not a hard throw — that would break an already-running instance's
    // upgrade the moment this ships if the operator hasn't set SMTP_HOST.
    // A loud boot-time warning is safer: registration will still fail per
    // attempt (sendAuthPlatformEmail throws for deliveryClass:
    // 'authentication' when unconfigured), but the operator finds out at
    // startup instead of via a confused new user's bug report.
    console.warn(
      '[auth] AUTH_REQUIRE_EMAIL_VERIFICATION is enabled but no SMTP is configured — ' +
        'new registrations will fail until SMTP_HOST is set, or set ' +
        'AUTH_REQUIRE_EMAIL_VERIFICATION=false to disable the requirement.',
    );
  }

  return {
    secret: env.secret,
    baseURL: env.baseUrl,
    ...(env.trustedOrigins.length > 0 && { trustedOrigins: env.trustedOrigins }),
    ...(env.cookieDomain && {
      advanced: {
        crossSubDomainCookies: { enabled: true, domain: env.cookieDomain },
      },
    }),
    database: getAuthDatabase(),
    session: {
      // Disable better-auth's "fresh session" gate. By default sensitive
      // endpoints guarded by freshSessionMiddleware (e.g. GET /list-sessions,
      // used by sdk.auth.listSessions / the Account Security tab) return
      // 403 SESSION_NOT_FRESH once a session is older than freshAge (default
      // 1 day). In a self-hosted workspace users stay signed in for weeks, so
      // viewing/managing your own sessions must not require recent re-auth.
      freshAge: 0,
      // Sign a short-lived snapshot of the session+user into a `session_data`
      // cookie so the runtime middleware can verify requests locally (HMAC,
      // shared secret) without a /api/verify round-trip per request (SRS
      // AUTH-05). maxAge bounds how stale a role change / deactivation can be
      // before the runtime falls back to /api/verify.
      cookieCache: { enabled: true, maxAge: 300 },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      sendResetPassword: async ({ user, token }) => {
        // reset-password UI now lives only on the runtime (apps/auth removed its
        // copy as redundant) — link there, not to this app's own baseUrl.
        const resetUrl = `${runtimePublicUrl()}/reset-password?token=${token}`;
        // No per-user/platform locale preference exists yet (RFC 0029 not
        // shipped) — 'en' is the documented fallback per RFC 0031's open
        // questions; Console's Email Templates section still lets an
        // operator override the English copy today.
        const [branding, copy] = await Promise.all([getEmailBranding(), getPasswordResetCopy()]);
        const localeInput = { locale: 'en', overrides: copy };
        const html = await renderPasswordResetEmail(resetUrl, branding, localeInput);
        const subject = renderSubject('passwordReset', branding, localeInput);
        await sendAuthPlatformEmail({
          templateId: 'auth.password_reset',
          deliveryClass: 'authentication',
          toUserId: user.id,
          toEmail: user.email,
          subject,
          html,
          text: `You requested a password reset.\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
          metadata: { flow: 'password_reset' },
        });
      },
      // Minimum password length (better-auth default is 8, but being explicit
      // here so it doesn't silently change with a library upgrade).
      minPasswordLength: 8,
      // When true (default), blocks sign-in with EMAIL_NOT_VERIFIED until the
      // account is verified, and sign-up returns { token: null } instead of
      // creating a session. Requires emailVerification.sendVerificationEmail
      // below, or unverified accounts would have no resend path at all.
      requireEmailVerification: env.requireEmailVerification,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, token }) => {
        const verifyUrl = `${env.baseUrl}/verify-email?token=${token}`;
        await sendAuthPlatformEmail({
          templateId: 'auth.email_verification',
          deliveryClass: 'authentication',
          toUserId: user.id,
          toEmail: user.email,
          subject: 'Verify your Sovereign email address',
          html: `<p>Confirm your email address to finish setting up your Sovereign account.</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>This link expires in 1 hour. If you did not create this account, you can ignore this email.</p>`,
          text: `Confirm your email address to finish setting up your Sovereign account.\n\nVerify: ${verifyUrl}\n\nThis link expires in 1 hour. If you did not create this account, ignore this email.`,
          metadata: { flow: 'email_verification' },
        });
      },
      // Clicking the verification link signs the user straight in, rather
      // than making them return to /login after confirming — matches
      // autoSignIn on emailAndPassword above for the no-verification path.
      autoSignInAfterVerification: true,
    },
    // Brute-force / credential-stuffing protection. better-auth applies
    // per-path special rules on top of the global rate limit:
    //   • /sign-in/* and /sign-up/*      → 3 requests per 10 s per IP
    //   • /request-password-reset / etc  → 3 requests per 60 s per IP
    // Returns 429 with an X-Retry-After header when exceeded.
    // Enabled unconditionally so dev behaviour matches production; in dev
    // better-auth resolves all requests to LOCALHOST_IP, so all browser
    // sign-in attempts share the same bucket — a minor inconvenience worth the
    // consistency.
    rateLimit: {
      enabled: process.env.NODE_ENV !== 'test',
      storage: 'memory',
    },
    user: {
      additionalFields: {
        // Platform role. Not user-settable; assigned by the create hook below.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'platform:user',
          input: false,
        },
        // Whether the account is active. Admins can deactivate/reactivate via Console.
        active: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
        // Marks accounts inserted by the seed script. Not user-settable.
        isTestUser: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        // The browser timezone captured at registration (a helpful default,
        // never authoritative — the Account plugin's account_prefs row wins).
        // `input: true` lets the register form send it via signUp.email; the
        // create hook validates it against the Intl database, so a client can
        // never persist a bogus value. `update-user` also accepts it, which is
        // harmless: the runtime's lazy account_prefs seed only ever applies on
        // first load when the row is still at its UTC default, and a user
        // later setting a real preference always overrides it.
        timezone: {
          type: 'string',
          required: false,
          input: true,
        },
        // Progressive verification (RFC 0035): 0 registered, 1 email_verified,
        // 2 mfa_enrolled, 3 admin_vouched. Not user-settable — only ever
        // written by the create hook (initial grant), the databaseHooks.user
        // .update.after / passkey after-hooks below (self-healing recompute),
        // or the admin vouch route (Level 3).
        verificationLevel: {
          type: 'number',
          required: false,
          defaultValue: 0,
          input: false,
        },
        // JSON-encoded array of { type, at, by? } — an append-only audit
        // trail of level transitions, capped at 20 entries. Not user-settable.
        verificationEvents: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Reject a bogus registration timezone rather than persisting
            // garbage into the session and, later, the runtime's account_prefs.
            if (user.timezone !== undefined && user.timezone !== null) {
              if (!isValidTimezone(user.timezone)) {
                throw new APIError('BAD_REQUEST', {
                  message: 'The timezone provided is not a valid IANA timezone.',
                });
              }
            }

            const countRow = await authGet<{ c: number | string }>(
              'SELECT COUNT(*) AS c FROM "user"',
            );
            // COUNT is a number on SQLite, a bigint-as-string on Postgres.
            const isFirst = Number(countRow?.c ?? 0) === 0;

            // Invite-only gate (first user bootstraps and is exempt). The
            // Console toggle (stored setting) overrides the env default, so
            // this is resolved per registration — no restart needed (CON-10).
            const inviteOnly = resolveInviteOnly(await readInviteOnlySetting(), env.inviteOnly);
            if (!isFirst && inviteOnly) {
              const now = Math.floor(Date.now() / 1000);
              const invite = await authGet(
                'SELECT token FROM invites WHERE email = ? AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)',
                [user.email, now],
              );
              if (!invite) {
                throw new APIError('FORBIDDEN', {
                  message: 'Registration is invite-only; no valid invite was found for this email.',
                });
              }
              await authRun('UPDATE invites SET consumed_at = ? WHERE email = ?', [
                now,
                user.email,
              ]);
            }

            // First user becomes the platform owner (RFC 0021). Verification
            // Level 1 is auto-granted at creation when email verification
            // isn't required — there's no verify-email event to promote it
            // later in that case (RFC 0035, review checklist: "false
            // auto-promotes to Level 1 with no email sent").
            return {
              data: {
                ...user,
                role: isFirst ? 'platform:owner' : 'platform:user',
                verificationLevel: env.requireEmailVerification ? 0 : 1,
              },
            };
          },
          after: async (user) => {
            await sendAuthPlatformEmail({
              templateId: 'auth.account_created',
              deliveryClass: 'security',
              toUserId: user.id,
              toEmail: user.email,
              subject: 'Your Sovereign account was created',
              html: `<p>Your Sovereign account was created successfully.</p>
<p>If you did not create this account, contact your instance operator.</p>`,
              text: `Your Sovereign account was created successfully.\n\nIf you did not create this account, contact your instance operator.`,
              metadata: { role: typeof user.role === 'string' ? user.role : null },
            });

            // Resolve an invite-scoped plugin entitlement (RFC 0065 Task
            // 2.23), if this registration consumed one. No-op for a plain
            // (non-invited) signup or an invite with no plugin scope.
            await resolveInvitePluginGrants({ id: user.id, email: user.email });
          },
        },
        update: {
          // Self-healing recompute (RFC 0035 §5.4), not an edge diff: fires
          // on every `user` row update — including the email-verification
          // flow's updateUserByEmail({ emailVerified: true }) and the
          // two-factor plugin's updateUser({ twoFactorEnabled }) — and
          // recomputes the level from whatever the row says right now.
          // Passkey creation/deletion writes a separate `passkey` table, so
          // it can't reach this hook; the top-level `hooks.after` below
          // covers that case with the same recompute call.
          after: async (user) => {
            const row = user as Record<string, unknown>;
            const emailVerified = row.emailVerified === true;
            const twoFactorEnabled = row.twoFactorEnabled === true;
            const currentLevel = Number(row.verificationLevel ?? 0);
            const currentEvents =
              typeof row.verificationEvents === 'string' ? row.verificationEvents : null;
            const hasMfa = await userHasMfa(user.id, twoFactorEnabled);
            await recomputeVerificationLevel(user.id, currentLevel, currentEvents, {
              emailVerified,
              hasMfa,
            });
          },
        },
      },
    },
    // Reacts to passkey creation/deletion, which writes better-auth's
    // separate `passkey` table — invisible to `databaseHooks.user.*` above.
    // Confirmed against @better-auth/passkey@1.6.25's compiled source: both
    // endpoints run through `sessionMiddleware`/`freshSessionMiddleware`, so
    // `ctx.context.session.user.id` is populated by the time this `after`
    // hook runs (same value the endpoint handlers themselves read).
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/passkey/verify-registration' && ctx.path !== '/passkey/delete-passkey') {
          return;
        }
        const userId = ctx.context.session?.user?.id;
        if (!userId) return;

        const row = await authGet<{
          verificationLevel: number | string | null;
          verificationEvents: string | null;
          emailVerified: number | boolean | null;
          twoFactorEnabled: number | boolean | null;
        }>(
          'SELECT "verificationLevel", "verificationEvents", "emailVerified", "twoFactorEnabled" FROM "user" WHERE id = ?',
          [userId],
        );
        if (!row) return;

        const emailVerified = row.emailVerified === 1 || row.emailVerified === true;
        const twoFactorEnabled = row.twoFactorEnabled === 1 || row.twoFactorEnabled === true;
        const hasMfa = await userHasMfa(userId, twoFactorEnabled);
        await recomputeVerificationLevel(
          userId,
          Number(row.verificationLevel ?? 0),
          row.verificationEvents,
          {
            emailVerified,
            hasMfa,
          },
        );
      }),
    },
    plugins: [
      twoFactor({
        issuer: env.webAuthnRpName,
        // Backup codes (10 codes). OTP (email/SMS) is omitted — no sendOTP
        // configured, so those endpoints are effectively inert (RFC 0012).
        backupCodeOptions: { amount: 10 },
      }),
      passkey({
        rpID: env.webAuthnRpId,
        rpName: env.webAuthnRpName,
        origin: env.webAuthnOrigin.length === 1 ? env.webAuthnOrigin[0] : env.webAuthnOrigin,
      }),
      // Required by oauthProvider below for ID token signing/verification
      // (JWKS) — the oauth-provider plugin throws `jwt_config` at request
      // time without it. No config needed: auto-generates and stores its
      // own keypair via better-auth's own schema.
      jwt(),
      // External OAuth 2.0 / OIDC provider for non-plugin apps (RFC 0072).
      // Lets a standalone app on its own domain offer "log in with
      // Sovereign" without joining the plugin system. Schema
      // (oauthClient/oauthAccessToken/oauthRefreshToken/oauthConsent) is
      // auto-discovered by better-auth's own migrator (apps/auth/src/migrate.ts)
      // — no custom table needed, unlike the invites table.
      //
      // Expect benign "Field ... has a different type in the database"
      // warnings on every startup for this plugin's string[] fields (scopes,
      // redirectUris, etc.) on SQLite: better-auth's own schema checker wants
      // the column's declared type name to contain "json", but SQLite has no
      // native array/JSON column type, so the migrator creates them as TEXT
      // (values are JSON-encoded on write, decoded on read — this works
      // correctly, verified end-to-end). Cosmetic upstream gap in
      // better-auth's SQLite type-checker, not something to silence via a
      // schema override.
      oauthProvider({
        loginPage: '/login',
        consentPage: '/oauth2/consent',
        // Client secrets are stored hashed, never reversibly encrypted — they
        // only ever need to be verified at token-exchange time, never re-shown.
        storeClientSecret: 'hashed',
        // No self-service registration: clients are admin-registered only
        // (RFC 0072's v1 recommendation, consistent with the platform's
        // operator-controlled trust model). This is better-auth's own
        // default (false); set explicitly so it doesn't silently change on
        // a library upgrade.
        allowDynamicClientRegistration: false,
        // Registering/revoking/rotating a client is restricted to platform
        // admins and the owner — the same role set as `instance:configure`
        // in runtime/src/capabilities.ts. apps/auth doesn't import runtime
        // code, so the role check is duplicated here rather than shared.
        clientPrivileges: ({ user }) => {
          const role = typeof user?.role === 'string' ? user.role : undefined;
          return role === 'platform:owner' || role === 'platform:admin';
        },
      }),
      nextCookies(),
    ],
  };
}

let options: BetterAuthOptions | undefined;
let instance: ReturnType<typeof betterAuth> | undefined;

/** The resolved better-auth options (also used by the migration runner). */
export function getAuthOptions(): BetterAuthOptions {
  options ??= buildOptions();
  return options;
}

/** The better-auth instance, created lazily on first use (runtime, not build). */
export function getAuth(): ReturnType<typeof betterAuth> {
  instance ??= betterAuth(getAuthOptions());
  return instance;
}
