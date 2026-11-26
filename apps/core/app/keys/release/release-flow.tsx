'use client';

import { useEffect, useState } from 'react';
import { formatKit, newKey } from '@sovereignfs/crypto/web';
import { Alert, Button } from '@sovereignfs/ui';
import type { ReleaseRequest } from '../../../src/keys/release';
import {
  escrowAccepted,
  isEscrowOn,
  isEscrowPending,
  isKitPending,
  isUnlocked,
  kitKept,
  releaseKey,
} from '../../../src/keys/session';
import styles from '../../(auth)/auth.module.css';
import { KeepKit, Unlock } from '../kit-screens';

type Step =
  | { kind: 'checking' }
  | { kind: 'confirm' }
  | { kind: 'unlock' }
  | { kind: 'kit'; kit: Uint8Array; text: string; ownerCanRecover: boolean }
  | { kind: 'escrow' }
  | { kind: 'failed' };

/**
 * What the person sees of key release (core-app §5.7): nothing when this browser is unlocked and the kit is kept, only a moment's
 * "Opening…". Otherwise, first the unlock (the password, or a passkey; both checked here alone), then the recovery kit, for someone who
 * has not kept it at sign-in (core-app §5.3). Then the browser goes back to the app with its key in the fragment.
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
      setStep({
        kind: 'kit',
        kit,
        text: await formatKit(kit),
        ownerCanRecover: await isEscrowOn(),
      });
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
    return (
      <Unlock
        lead={`${appName} keeps your data encrypted. Unlock to open it on this browser.`}
        email={email}
        rpId={rpId}
        onUnlocked={() => void proceed()}
      />
    );
  }
  if (step.kind === 'kit') {
    return (
      <KeepKit
        lead={
          step.ownerCanRecover
            ? `Before ${appName} opens, keep your recovery kit. If you forget your password and lose your passkeys, it’s your own way back to what you keep encrypted.`
            : `Before ${appName} opens, keep your recovery kit. If you forget your password and lose your passkeys, it’s the only way back to what you keep encrypted.`
        }
        instanceName={instanceName}
        text={step.text}
        ownerCanRecover={step.ownerCanRecover}
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
