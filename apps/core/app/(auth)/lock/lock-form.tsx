'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import type { WebKey } from '@sovereignfs/crypto/web';
import { authClient } from '../../../src/auth/client';
import { deriveForSignIn } from '../../../src/auth/derive';
import { PAGE_NOT_READY } from '../../../src/auth/password-policy';
import { afterPasskeyAccepted, afterPasswordAccepted, forgetKeys } from '../../../src/keys/session';
import { askForPasskey } from '../../../src/lock/ceremony';
import { AuthError } from '../auth-notice';
import { AuthField } from '../auth-field';
import styles from '../auth.module.css';
import { unlockChallenge, unlockWithPasskey, unlockWithPassword } from './actions';

/**
 * Unlocking (RFC 0006 B4): a passkey after a tap, never a prompt that appears by itself; the password, always; and signing out. A full
 * navigation follows each, so the next page is rendered for the unlocked session.
 */
export function LockForm({ returnTo, email }: { returnTo: string; email: string }) {
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<'passkey' | 'password' | 'sign-out' | undefined>();

  // Known only in the browser, so it is read after the first render.
  useEffect(() => setPasskeysSupported(typeof window.PublicKeyCredential === 'function'), []);

  async function unlockWithPasskeyInstead() {
    setPending('passkey');
    setError(undefined);
    const passkeyProblem = 'Your passkey did not unlock it. Try again, or use your password.';
    try {
      const request = await unlockChallenge();
      if (!request) {
        setPending(undefined);
        setError('This account has no passkey. Use your password.');
        return;
      }
      const asked = await askForPasskey(request);
      const result = asked ? await unlockWithPasskey(asked.answer) : undefined;
      if (!asked || !result?.ok) {
        setPending(undefined);
        setError(passkeyProblem);
        return;
      }
      // The session's secret is given again now it is unlocked: a passkey that answered PRF reopens the keys (core-app §5.5).
      if (asked.output) await afterPasskeyAccepted(asked.credentialId, asked.output);
    } catch {
      setPending(undefined);
      setError(passkeyProblem);
      return;
    }
    window.location.assign(returnTo);
  }

  async function unlockWithPasswordInstead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the box, first: a password manager can fill it without telling the page, and a box turned off holds nothing to read.
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setPending('password');
    setError(undefined);
    let value: string;
    let secret: WebKey;
    try {
      ({ signIn: value, secret } = await deriveForSignIn(password, email));
    } catch {
      setPending(undefined);
      setError(PAGE_NOT_READY);
      return;
    }
    const result = await unlockWithPassword(value);
    if (!result.ok) {
      setPending(undefined);
      setError(
        result.reason === 'limited'
          ? 'Too many wrong passwords. Wait ten minutes, then try again.'
          : 'That password is not right.',
      );
      return;
    }
    // The session's secret is given again now it is unlocked: the keys are opened with the password's (core-app §5.3).
    await afterPasswordAccepted(secret);
    window.location.assign(returnTo);
  }

  async function signOut() {
    setPending('sign-out');
    setError(undefined);
    await forgetKeys();
    const ended = await authClient.signOut().then(
      (result) => !result.error,
      () => false,
    );
    if (!ended) {
      setPending(undefined);
      setError('Signing out did not go through. Try again.');
      return;
    }
    window.location.assign('/sign-in?signedout=1');
  }

  return (
    <div className={styles.form}>
      {passkeysSupported ? (
        <Button
          className={styles.submit}
          loading={pending === 'passkey'}
          disabled={pending !== undefined}
          onClick={() => void unlockWithPasskeyInstead()}
        >
          {pending === 'passkey' ? 'Waiting for your device…' : 'Unlock'}
        </Button>
      ) : null}
      <form className={styles.form} onSubmit={(event) => void unlockWithPasswordInstead(event)}>
        <AuthField label="Password">
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending !== undefined}
            />
          )}
        </AuthField>
        <Button
          type="submit"
          variant={passkeysSupported ? 'secondary' : 'primary'}
          className={styles.submit}
          loading={pending === 'password'}
          disabled={pending !== undefined}
        >
          {pending === 'password' ? 'Unlocking…' : 'Use your password'}
        </Button>
      </form>
      {error ? <AuthError>{error}</AuthError> : null}
      <Button
        variant="ghost"
        className={styles.submit}
        loading={pending === 'sign-out'}
        disabled={pending !== undefined}
        onClick={() => void signOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
