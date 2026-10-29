'use client';

import Link from 'next/link';
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '../../../../src/auth/client';
import { continuationUrl, isContinuation } from '../../../../src/auth/oauth-continuation';
import { AuthError, AuthNotice } from '../../auth-notice';
import { AuthField } from '../../auth-field';
import { passkeyProblem } from '../../messages';
import styles from '../../auth.module.css';

const DIGITS = 6;
const EMPTY = Array<string>(DIGITS).fill('');

/** The second sign-in step: a code from the authenticator app, or one of the backup codes. */
export function TwoFactorForm({ returnTo }: { returnTo: string }) {
  const [useBackup, setUseBackup] = useState(false);
  const [digits, setDigits] = useState<string[]>(EMPTY);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  /** The sign-in this step belongs to cannot go on: only signing in again helps. */
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState(false);
  // An app's request, when it sent the person here: sign-in starts again with it, not without. Known only
  // in the browser, so it is read after the first render, never during it.
  const [request, setRequest] = useState('');
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (isContinuation(window.location.search)) setRequest(window.location.search);
    setPasskeysSupported(typeof window.PublicKeyCredential === 'function');
  }, []);
  const signInAgain =
    request === '' ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : `/sign-in${request}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const code = useBackup ? backupCode.trim() : digits.join('');
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
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

  async function signInWithPasskey() {
    setPasskeyPending(true);
    setError(undefined);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setPasskeyPending(false);
      setError(passkeyProblem(result.error));
      return;
    }
    window.location.assign(continuationUrl(result?.data) ?? returnTo);
  }

  function typeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((before) => before.map((was, at) => (at === index ? digit : was)));
    if (digit) cells.current[index + 1]?.focus();
  }

  function backspace(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index]) cells.current[index - 1]?.focus();
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGITS);
    if (!pasted) return;
    event.preventDefault();
    setDigits([...pasted.split(''), ...EMPTY].slice(0, DIGITS));
    cells.current[Math.min(pasted.length, DIGITS - 1)]?.focus();
  }

  function switchTo(backup: boolean) {
    setUseBackup(backup);
    setDigits(EMPTY);
    setBackupCode('');
    setError(undefined);
  }

  if (over) {
    return (
      <>
        <AuthNotice tone="warning">
          This sign-in can no longer be finished: it timed out, or there were too many wrong codes.
        </AuthNotice>
        <p className={styles.footer}>
          <Link className={styles.link} href={signInAgain}>
            Sign in again
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <p className={styles.lead}>
        {useBackup
          ? 'Enter one of your single-use backup codes.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        {useBackup ? (
          <AuthField label="Backup code" hint="Each backup code can be used once.">
            {(control) => (
              <Input
                {...control}
                name="code"
                autoComplete="off"
                placeholder="xxxx-xxxx-xxxx"
                required
                disabled={pending}
                className={styles.backupInput}
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
              />
            )}
          </AuthField>
        ) : (
          <div className={styles.field}>
            <p id="code-label" className={styles.label}>
              Authenticator code
            </p>
            <div className={styles.codeRow} role="group" aria-labelledby="code-label">
              {digits.map((digit, at) => (
                <input
                  // The boxes never change places, so their position is their identity.
                  key={at}
                  ref={(element) => {
                    cells.current[at] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoComplete={at === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Digit ${at + 1}`}
                  disabled={pending}
                  className={error ? `${styles.codeCell} ${styles.codeCellError}` : styles.codeCell}
                  onChange={(event) => typeDigit(at, event.target.value)}
                  onKeyDown={(event) => backspace(at, event)}
                  onPaste={paste}
                />
              ))}
            </div>
          </div>
        )}
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" className={styles.submit} loading={pending}>
          {pending ? 'Checking…' : 'Verify'}
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
            {passkeyPending ? 'Waiting for your device…' : 'Use a passkey instead'}
          </Button>
        </>
      ) : null}
      <p className={styles.footer}>
        {useBackup ? (
          <>
            Have your authenticator app?{' '}
            <button type="button" className={styles.linkButton} onClick={() => switchTo(false)}>
              Use the authenticator app instead
            </button>
          </>
        ) : (
          <>
            Lost access to your authenticator?
            <br />
            <button type="button" className={styles.linkButton} onClick={() => switchTo(true)}>
              Use a backup code
            </button>
          </>
        )}
      </p>
      <p className={styles.footer}>
        <Link className={styles.link} href={signInAgain}>
          Back to sign in
        </Link>
      </p>
    </>
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
