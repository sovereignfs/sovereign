'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { DEACTIVATED, passkeyProblem } from '../messages';
import { ResendVerification } from '../resend-verification';
import styles from '../auth.module.css';

/** Something the person arrived to be told: they changed their password, or a link did not work. */
export type SignInNotice = 'password-changed' | 'link-invalid';

export function SignInForm({ returnTo, notice }: { returnTo: string; notice?: SignInNotice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [unverified, setUnverified] = useState(false);
  // Known only in the browser, so it is read after the first render, never during it.
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => setPasskeysSupported(typeof window.PublicKeyCredential === 'function'), []);

  async function signInWithPasskey() {
    setPasskeyPending(true);
    setError(undefined);
    setUnverified(false);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setPasskeyPending(false);
      setError(passkeyProblem(result.error));
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setUnverified(false);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      // Said only to someone who gave the right password, so it tells nobody else anything.
      if (result.error.code === 'ACCOUNT_DEACTIVATED') {
        setError(DEACTIVATED);
        return;
      }
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true);
        return;
      }
      // The same sentence whether the address has an account or not.
      setError(
        result.error.status === 429
          ? 'Too many attempts. Wait a minute, then try again.'
          : 'The email or password is incorrect.',
      );
      return;
    }
    // The password was right but a second step is asked for: no session exists yet.
    if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
      window.location.assign(`/sign-in/two-factor?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {notice === 'password-changed' ? (
        <Alert variant="success">Your password is changed. Sign in with the new one.</Alert>
      ) : null}
      {notice === 'link-invalid' ? (
        <Alert variant="warning">
          That link has expired or was already used. Sign in, and we can send you a new one.
        </Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {unverified ? (
        <Alert variant="warning">
          Verify your email address before signing in: follow the link we sent when you made the
          account.
        </Alert>
      ) : null}
      {unverified ? <ResendVerification email={email} returnTo={returnTo} /> : null}
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
      <p className={styles.footer}>
        <Link className={styles.link} href="/forgot-password">
          Forgot your password?
        </Link>
      </p>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      {passkeysSupported ? (
        <Button
          type="button"
          variant="secondary"
          className={styles.submit}
          loading={passkeyPending}
          onClick={() => void signInWithPasskey()}
        >
          {passkeyPending ? 'Waiting for your device…' : 'Sign in with a passkey'}
        </Button>
      ) : null}
      <p className={styles.footer}>
        New here?{' '}
        <Link className={styles.link} href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
