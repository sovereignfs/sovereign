import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import styles from './Account.module.css';

/** A change to the second step, which always asks for the password first. */
export type TwoFactorAction = 'enable' | 'regenerate' | 'disable';

/** What starting a change came to: a sentence to show, an enrolment to confirm, new backup codes, or the second step turned off. */
export type TwoFactorStart =
  { error: string } | { uri: string; codes: string[] } | { codes: string[] } | { off: true };

export interface TwoFactorPanelProps {
  enabled: boolean;
  /** Whether the address is verified: the second step needs it first. */
  verified: boolean;
  /** Starts a change with the password the person typed (the app derives and sends it). */
  start: (action: TwoFactorAction, password: string) => Promise<TwoFactorStart>;
  /** Confirms an enrolment with a code from the authenticator app; a sentence when it was refused. */
  confirm: (code: string) => Promise<{ error?: string }>;
  /** Draws the enrolment's QR code; the app brings the encoder (`QrCode` takes its modules). */
  renderQr: (uri: string) => ReactNode;
  /** After a change is done or cancelled, so the page shows what the server holds (the app reloads it). */
  onDone: () => void;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'password'; action: TwoFactorAction }
  /** Enrolment started: the key is shown, and nothing is on until a code from it is entered. */
  | { kind: 'confirm'; uri: string; codes: string[] }
  | { kind: 'codes'; codes: string[]; heading: string };

/**
 * Turning the second sign-in step on and off, and its backup codes (auth.md §7), for core and every app. Every change asks for the
 * password again, which the app checks on the server.
 */
export function TwoFactorPanel({
  enabled,
  verified,
  start,
  confirm,
  renderQr,
  onDone,
}: TwoFactorPanelProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  if (stage.kind === 'password') {
    return (
      <PasswordStep
        action={stage.action}
        start={start}
        onCancel={() => setStage({ kind: 'idle' })}
        onEnrolment={(uri, codes) => setStage({ kind: 'confirm', uri, codes })}
        onCodes={(codes) => setStage({ kind: 'codes', codes, heading: 'Your new backup codes' })}
        onOff={onDone}
      />
    );
  }
  if (stage.kind === 'confirm') {
    return (
      <ConfirmStep
        uri={stage.uri}
        confirm={confirm}
        renderQr={renderQr}
        onCancel={onDone}
        onConfirmed={() =>
          setStage({ kind: 'codes', codes: stage.codes, heading: 'Your backup codes' })
        }
      />
    );
  }
  if (stage.kind === 'codes') {
    return <Codes codes={stage.codes} heading={stage.heading} onDone={onDone} />;
  }

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

const TITLES: Record<
  TwoFactorAction,
  { heading: string; hint: string; submit: string; pending: string }
> = {
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
  start,
  onCancel,
  onEnrolment,
  onCodes,
  onOff,
}: {
  action: TwoFactorAction;
  start: TwoFactorPanelProps['start'];
  onCancel: () => void;
  onEnrolment: (uri: string, codes: string[]) => void;
  onCodes: (codes: string[]) => void;
  onOff: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const text = TITLES[action];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the box, as in `SignInForm`: a password manager can fill it without telling the page.
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setPending(true);
    setError(undefined);
    const result = await start(action, password);
    if ('off' in result) return onOff();
    setPending(false);
    if ('error' in result) return setError(result.error);
    if ('uri' in result) return onEnrolment(result.uri, result.codes);
    return onCodes(result.codes);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <h2 className={styles.heading}>{text.heading}</h2>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Password" hint={text.hint} required>
        {(field) => (
          <Input {...field} type="password" name="password" autoComplete="current-password" />
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

function ConfirmStep({
  uri,
  confirm,
  renderQr,
  onCancel,
  onConfirmed,
}: {
  uri: string;
  confirm: TwoFactorPanelProps['confirm'];
  renderQr: TwoFactorPanelProps['renderQr'];
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const key = keyOf(uri);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await confirm(code.trim());
    setPending(false);
    if (result.error) return setError(result.error);
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
      {renderQr(uri)}
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
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Codes({
  codes,
  heading,
  onDone,
}: {
  codes: string[];
  heading: string;
  onDone: () => void;
}) {
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
        <Button onClick={onDone}>I have saved them</Button>
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
