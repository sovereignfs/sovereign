'use client';

import { type FormEvent, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';
import styles from '../../auth.module.css';

type Mode = 'totp' | 'backup';

export function ChallengeForm({ runtimeUrl }: { runtimeUrl: string }) {
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const twoFactor = (authClient as any).twoFactor;
    const result =
      mode === 'totp'
        ? await twoFactor.verifyTotp({ code })
        : await twoFactor.verifyBackupCode({ code });

    setLoading(false);
    if (result?.error) {
      setError(result.error.message ?? 'Verification failed. Check your code and try again.');
      return;
    }
    window.location.href = runtimeUrl;
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
      window.location.href = runtimeUrl;
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Two-factor verification</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>
              {mode === 'totp' ? 'Authenticator code' : 'Backup code'}
            </span>
            <Input
              type="text"
              autoComplete={mode === 'totp' ? 'one-time-code' : 'off'}
              inputMode={mode === 'totp' ? 'numeric' : 'text'}
              placeholder={mode === 'totp' ? '000000' : 'xxxx-xxxx'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className={styles.divider} aria-hidden="true">
          or
        </div>

        <Button variant="secondary" onClick={onPasskeySignIn} disabled={passkeyLoading}>
          {passkeyLoading ? 'Waiting for passkey…' : 'Use a passkey instead'}
        </Button>

        <p className={styles.footer}>
          {mode === 'totp' ? (
            <>
              Lost access to your authenticator?{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setMode('backup');
                  setCode('');
                  setError(null);
                }}
              >
                Use a backup code
              </button>
            </>
          ) : (
            <>
              Have your authenticator app?{' '}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setMode('totp');
                  setCode('');
                  setError(null);
                }}
              >
                Enter a TOTP code
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
