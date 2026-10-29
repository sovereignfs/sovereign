'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../../src/auth/client';
import { continuationUrl, isContinuation } from '../../../../src/auth/oauth-continuation';
import styles from '../../auth.module.css';

/** The second sign-in step: a code from the authenticator app, or one of the backup codes. */
export function TwoFactorForm({ returnTo }: { returnTo: string }) {
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  /** The sign-in this step belongs to cannot go on: only signing in again helps. */
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState(false);
  // An app's request, when it sent the person here: sign-in starts again with it, not without. Known only
  // in the browser, so it is read after the first render, never during it.
  const [request, setRequest] = useState('');
  useEffect(() => {
    if (isContinuation(window.location.search)) setRequest(window.location.search);
  }, []);
  const signInAgain =
    request === '' ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : `/sign-in${request}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const trimmed = code.trim();
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: trimmed })
      : await authClient.twoFactor.verifyTotp({ code: trimmed });
    if (result.error) {
      setPending(false);
      const problem = problemWith(result.error, useBackup);
      if (problem.over) setOver(true);
      else setError(problem.message);
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie. An app's sign-in goes
    // back to the app.
    window.location.assign(continuationUrl(result.data) ?? returnTo);
  }

  if (over) {
    return (
      <>
        <Alert variant="error">
          This sign-in can no longer be finished: it timed out, or there were too many wrong codes.
        </Alert>
        <p className={styles.footer}>
          <Link className={styles.link} href={signInAgain}>
            Sign in again
          </Link>
        </p>
      </>
    );
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <p className={styles.lead}>
        {useBackup
          ? 'Enter one of your backup codes. Each one works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label={useBackup ? 'Backup code' : 'Code'} required>
        {(field) => (
          <Input
            {...field}
            name="code"
            autoComplete="one-time-code"
            inputMode={useBackup ? 'text' : 'numeric'}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Checking…' : 'Continue'}
      </Button>
      <p className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setUseBackup(!useBackup);
            setCode('');
            setError(undefined);
          }}
        >
          {useBackup ? 'Use the authenticator app instead' : 'Use a backup code instead'}
        </button>
      </p>
      <p className={styles.footer}>
        <Link className={styles.link} href={request === '' ? '/sign-in' : signInAgain}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

/** What went wrong, in words a person can act on; `over` when the sign-in has to start again. */
function problemWith(
  error: { status: number; code?: string },
  backup: boolean,
): { message?: string; over?: true } {
  if (error.code === 'INVALID_TWO_FACTOR_COOKIE') return { over: true };
  if (error.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') return { over: true };
  if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
    return { message: 'Too many wrong codes. Wait a few minutes, then sign in again.' };
  }
  if (error.status === 429) return { message: 'Too many attempts. Wait a minute, then try again.' };
  if (error.status === 401) {
    return {
      message: backup
        ? 'That backup code is not right, or it was already used.'
        : 'That code is not right. Check the app and try again.',
    };
  }
  return { message: 'The code could not be checked. Try again.' };
}
