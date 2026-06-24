'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

/**
 * `runtimeUrl` is resolved server-side (see runtimePublicUrl) and passed in so
 * the post-registration redirect targets the deployment's real runtime origin
 * at request time — not a value frozen into the client bundle at build time.
 */
export function RegisterForm({
  runtimeUrl,
  instanceName = 'Sovereign',
  invitedEmail,
  invitedBy,
}: {
  runtimeUrl: string;
  instanceName?: string;
  invitedEmail?: string;
  invitedBy?: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.signUp.email({ name, email, password });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Registration failed.');
      return;
    }
    window.location.href = runtimeUrl;
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {invitedBy ? (
          <p className={styles.notice}>You&apos;ve been invited by {invitedBy}</p>
        ) : null}
        <h1 className={styles.title}>Create your account on {instanceName}</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="register-name" className={styles.field}>
            <span className={styles.label}>Name</span>
            <Input
              id="register-name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label htmlFor="register-email" className={styles.field}>
            <span className={styles.label}>Email</span>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              readOnly={!!invitedEmail}
              onChange={invitedEmail ? undefined : (e) => setEmail(e.target.value)}
            />
            {invitedEmail ? (
              <span className={styles.label} style={{ color: 'var(--sv-color-text-muted)' }}>
                This field is pre-filled from your invite
              </span>
            ) : null}
          </label>
          <label htmlFor="register-password" className={styles.field}>
            <span className={styles.label}>Password</span>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className={styles.footer}>
          Already have an account?{' '}
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
