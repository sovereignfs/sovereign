import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button, EmptyState } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { ResendVerificationButton } from './resend-verification-button';
import styles from './verify-email.module.css';

/**
 * Verification interstitial (RFC 0035 §5.9). Not a middleware-forced
 * redirect target in this leg (Phase 1 is additive infrastructure — see
 * `docs/workstreams/0017-auth-security-hardening.md` leg 1's "do not
 * proceed if" note; the actual `min_verification_level` capability gate is
 * Phase 2 / leg 2, task 1.9). Reachable today via a direct link — e.g. the
 * Account Security tab's verification nudge — for a signed-in user who is
 * still Level 0: either `AUTH_REQUIRE_EMAIL_VERIFICATION` is off (so
 * sign-in itself doesn't block them) or their account predates this leg.
 * A visitor with `AUTH_REQUIRE_EMAIL_VERIFICATION=true` who hasn't verified
 * can never reach here with a session at all — better-auth blocks sign-in
 * outright with `EMAIL_NOT_VERIFIED`, handled entirely by the auth server's
 * own login form (`apps/auth/app/login/login-form.tsx`), not this page.
 */
export default async function VerifyEmailPage() {
  const session = await sdk.auth.getSession();
  if (!session) redirect('/login');

  const hdrs = await headers();
  const referer = hdrs.get('referer') ?? '/';
  let returnPath = '/';
  try {
    const refererPath = new URL(referer).pathname;
    returnPath = refererPath === '/verify-email' ? '/' : refererPath;
  } catch {
    returnPath = '/';
  }

  if (session.user.verificationLevel >= 1) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="check"
          heading="Your email is verified"
          description="You have full access to features that require a verified email."
          action={
            <Link href={returnPath}>
              <Button>Continue</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <EmptyState
        icon="mail"
        heading="Verify your email"
        description={`We sent a verification link to ${session.user.email}. Click it to unlock features that require a verified account.`}
        action={<ResendVerificationButton email={session.user.email} />}
      />
    </div>
  );
}
