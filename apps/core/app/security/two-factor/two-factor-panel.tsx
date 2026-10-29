'use client';

import { type FormEvent, useState } from 'react';
import { Alert, Button, FormField, Input, QrCode } from '@sovereignfs/ui';
import { encode } from 'uqr';
import { authClient } from '../../../src/auth/client';
import styles from '../security.module.css';

type Action = 'enable' | 'regenerate' | 'disable';

type Stage =
  | { kind: 'idle' }
  | { kind: 'password'; action: Action }
  /** Enrolment started: the key is shown, and nothing is on until a code from it is entered. */
  | { kind: 'confirm'; uri: string; codes: string[] }
  | { kind: 'codes'; codes: string[]; heading: string };

const reload = () => window.location.reload();

/**
 * Turning two-factor sign-in on and off, and its backup codes. Every change asks for the password
 * again, and the server checks it. The page reloads after a change, so what it shows is what the
 * server holds.
 */
export function TwoFactorPanel({
  enabled,
  issuer,
  verified,
}: {
  enabled: boolean;
  issuer: string;
  verified: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  if (stage.kind === 'password') {
    return (
      <PasswordStep
        action={stage.action}
        issuer={issuer}
        onCancel={() => setStage({ kind: 'idle' })}
        onEnrolment={(uri, codes) => setStage({ kind: 'confirm', uri, codes })}
        onCodes={(codes) => setStage({ kind: 'codes', codes, heading: 'Your new backup codes' })}
      />
    );
  }
  if (stage.kind === 'confirm') {
    return (
      <ConfirmStep
        uri={stage.uri}
        onConfirmed={() =>
          setStage({ kind: 'codes', codes: stage.codes, heading: 'Your backup codes' })
        }
      />
    );
  }
  if (stage.kind === 'codes') return <Codes codes={stage.codes} heading={stage.heading} />;

  if (!enabled) {
    return (
      <div className={styles.form}>
        <h2 className={styles.heading}>Two-factor sign-in is off</h2>
        {verified ? (
          <div className={styles.row}>
            <Button onClick={() => setStage({ kind: 'password', action: 'enable' })}>
              Turn on
            </Button>
          </div>
        ) : (
          <Alert variant="warning">
            Verify your email address before turning on two-factor sign-in.
          </Alert>
        )}
      </div>
    );
  }
  return (
    <div className={styles.form}>
      <h2 className={styles.heading}>Two-factor sign-in is on</h2>
      <p className={styles.text}>
        Signing in asks for a code from your authenticator app, or one of your backup codes.
      </p>
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() => setStage({ kind: 'password', action: 'regenerate' })}
        >
          Get new backup codes
        </Button>
        <Button
          variant="secondary"
          onClick={() => setStage({ kind: 'password', action: 'disable' })}
        >
          Turn off
        </Button>
      </div>
    </div>
  );
}

const TITLES: Record<Action, { heading: string; hint: string; submit: string; pending: string }> = {
  enable: {
    heading: 'Turn on two-factor sign-in',
    hint: 'Enter your password to start.',
    submit: 'Continue',
    pending: 'Starting…',
  },
  regenerate: {
    heading: 'Get new backup codes',
    hint: 'Enter your password. Your old backup codes will stop working.',
    submit: 'Get new codes',
    pending: 'Making codes…',
  },
  disable: {
    heading: 'Turn off two-factor sign-in',
    hint: 'Enter your password. Signing in will need only your password again.',
    submit: 'Turn off',
    pending: 'Turning off…',
  },
};

function PasswordStep({
  action,
  issuer,
  onCancel,
  onEnrolment,
  onCodes,
}: {
  action: Action;
  issuer: string;
  onCancel: () => void;
  onEnrolment: (uri: string, codes: string[]) => void;
  onCodes: (codes: string[]) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const text = TITLES[action];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    if (action === 'enable') {
      const result = await authClient.twoFactor.enable({ password, issuer });
      setPending(false);
      if (result.error) return setError(problemWith(result.error));
      const data = result.data;
      if (data?.method !== 'totp') return setError('This could not be started. Try again.');
      return onEnrolment(data.totpURI, data.backupCodes);
    }
    if (action === 'regenerate') {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      setPending(false);
      if (result.error) return setError(problemWith(result.error));
      return onCodes(result.data?.backupCodes ?? []);
    }
    const result = await authClient.twoFactor.disable({ password });
    if (result.error) {
      setPending(false);
      return setError(problemWith(result.error));
    }
    reload();
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <h2 className={styles.heading}>{text.heading}</h2>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Password" hint={text.hint} required>
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
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? text.pending : text.submit}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ConfirmStep({ uri, onConfirmed }: { uri: string; onConfirmed: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const key = keyOf(uri);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setPending(false);
    if (result.error) {
      setError(
        result.error.status === 401
          ? 'That code is not right. Check the app and try again.'
          : problemWith(result.error),
      );
      return;
    }
    onConfirmed();
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <h2 className={styles.heading}>Set up your authenticator app</h2>
      <ol className={styles.steps}>
        <li>
          Open an authenticator app on your phone and add an account. Scan this picture, or type the
          key.
        </li>
        <li>Enter the 6-digit code the app shows, to confirm it works.</li>
      </ol>
      <QrCode
        modules={encode(uri, { ecc: 'M', border: 0 }).data}
        label="QR code for your authenticator app"
      />
      {key ? (
        <p className={styles.text}>
          Or type this key: <span className={styles.key}>{key}</span>
        </p>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Code from the app" required>
        {(field) => (
          <Input
            {...field}
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? 'Checking…' : 'Turn on'}
        </Button>
        <Button type="button" variant="ghost" onClick={reload}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Codes({ codes, heading }: { codes: string[]; heading: string }) {
  return (
    <div className={styles.form}>
      <h2 className={styles.heading}>{heading}</h2>
      <Alert variant="warning">
        Save these codes somewhere safe, such as a password manager. Each works once, if you lose
        your phone. They are not shown again.
      </Alert>
      <ul className={styles.codes}>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className={styles.row}>
        <Button onClick={reload}>I have saved them</Button>
      </div>
    </div>
  );
}

/** The key an authenticator app asks for, in groups of four, from the address its QR code carries. */
function keyOf(uri: string): string | undefined {
  try {
    const secret = new URL(uri).searchParams.get('secret');
    return secret ? (secret.match(/.{1,4}/g)?.join(' ') ?? secret) : undefined;
  } catch {
    return undefined;
  }
}

/** What went wrong, in words a person can act on. */
function problemWith(error: { status: number; code?: string }): string {
  if (error.code === 'INVALID_PASSWORD') return 'That password is not right.';
  if (error.code === 'EMAIL_NOT_VERIFIED') {
    return 'Verify your email address before turning on two-factor sign-in.';
  }
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return 'That did not work. Try again.';
}
