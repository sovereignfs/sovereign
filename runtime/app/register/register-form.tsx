'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import { ViewportHeightSync } from '../login/ViewportHeightSync';
import registerStyles from './register.module.css';
import styles from '../auth-page.module.css';

export function RegisterForm({
  instanceName = 'Sovereign',
  instanceInitial = 'S',
  invitedEmail,
  invitedBy,
}: {
  instanceName?: string;
  instanceInitial?: string;
  invitedEmail?: string;
  invitedBy?: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isInvite = !!invitedEmail;

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
    window.location.href = '/';
  }

  return (
    <main className={styles.page}>
      <ViewportHeightSync />
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Create your account</h1>

        {isInvite ? (
          <div className={registerStyles.inviteBanner}>
            <p className={registerStyles.inviteBannerTitle}>Invited to join {instanceName}</p>
            {invitedBy ? (
              <p className={registerStyles.inviteBannerMeta}>
                By {invitedBy}
                {invitedEmail ? <> · {invitedEmail}</> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="register-name" className={styles.field}>
            <span className={styles.label}>Name</span>
            <Input
              id="register-name"
              autoComplete="name"
              required
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className={styles.field}>
            <div className={registerStyles.fieldLabelRow}>
              <label htmlFor="register-email" className={styles.label}>
                Email
              </label>
              {isInvite ? <span className={registerStyles.fromInviteTag}>from invite</span> : null}
            </div>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              value={email}
              readOnly={isInvite}
              onChange={isInvite ? undefined : (e) => setEmail(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="register-password" className={styles.label}>
              Password
            </label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className={styles.fieldHint}>At least 8 characters.</p>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading} className={styles.submitLg}>
            {loading
              ? isInvite
                ? 'Accepting…'
                : 'Creating account…'
              : isInvite
                ? 'Accept invitation'
                : 'Create account'}
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
