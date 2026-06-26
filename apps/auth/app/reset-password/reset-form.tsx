'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

export function ResetForm({ instanceInitial = 'S' }: { instanceInitial?: string }) {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Reset token is missing. Please use the link from your email.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);
    if (result?.error) {
      setError(
        result.error.message === 'INVALID_TOKEN'
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : (result.error.message ?? 'Something went wrong. Please try again.'),
      );
    } else {
      setDone(true);
    }
  }

  if (!token) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Invalid link</h1>
          <p className={styles.error} style={{ marginTop: 20 }}>
            No reset token found. Please use the link from your email.
          </p>
          <p className={styles.footer}>
            <Link className={styles.link} href="/forgot-password">
              Request a new link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Password updated</h1>
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>
              Your password has been updated. You can now sign in with your new password.
            </p>
          </div>
          <p className={styles.footer}>
            <Link className={styles.link} href="/login">
              Sign in
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
        <h1 className={styles.title}>Choose a new password</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="reset-password" className={styles.label}>
              New password
            </label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className={styles.fieldHint}>At least 8 characters.</p>
          </div>
          <label htmlFor="reset-confirm" className={styles.field}>
            <span className={styles.label}>Confirm new password</span>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading} className={styles.submitLg}>
            {loading ? 'Saving…' : 'Set new password'}
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
