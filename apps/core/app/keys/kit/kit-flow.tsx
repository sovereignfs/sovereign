'use client';

import { useEffect, useState } from 'react';
import { formatKit, newKey } from '@sovereignfs/crypto/web';
import { Alert, Button } from '@sovereignfs/ui';
import { isEscrowOn, isKitPending, isUnlocked, kitKept } from '../../../src/keys/session';
import styles from '../../(auth)/auth.module.css';
import { KeepKit, Unlock } from '../kit-screens';

type Step =
  | { kind: 'checking' }
  | { kind: 'unlock' }
  | { kind: 'kit'; kit: Uint8Array; text: string; ownerCanRecover: boolean }
  | { kind: 'failed' };

/**
 * The kit, kept, then on to where the person was headed. Someone with nothing to keep goes straight on. A browser that does not hold
 * the keys open is asked to unlock first: signing in never sends one here, the Security page can.
 */
export function KitFlow({
  instanceName,
  email,
  rpId,
  returnTo,
}: {
  instanceName: string;
  email: string;
  rpId: string;
  returnTo: string;
}) {
  const [step, setStep] = useState<Step>({ kind: 'checking' });

  async function proceed() {
    setStep({ kind: 'checking' });
    if (!(await isKitPending())) {
      // Replaced, not pushed: going back from there does not come here again.
      window.location.replace(returnTo);
      return;
    }
    if (!(await isUnlocked())) {
      setStep({ kind: 'unlock' });
      return;
    }
    const kit = newKey();
    setStep({
      kind: 'kit',
      kit,
      text: await formatKit(kit),
      ownerCanRecover: await isEscrowOn(),
    });
  }

  // Once, when the page opens: what it does next is decided by what it finds.
  useEffect(() => {
    void proceed();
  }, []);

  if (step.kind === 'unlock') {
    return (
      <Unlock
        lead="Unlock your encrypted data on this browser to keep your recovery kit."
        email={email}
        rpId={rpId}
        offerKit={false}
        onUnlocked={() => void proceed()}
      />
    );
  }
  if (step.kind === 'kit') {
    return (
      <KeepKit
        lead="Before you go on, keep this somewhere safe."
        instanceName={instanceName}
        text={step.text}
        ownerCanRecover={step.ownerCanRecover}
        onKept={async () => {
          const kept = await kitKept(step.kit);
          step.kit.fill(0);
          if (kept) window.location.replace(returnTo);
          else setStep({ kind: 'failed' });
        }}
      />
    );
  }
  if (step.kind === 'failed') {
    return (
      <div className={styles.form}>
        <Alert variant="error">Your recovery kit couldn’t be saved. Try again.</Alert>
        <Button className={styles.submit} onClick={() => void proceed()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <p className={styles.lead} role="status">
      Getting your recovery kit ready…
    </p>
  );
}
