import { useState, type FormEvent } from 'react';
import { Input } from '../Input/Input';
import { AuthCodeInput } from './AuthCodeInput';
import { AuthField } from './AuthField';
import { AuthButton, AuthDivider, AuthFooter, AuthForm, AuthLinkButton } from './AuthForm';
import { AuthError, AuthNotice } from './AuthNotice';
import { plainLink, type AuthLinkRenderer } from './AuthLinkRenderer';
import styles from './Auth.module.css';

export interface TwoFactorFormProps {
  error?: string | undefined;
  pending?: boolean;
  /** The sign-in this step belongs to cannot go on (it timed out, or too many wrong codes): only signing in again helps. */
  over?: boolean;
  /** Signing in with a passkey instead, when the browser offers one. Leave out to offer none. */
  passkey?: { pending: boolean; onClick: () => void } | undefined;
  /** The code, once the person submits it, and whether it is a backup code. The form never sends anything itself. */
  onSubmit: (values: { code: string; backup: boolean }) => void;
  /** The person switched between the authenticator's code and a backup code: what was said about the last one no longer holds. */
  onModeChange?: () => void;
  signInAgainHref: string;
  renderLink?: AuthLinkRenderer;
}

/**
 * The second sign-in step (auth.md §4, rule 4), for core and every app: the six digits from the authenticator app, or one of the
 * backup codes, or a passkey instead. There is no "trust this device".
 */
export function TwoFactorForm({
  error,
  pending = false,
  over = false,
  passkey,
  onSubmit,
  onModeChange,
  signInAgainHref,
  renderLink = plainLink,
}: TwoFactorFormProps) {
  const [useBackup, setUseBackup] = useState(false);
  const [digits, setDigits] = useState('');
  const [backupCode, setBackupCode] = useState('');

  if (over) {
    return (
      <>
        <AuthNotice tone="warning">
          This sign-in can no longer be finished: it timed out, or there were too many wrong codes.
        </AuthNotice>
        <AuthFooter>
          {renderLink({ href: signInAgainHref, className: styles.link, children: 'Sign in again' })}
        </AuthFooter>
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ code: useBackup ? backupCode.trim() : digits, backup: useBackup });
  }

  function switchTo(backup: boolean) {
    setUseBackup(backup);
    setDigits('');
    setBackupCode('');
    onModeChange?.();
  }

  return (
    <>
      <p className={styles.lead}>
        {useBackup
          ? 'Enter one of your single-use backup codes.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      <AuthForm onSubmit={submit}>
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
          <AuthCodeInput
            label="Authenticator code"
            value={digits}
            onChange={setDigits}
            disabled={pending}
            invalid={error !== undefined}
          />
        )}
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={pending}>
          {pending ? 'Checking…' : 'Verify'}
        </AuthButton>
      </AuthForm>
      {passkey ? (
        <>
          <AuthDivider />
          <AuthButton variant="secondary" loading={passkey.pending} onClick={passkey.onClick}>
            {passkey.pending ? 'Waiting for your device…' : 'Use a passkey instead'}
          </AuthButton>
        </>
      ) : null}
      <AuthFooter>
        {useBackup ? (
          <>
            Have your authenticator app?{' '}
            <AuthLinkButton onClick={() => switchTo(false)}>
              Use the authenticator app instead
            </AuthLinkButton>
          </>
        ) : (
          <>
            Lost access to your authenticator?
            <br />
            <AuthLinkButton onClick={() => switchTo(true)}>Use a backup code</AuthLinkButton>
          </>
        )}
      </AuthFooter>
      <AuthFooter>
        {renderLink({ href: signInAgainHref, className: styles.link, children: 'Back to sign in' })}
      </AuthFooter>
    </>
  );
}
