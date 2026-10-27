'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import styles from '../auth.module.css';

export function SignUpForm({ returnTo, passwordHint }: { returnTo: string; passwordHint: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) {
      setPending(false);
      setError(messageFor(result.error));
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Name" required>
        {(field) => (
          <Input
            {...field}
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
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
      <FormField label="Password" hint={passwordHint} required>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link className={styles.link} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** What went wrong, in words a person can act on. The server's password message is already that. */
function messageFor(error: { status: number; code?: string; message?: string }): string {
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && error.message) return error.message;
  if (error.code === 'USER_ALREADY_EXISTS' || error.code?.startsWith('USER_ALREADY_EXISTS'))
    return 'An account with this email address already exists. Try signing in instead.';
  if (error.code === 'INVALID_EMAIL') return 'Enter a valid email address.';
  return 'The account could not be created. Check what you entered and try again.';
}
