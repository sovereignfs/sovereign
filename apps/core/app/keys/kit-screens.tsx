'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Input, RecoveryKit } from '@sovereignfs/ui';
import { deriveForSignIn } from '../../src/auth/derive';
import {
  unlockWithAnyPasskey,
  unlockWithKitTyped,
  unlockWithPasswordAgain,
} from '../../src/keys/session';
import { AuthField } from '../(auth)/auth-field';
import styles from '../(auth)/auth.module.css';

/** Opening the person's keys on this browser: the password or a passkey, both checked here alone (core-app §5.5). */
export function Unlock({
  lead,
  email,
  rpId,
  offerKit = true,
  onUnlocked,
}: {
  lead: string;
  email: string;
  rpId: string;
  /** Not offered to someone who has no kit yet. */
  offerKit?: boolean;
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
      <p className={styles.lead}>{lead}</p>
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
      {offerKit ? (
        <Button
          type="button"
          variant="ghost"
          className={styles.submit}
          onClick={() => setWithKit(true)}
        >
          Use your recovery kit
        </Button>
      ) : null}
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

/** The recovery kit, shown to be kept (core-app §5.3): nothing goes on until the person says they kept it. */
export function KeepKit({
  lead,
  instanceName,
  text,
  ownerCanRecover,
  onKept,
}: {
  lead: string;
  instanceName: string;
  text: string;
  /** Escrow is on (core-app §5.8): the kit is the person's own way back, not the only one. */
  ownerCanRecover: boolean;
  onKept: () => Promise<void>;
}) {
  const [continuing, setContinuing] = useState(false);
  return (
    <div className={styles.form}>
      <p className={styles.lead}>{lead}</p>
      <RecoveryKit
        kit={text}
        instanceName={instanceName}
        ownerCanRecover={ownerCanRecover}
        continuing={continuing}
        onContinue={() => {
          setContinuing(true);
          void onKept();
        }}
      />
    </div>
  );
}
