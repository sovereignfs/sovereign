'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import styles from '../auth.module.css';

export function SignInForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      // The same sentence whether the address has an account or not.
      setError(
        result.error.status === 429
          ? 'Too many attempts. Wait a minute, then try again.'
          : 'The email or password is incorrect.',
      );
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
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
      <FormField label="Password" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className={styles.footer}>
        New here?{' '}
        <Link className={styles.link} href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
