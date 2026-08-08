'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Icon, Input, LegalLinks, useIsOffline } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import { completeSignIn } from '@/src/complete-sign-in';
import { ViewportHeightSync } from './ViewportHeightSync';
import styles from '../auth-page.module.css';

export function LoginForm({
  instanceName,
  instanceInitial,
}: {
  instanceName: string;
  instanceInitial: string;
}) {
  // A cached /login can render with no network at all (research 0012, epic
  // task 2.32) — the SW's session-required fallback sends here when there is
  // no valid offline assertion. A submitted form would just fail, so the form
  // itself is swapped for an explanatory notice rather than left to fail per
  // field. The session check that decides whether /login should render at all
  // stays server-side in page.tsx; this only changes what's shown once it has.
  const isOffline = useIsOffline();
  const searchParams = useSearchParams();
  const signedOut = searchParams.get('signedout') === '1';
  const accountDeleted = searchParams.get('accountDeleted') === '1';
  const returnUrl = searchParams.get('returnUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (result?.error) {
      setError('The email or password you entered is incorrect. Please try again.');
    } else if ((result?.data as Record<string, unknown>)?.twoFactorRedirect) {
      // twoFactorClient navigates to /login/2fa automatically — do not override.
    } else if (result?.data) {
      await completeSignIn(returnUrl);
    }
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
      await completeSignIn(returnUrl);
    }
  }

  return (
    <main className={styles.page}>
      <ViewportHeightSync />
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Sign in to {instanceName}</h1>
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
        {isOffline ? (
          <div className={styles.offlineNotice} role="status">
            <Icon name="alert-triangle" size="sm" aria-hidden />
            <p className={styles.offlineNoticeText}>
              You&rsquo;re offline. Connect to the internet to sign in.
            </p>
          </div>
        ) : (
          <>
            <form className={styles.form} onSubmit={onSubmit}>
              <label htmlFor="login-email" className={styles.field}>
                <span className={styles.label}>Email</span>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={loading}
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
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? <p className={styles.error}>{error}</p> : null}
              <Button type="submit" disabled={loading} className={styles.submitLg}>
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
          </>
        )}
        <p className={styles.footer}>
          New to {instanceName}?{' '}
          <Link className={styles.link} href="/register">
            Create account
          </Link>
        </p>
      </div>
      <LegalLinks />
    </main>
  );
}
