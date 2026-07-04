'use client';

import { type FormEvent, useRef, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import { ViewportHeightSync } from '../ViewportHeightSync';
import styles from '../../auth-page.module.css';

type Mode = 'totp' | 'backup';

const OTP_LENGTH = 6;

export function ChallengeForm({ instanceInitial = 'S' }: { instanceInitial?: string }) {
  const [mode, setMode] = useState<Mode>('totp');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);

  const totpCode = digits.join('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const twoFactor = (authClient as any).twoFactor;
    const result =
      mode === 'totp'
        ? await twoFactor.verifyTotp({ code: totpCode })
        : await twoFactor.verifyBackupCode({ code: backupCode });

    setLoading(false);
    if (result?.error) {
      setError('Invalid code. Please try again or use a backup code.');
      return;
    }
    window.location.href = '/';
  }

  async function onPasskeySignIn() {
    setPasskeyLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient.signIn as any).passkey();
    setPasskeyLoading(false);
    if (result?.error) {
      setError(result.error.message ?? 'Passkey verification failed.');
      return;
    }
    if (result?.data) {
      window.location.href = '/';
    }
  }

  function onDigitInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = digits.slice();
    next[index] = digit;
    setDigits(next);
    if (digit && cellRefs.current[index + 1]) {
      cellRefs.current[index + 1]?.focus();
    }
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && cellRefs.current[index - 1]) {
      cellRefs.current[index - 1]?.focus();
    }
  }

  function onDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = [...pasted.split(''), ...Array(OTP_LENGTH).fill('')].slice(
      0,
      OTP_LENGTH,
    ) as string[];
    setDigits(next);
    // Focus the last filled cell so the user can correct from there.
    const lastFilled = Math.min(pasted.length - 1, OTP_LENGTH - 1);
    cellRefs.current[lastFilled]?.focus();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setDigits(Array(OTP_LENGTH).fill(''));
    setBackupCode('');
    setError(null);
  }

  return (
    <main className={styles.page}>
      <ViewportHeightSync />
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Two-factor verification</h1>
        <p className={styles.subtitle}>
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your single-use backup codes.'}
        </p>
        <form className={`${styles.form} ${styles.formSm}`} onSubmit={onSubmit}>
          {mode === 'totp' ? (
            <div className={styles.field}>
              <p id="otp-label" className={styles.label}>
                Authenticator code
              </p>
              <div className={styles.otpRow} role="group" aria-labelledby="otp-label">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      cellRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`}
                    className={[styles.otpCell, error ? styles.otpError : ''].join(' ')}
                    onInput={(e) => onDigitInput(i, (e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => onDigitKeyDown(i, e)}
                    onPaste={onDigitPaste}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <label htmlFor="backup-code" className={styles.label}>
                Backup code
              </label>
              <Input
                id="backup-code"
                type="text"
                autoComplete="off"
                placeholder="xxxx-xxxx-xxxx"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                required
                className={styles.backupInput}
              />
              <p className={styles.fieldHint}>Each backup code can be used once.</p>
            </div>
          )}
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className={styles.divider} aria-hidden="true">
          or
        </div>

        <Button
          variant="secondary"
          className={styles.passkeyBtn}
          onClick={onPasskeySignIn}
          disabled={passkeyLoading}
        >
          {passkeyLoading ? 'Waiting for passkey…' : 'Use a passkey instead'}
        </Button>

        <p className={styles.footer}>
          {mode === 'totp' ? (
            <>
              Lost access to your authenticator?
              <br />
              <button type="button" className={styles.link} onClick={() => switchMode('backup')}>
                Use a backup code
              </button>
            </>
          ) : (
            <>
              Have your authenticator app?{' '}
              <button type="button" className={styles.link} onClick={() => switchMode('totp')}>
                Use authenticator app instead
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
