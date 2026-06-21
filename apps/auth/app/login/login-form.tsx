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
 * `brandName` is resolved from BRAND_NAME env at request time for the same reason.
 */
export function LoginForm({ runtimeUrl, brandName }: { runtimeUrl: string; brandName: string }) {
  const signedOut = useSearchParams().get('signedout') === '1';
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
      setError(result.error.message ?? 'Sign in failed.');
    } else if ((result?.data as Record<string, unknown>)?.twoFactorRedirect) {
      // twoFactorClient has already navigated to /login/2fa — do NOT redirect
      // to runtimeUrl here or it overrides the 2FA page navigation, sending
      // the user to the runtime without a session and looping back to /login.
    } else if (result?.data) {
      window.location.href = runtimeUrl;
    }
  }

  async function onPasskeySignIn() {
    setPasskeyLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient.signIn as any).passkey();
    setPasskeyLoading(false);
    if (result?.error) {
      setError(result.error.message ?? 'Passkey sign-in failed.');
    } else if (result?.data) {
      window.location.href = runtimeUrl;
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in to {brandName}</h1>
        {signedOut ? (
          <p className={styles.notice} role="status">
            You&rsquo;ve been signed out.
          </p>
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
          <label htmlFor="login-password" className={styles.field}>
            <span className={styles.label}>Password</span>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading}>
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
          No account?{' '}
          <Link className={styles.link} href="/register">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
