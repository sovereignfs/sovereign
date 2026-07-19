'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

export function RegisterForm({
  runtimeUrl,
  instanceName = 'Sovereign',
  instanceInitial = 'S',
  invitedEmail,
  invitedBy,
}: {
  runtimeUrl: string;
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
  // Set once sign-up succeeds without granting a session — happens when
  // AUTH_REQUIRE_EMAIL_VERIFICATION is enabled (the default): the account is
  // created but blocked from signing in until the emailed link is clicked.
  const [checkEmail, setCheckEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

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
    if (!result.data?.token) {
      setCheckEmail(true);
      return;
    }
    window.location.href = runtimeUrl;
  }

  async function onResend() {
    setResending(true);
    await authClient.sendVerificationEmail({ email });
    setResending(false);
    setResent(true);
  }

  if (checkEmail) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Check your email</h1>
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>
              We sent a verification link to {email}. Click it to finish setting up your account.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className={styles.submitLg}
            onClick={() => void onResend()}
            disabled={resending}
          >
            {resending ? 'Sending…' : resent ? 'Sent — resend again' : 'Resend email'}
          </Button>
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
        <h1 className={styles.title}>Create your account</h1>

        {isInvite && (
          <div className={styles.inviteBanner}>
            <p className={styles.inviteBannerTitle}>Invited to join {instanceName}</p>
            {invitedBy && (
              <p className={styles.inviteBannerMeta}>
                By {invitedBy}
                {invitedEmail && <> · {invitedEmail}</>}
              </p>
            )}
          </div>
        )}

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
          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor="register-email" className={styles.label}>
                Email
              </label>
              {isInvite && <span className={styles.fromInviteTag}>from invite</span>}
            </div>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              required
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
