'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { AuthField } from '../auth-field';
import { AuthError, AuthNotice } from '../auth-notice';
import { emailRequestProblem } from '../messages';
import styles from '../auth.module.css';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setPending(false);
    if (result.error) {
      setError(
        emailRequestProblem(result.error) ??
          'The request could not be sent. Check the address and try again.',
      );
      return;
    }
    // The same words whether or not the address has an account.
    setSentTo(email);
  }

  if (sentTo !== undefined) {
    return (
      <>
        <AuthNotice>
          If {sentTo} has an account, a link to reset the password is on its way. It works for an
          hour.
        </AuthNotice>
        <p className={styles.footer}>
          <Link className={styles.link} href="/sign-in">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Email address">
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={pending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" className={styles.submit} loading={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
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
