'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Icon, Input, useIsOffline } from '@sovereignfs/ui';
import { authClient, typedAuthClient } from '@/src/auth-client';
import { completeSignIn } from '@/src/complete-sign-in';
import { ViewportHeightSync } from './ViewportHeightSync';
import styles from '../auth-page.module.css';

export function LoginForm({
  instanceName,
  instanceInitial,
  instanceLogoUrl,
  returnUrl,
}: {
  instanceName: string;
  instanceInitial: string;
  instanceLogoUrl: string | null;
  /**
   * Read server-side by `page.tsx` and passed down explicitly — **not**
   * read via `useSearchParams()` here, deliberately. This page can be
   * reached by `middleware.ts` **rewriting** an unauthenticated GET to it
   * (bare `/`, or an `installable` plugin's bare routePrefix, RFC 0081)
   * rather than redirecting, and a rewrite never changes the browser's
   * visible address bar — a client hook reading `window.location` would see
   * no query string at all, silently losing `returnUrl` and sending every
   * post-login navigation to `/` regardless of where the user actually
   * started. Confirmed live, not assumed. See `page.tsx`'s comment for the
   * full account.
   */
  returnUrl: string | null;
}) {
  // A submitted form would just fail while offline, so the form itself is
  // swapped for an explanatory notice (via the generic connectivity hook)
  // rather than left to fail per field. The session check that decides
  // whether /login should render at all stays server-side in page.tsx; this
  // only changes what's shown once it has.
  const isOffline = useIsOffline();
  // Unlike `returnUrl` above, these two are safe to read via the client hook:
  // both only ever arrive via a genuine client-side/redirect navigation to
  // this exact URL (sign-out, account deletion) — never a middleware
  // rewrite — so the browser's visible address bar always carries them.
  const searchParams = useSearchParams();
  const signedOut = searchParams.get('signedout') === '1';
  const accountDeleted = searchParams.get('accountDeleted') === '1';
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
    const result = await typedAuthClient.signIn.passkey();
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
          {instanceLogoUrl ? (
            <img src={instanceLogoUrl} alt={instanceName} className={styles.logoImg} />
          ) : (
            instanceInitial
          )}
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
    </main>
  );
}
