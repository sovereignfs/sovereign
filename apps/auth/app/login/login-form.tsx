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
export function LoginForm({ runtimeUrl }: { runtimeUrl: string }) {
  const signedOut = useSearchParams().get('signedout') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Sign in failed.');
      return;
    }
    window.location.href = runtimeUrl;
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in to Sovereign</h1>
        {signedOut ? (
          <p className={styles.notice} role="status">
            You&rsquo;ve been signed out.
          </p>
        ) : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <Input
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
