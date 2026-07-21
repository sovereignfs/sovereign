'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import { ViewportHeightSync } from './ViewportHeightSync';
import styles from '../auth-page.module.css';

export function LoginForm({
  instanceName,
  instanceInitial,
}: {
  instanceName: string;
  instanceInitial: string;
}) {
  const signedOut = useSearchParams().get('signedout') === '1';
  const accountDeleted = useSearchParams().get('accountDeleted') === '1';
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
      window.location.href = '/';
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
      window.location.href = '/';
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
