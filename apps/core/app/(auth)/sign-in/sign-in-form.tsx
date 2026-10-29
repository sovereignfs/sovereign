'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { continuationUrl, isContinuation } from '../../../src/auth/oauth-continuation';
import { DEACTIVATED, passkeyProblem } from '../messages';
import { AuthError, AuthNotice } from '../auth-notice';
import { AuthField } from '../auth-field';
import { ResendVerification } from '../resend-verification';
import styles from '../auth.module.css';

/** Something the person arrived to be told: they signed out, changed their password, or a link did not work. */
export type SignInNotice = 'password-changed' | 'link-invalid' | 'account-deleted' | 'signed-out';

export function SignInForm({
  returnTo,
  notice,
  instanceName,
}: {
  returnTo: string;
  notice?: SignInNotice;
  instanceName: string;
}) {
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
    // A full navigation, so the next page is rendered with the new session cookie. An app's sign-in goes
    // back to the app; anything else goes where the person was headed.
    window.location.assign(continuationUrl(result?.data) ?? returnTo);
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
      // An app's request goes along, so the second step can carry on with it.
      const search = window.location.search;
      window.location.assign(
        isContinuation(search)
          ? `/sign-in/two-factor${search}`
          : `/sign-in/two-factor?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(continuationUrl(result.data) ?? returnTo);
  }

  return (
    <>
      {notice === 'signed-out' ? <AuthNotice>You’ve been signed out.</AuthNotice> : null}
      {notice === 'password-changed' ? (
        <AuthNotice>Your password is changed. Sign in with the new one.</AuthNotice>
      ) : null}
      {notice === 'account-deleted' ? (
        <AuthNotice>Your account is deleted. Nothing of it is kept.</AuthNotice>
      ) : null}
      {notice === 'link-invalid' ? (
        <AuthNotice tone="warning">
          That link has expired or was already used. Sign in, and we can send you a new one.
        </AuthNotice>
      ) : null}
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Email">
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
        <AuthField
          label="Password"
          aside={
            <Link className={styles.aside} href="/forgot-password">
              Forgot password?
            </Link>
          }
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        {unverified ? (
          <>
            <AuthNotice tone="warning">
              Verify your email address before signing in: follow the link we sent when you made the
              account.
            </AuthNotice>
            <ResendVerification email={email} returnTo={returnTo} />
          </>
        ) : null}
        <Button type="submit" className={styles.submit} loading={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      {passkeysSupported ? (
        <>
          <div className={styles.divider} aria-hidden="true">
            or
          </div>
          <Button
            type="button"
            variant="secondary"
            className={styles.wide}
            loading={passkeyPending}
            onClick={() => void signInWithPasskey()}
          >
            {passkeyPending ? 'Waiting for your device…' : 'Sign in with a passkey'}
          </Button>
        </>
      ) : null}
      <p className={styles.footer}>
        New to {instanceName}?{' '}
        <Link className={styles.link} href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>
          Create account
        </Link>
      </p>
    </>
  );
}
