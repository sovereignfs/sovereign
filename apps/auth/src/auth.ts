import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { authGet, authRun, getAuthDatabase } from './db';
import { getEnv } from './env';
import { resolveInvitePluginGrants } from './invite-plugin-grants';
import { isMailerConfigured, sendAuthPlatformEmail } from './platform-email';
import { readInviteOnlySetting, resolveInviteOnly } from './settings';

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

            // Resolve an invite-scoped plugin entitlement (RFC 0065 Task
            // 2.23), if this registration consumed one. No-op for a plain
            // (non-invited) signup or an invite with no plugin scope.
            await resolveInvitePluginGrants({ id: user.id, email: user.email });
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
