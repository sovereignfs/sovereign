'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

/**
 * `runtimeUrl` is resolved server-side (see runtimePublicUrl) and passed in so
 * the post-login redirect targets the deployment's real runtime origin at
 * request time — not a value frozen into the client bundle at build time.
 */
export function LoginForm({
  runtimeUrl,
  instanceInitial,
}: {
  runtimeUrl: string;
  instanceInitial: string;
}) {
  const signedOut = useSearchParams().get('signedout') === '1';
  const accountDeleted = useSearchParams().get('accountDeleted') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(false);
    const result = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (result?.error?.code === 'EMAIL_NOT_VERIFIED') {
      setNeedsVerification(true);
    } else if (result?.error) {
      setError('The email or password you entered is incorrect. Please try again.');
    } else if ((result?.data as Record<string, unknown>)?.twoFactorRedirect) {
      // twoFactorClient has already navigated to /login/2fa — do NOT redirect
      // to runtimeUrl here or it overrides the 2FA page navigation, sending
      // the user to the runtime without a session and looping back to /login.
    } else if (result?.data) {
      window.location.href = runtimeUrl;
    }
  }

  async function onResend() {
    setResending(true);
    await authClient.sendVerificationEmail({ email });
    setResending(false);
    setResent(true);
  }

  async function onPasskeySignIn() {
    setPasskeyLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient.signIn as any).passkey();
    setPasskeyLoading(false);
    if (result?.error) {
      const msg = result.error.message ?? '';
      const isCancelled =
        msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort');
      setError(isCancelled ? 'Passkey sign-in was cancelled.' : msg || 'Passkey sign-in failed.');
    } else if (result?.data) {
      window.location.href = runtimeUrl;
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Sign in to Sovereign</h1>
        {signedOut ? (
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>You&rsquo;ve been signed out.</p>
          </div>
        ) : null}
        {accountDeleted ? (
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>Your account has been deleted.</p>
          </div>
        ) : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="login-email" className={styles.field}>
            <span className={styles.label}>Email</span>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className={styles.field}>
            <div className={styles.passwordHeader}>
              <label htmlFor="login-password" className={styles.label}>
                Password
              </label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          {needsVerification ? (
            <div className={styles.notice} role="status">
              <p className={styles.noticeText}>
                Please verify your email before signing in.{' '}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void onResend()}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : resent ? 'Sent — resend again' : 'Resend email'}
                </button>
              </p>
            </div>
          ) : null}
          <Button
            type="submit"
            disabled={loading}
            className={needsVerification || error ? styles.submitAfterError : styles.submitLg}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className={styles.divider} aria-hidden="true">
          or
        </div>
        <Button
          variant="secondary"
          className={styles.passkeyBtn}
          onClick={onPasskeySignIn}
          disabled={passkeyLoading}
        >
          {passkeyLoading ? 'Waiting for passkey…' : 'Sign in with a passkey'}
        </Button>
        <p className={styles.footer}>
          New to Sovereign?{' '}
          <Link className={styles.link} href="/register">
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}
