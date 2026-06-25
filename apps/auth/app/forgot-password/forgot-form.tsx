'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

export function ForgotForm({ instanceInitial = 'S' }: { instanceInitial?: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setLoading(false);
    if (result?.error && result.error.status !== 200) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Check your email</h1>
          <div className={styles.notice} role="status">
            <div className={styles.noticeDot} aria-hidden="true" />
            <p className={styles.noticeText}>
              If that email address is registered, you&rsquo;ll receive a reset link shortly.
            </p>
          </div>
          <p className={styles.footer}>
            <Link className={styles.link} href="/login">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.subtitle}>
          Enter your account email and we&rsquo;ll send a link to reset your password.
        </p>
        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="forgot-email" className={styles.field}>
            <span className={styles.label}>Email address</span>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading} className={styles.submitLg}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
        <p className={styles.footer}>
          <Link className={styles.link} href="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
