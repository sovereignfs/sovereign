'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
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

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {sentTo !== undefined ? (
        <Alert variant="success">
          If {sentTo} has an account, a link to reset the password is on its way. It works for an
          hour.
        </Alert>
      ) : null}
      <FormField label="Email" required>
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Sending…' : 'Send the link'}
      </Button>
      <p className={styles.footer}>
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
