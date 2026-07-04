import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { authGet, authRun, getAuthDatabase } from './db';
import { getEnv } from './env';
import { sendAuthPlatformEmail } from './platform-email';
import { readInviteOnlySetting, resolveInviteOnly } from './settings';

function buildOptions(): BetterAuthOptions {
  const env = getEnv();

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
        const resetUrl = `${env.baseUrl}/reset-password?token=${token}`;
        await sendAuthPlatformEmail({
          templateId: 'auth.password_reset',
          deliveryClass: 'authentication',
          toUserId: user.id,
          toEmail: user.email,
          subject: 'Reset your Sovereign password',
          html: `<p>You requested a password reset. Click the link below to choose a new password.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>This link expires in 1 hour. If you did not request a password reset, you can ignore this email.</p>`,
          text: `You requested a password reset.\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
          metadata: { flow: 'password_reset' },
        });
      },
      // Minimum password length (better-auth default is 8, but being explicit
      // here so it doesn't silently change with a library upgrade).
      minPasswordLength: 8,
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
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
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

            // First user becomes the platform owner (RFC 0021).
            return { data: { ...user, role: isFirst ? 'platform:owner' : 'platform:user' } };
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
          },
        },
      },
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
