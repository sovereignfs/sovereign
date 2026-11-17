'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { formatKit, newKey } from '@sovereignfs/crypto/web';
import { Alert, Button, Input, RecoveryKit } from '@sovereignfs/ui';
import { deriveForSignIn } from '../../../src/auth/derive';
import type { ReleaseRequest } from '../../../src/keys/release';
import {
  escrowAccepted,
  isEscrowPending,
  isKitPending,
  isUnlocked,
  kitKept,
  releaseKey,
  unlockWithAnyPasskey,
  unlockWithKitTyped,
  unlockWithPasswordAgain,
} from '../../../src/keys/session';
import { AuthField } from '../../(auth)/auth-field';
import styles from '../../(auth)/auth.module.css';

type Step =
  | { kind: 'checking' }
  | { kind: 'confirm' }
  | { kind: 'unlock' }
  | { kind: 'kit'; kit: Uint8Array; text: string }
  | { kind: 'escrow' }
  | { kind: 'failed' };

/**
 * What the person sees of key release (core-app §5.7): nothing when this browser is unlocked and the kit is kept, only a moment's
 * "Opening…". Otherwise, first the unlock (the password, or a passkey; both checked here alone), then, at the first encrypted app, the
 * recovery kit (core-app §5.3). Then the browser goes back to the app with its key in the fragment.
 */
export function ReleaseFlow({
  target,
  appName,
  email,
  rpId,
  instanceName,
  confirm,
}: {
  target: ReleaseRequest;
  appName: string;
  email: string;
  rpId: string;
  instanceName: string;
  /** The request did not say it came from the app's own pages: the person says so before anything is released. */
  confirm: boolean;
}) {
  const [step, setStep] = useState<Step>(confirm ? { kind: 'confirm' } : { kind: 'checking' });

  async function proceed() {
    setStep({ kind: 'checking' });
    if (!(await isUnlocked())) {
      setStep({ kind: 'unlock' });
      return;
    }
    if (await isKitPending()) {
      const kit = newKey();
      setStep({ kind: 'kit', kit, text: await formatKit(kit) });
      return;
    }
    if (await isEscrowPending()) {
      setStep({ kind: 'escrow' });
      return;
    }
    const released = await releaseKey(target);
    if (typeof released === 'object') {
      // Replaced, not pushed: going back from the app does not come here again.
      window.location.replace(released.url);
      return;
    }
    setStep(released === 'locked' ? { kind: 'unlock' } : { kind: 'failed' });
  }

  // Once, when the page opens: what it does next is decided by what it finds.
  useEffect(() => {
    if (!confirm) void proceed();
  }, []);

  if (step.kind === 'confirm') {
    return (
      <div className={styles.form}>
        <p className={styles.lead}>
          {appName} is asking to open your encrypted data on this browser. Continue only if you came
          here from {appName}.
        </p>
        <Button className={styles.submit} onClick={() => void proceed()}>
          Continue to {appName}
        </Button>
      </div>
    );
  }
  if (step.kind === 'unlock') {
    return <Unlock appName={appName} email={email} rpId={rpId} onUnlocked={() => void proceed()} />;
  }
  if (step.kind === 'kit') {
    return (
      <KeepKit
        appName={appName}
        instanceName={instanceName}
        text={step.text}
        onKept={async () => {
          const kept = await kitKept(step.kit);
          step.kit.fill(0);
          if (kept) await proceed();
          else setStep({ kind: 'failed' });
        }}
      />
    );
  }
  if (step.kind === 'escrow') {
    return (
      <EscrowNotice
        instanceName={instanceName}
        onContinue={async () => {
          if (await escrowAccepted()) await proceed();
          else setStep({ kind: 'failed' });
        }}
      />
    );
  }
  if (step.kind === 'failed') {
    return (
      <Alert variant="error">
        {appName} couldn’t be opened. Go back to {appName} and try again.
      </Alert>
    );
  }
  return (
    <p className={styles.lead} role="status">
      Opening {appName}…
    </p>
  );
}

function Unlock({
  appName,
  email,
  rpId,
  onUnlocked,
}: {
  appName: string;
  email: string;
  rpId: string;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<'password' | 'passkey' | undefined>();
  const [passkeys, setPasskeys] = useState(false);
  const [withKit, setWithKit] = useState(false);
  // Known only in the browser, so it is read after the first render, never during it.
  useEffect(() => setPasskeys(typeof window.PublicKeyCredential === 'function'), []);

  if (withKit) {
    return <KitUnlock email={email} onUnlocked={onUnlocked} onCancel={() => setWithKit(false)} />;
  }

  async function withPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending('password');
    setError(undefined);
    try {
      const { secret } = await deriveForSignIn(password, email);
      if (await unlockWithPasswordAgain(secret)) {
        onUnlocked();
        return;
      }
      setError('That password doesn’t unlock your encrypted data. Check it and try again.');
    } catch {
      setError('This page couldn’t get ready. Reload it and try again.');
    }
    setPending(undefined);
  }

  async function withPasskey() {
    setPending('passkey');
    setError(undefined);
    if (await unlockWithAnyPasskey(rpId)) {
      onUnlocked();
      return;
    }
    setPending(undefined);
    setError('That passkey didn’t unlock your encrypted data. Try your password instead.');
  }

  return (
    <form className={styles.form} onSubmit={(event) => void withPassword(event)}>
      <p className={styles.lead}>
        {appName} keeps your data encrypted. Unlock to open it on this browser.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <AuthField label="Password">
        {(control) => (
          <Input
            {...control}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            disabled={pending !== undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </AuthField>
      <Button type="submit" className={styles.submit} loading={pending === 'password'}>
        {pending === 'password' ? 'Unlocking…' : 'Unlock'}
      </Button>
      {passkeys ? (
        <Button
          type="button"
          variant="secondary"
          className={styles.submit}
          loading={pending === 'passkey'}
          onClick={() => void withPasskey()}
        >
          {pending === 'passkey' ? 'Waiting for your device…' : 'Use a passkey'}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className={styles.submit}
        onClick={() => setWithKit(true)}
      >
        Use your recovery kit
      </Button>
    </form>
  );
}

/**
 * Unlocking with the recovery kit (core-app §5.3): after a password reset, or a recovery through escrow, the password the person signed
 * in with no longer opens their data. The kit does, and the password is given its way in again, so it unlocks from then on.
 */
function KitUnlock({
  email,
  onUnlocked,
  onCancel,
}: {
  email: string;
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const [kit, setKit] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const { secret } = await deriveForSignIn(password, email);
      const result = await unlockWithKitTyped(kit, secret);
      if (result === 'unlocked') {
        onUnlocked();
        return;
      }
      setError(
        result === 'mistyped'
          ? 'That kit has a typing mistake. Check each group and try again.'
          : 'That kit doesn’t unlock your encrypted data. Check you have the newest one.',
      );
    } catch {
      setError('This page couldn’t get ready. Reload it and try again.');
    }
    setPending(false);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      <p className={styles.lead}>
        Type your recovery kit, and the password you sign in with now. From then on, your password
        unlocks your encrypted data again.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <AuthField label="Recovery kit" hint="Fourteen groups of four letters and numbers.">
        {(control) => (
          <Input
            {...control}
            name="kit"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={pending}
            value={kit}
            onChange={(event) => setKit(event.target.value)}
          />
        )}
      </AuthField>
      <AuthField label="Password">
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
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Unlocking…' : 'Unlock'}
      </Button>
      <Button type="button" variant="ghost" className={styles.submit} onClick={onCancel}>
        Back
      </Button>
    </form>
  );
}

function KeepKit({
  appName,
  instanceName,
  text,
  onKept,
}: {
  appName: string;
  instanceName: string;
  text: string;
  onKept: () => Promise<void>;
}) {
  const [continuing, setContinuing] = useState(false);
  return (
    <div className={styles.form}>
      <p className={styles.lead}>
        Before {appName} opens, keep your recovery kit. If you forget your password and lose your
        passkeys, it’s the only way back to what you keep encrypted.
      </p>
      <RecoveryKit
        kit={text}
        instanceName={instanceName}
        continuing={continuing}
        onContinue={() => {
          setContinuing(true);
          void onKept();
        }}
      />
    </div>
  );
}

/** Told once, before the person's data is covered by escrow (core-app §5.8): the owner can now recover it. */
function EscrowNotice({
  instanceName,
  onContinue,
}: {
  instanceName: string;
  onContinue: () => Promise<void>;
}) {
  const [continuing, setContinuing] = useState(false);
  return (
    <div className={styles.form}>
      <p className={styles.lead}>
        The owner of {instanceName} has turned on recovery. From now on, they can recover your
        encrypted data if you lose your password, your passkeys and your recovery kit.
      </p>
      <p className={styles.lead}>You can see this at any time on your Security page.</p>
      <Button
        className={styles.submit}
        loading={continuing}
        onClick={() => {
          setContinuing(true);
          void onContinue();
        }}
      >
        {continuing ? 'Continuing…' : 'Continue'}
      </Button>
    </div>
  );
}
