'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { AuthField } from '../auth-field';
import { AuthError, AuthNotice } from '../auth-notice';
import { emailRequestProblem } from '../messages';
import styles from '../auth.module.css';

export function ResetPasswordForm({
  token,
  passwordHint,
}: {
  token: string;
  passwordHint: string;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setPending(false);
      if (result.error.code === 'INVALID_TOKEN') setExpired(true);
      else setError(messageFor(result.error));
      return;
    }
    // Every session was ended, so the next step is signing in with the new password.
    window.location.assign('/sign-in?reset=1');
  }

  if (expired) {
    return (
      <>
        <AuthNotice tone="warning">
          This link has expired or was already used. A link works once, for an hour.
        </AuthNotice>
        <p className={styles.footer}>
          <Link className={styles.link} href="/forgot-password">
            Request a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="New password" hint={passwordHint}>
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Confirm new password">
          {(control) => (
            <Input
              {...control}
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              disabled={pending}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" className={styles.submit} loading={pending}>
          {pending ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
      <p className={styles.footer}>
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

/** What went wrong, in words a person can act on. The server's password message is already that. */
function messageFor(error: { status: number; code?: string; message?: string }): string {
  const common = emailRequestProblem(error);
  if (common) return common;
  if (error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && error.message) return error.message;
  return 'The password could not be changed. Try again.';
}
