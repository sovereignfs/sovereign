'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog } from '@sovereignfs/ui';
import {
  deleteAppAction,
  rotateSecretAction,
  setAppEnabledAction,
  type AppActionResult,
} from '../actions';
import styles from '../apps.module.css';
import { SecretBox } from '../secret-box';

/**
 * Switching an app off and on, giving it a new secret, and deleting it. Each asks first, says what it will do to the
 * people who use the app, and keeps its question open to show a refusal. A new secret is shown once, here.
 */
export function AppActions({
  id,
  name,
  enabled,
  confidential,
}: {
  id: string;
  name: string;
  enabled: boolean;
  confidential: boolean;
}) {
  const [asking, setAsking] = useState<'off' | 'rotate' | 'delete' | undefined>();
  const [secret, setSecret] = useState<{ value: string; message: string } | undefined>();
  const [done, setDone] = useState<string | undefined>();

  const [onState, switchOn, switchingOn] = useActionState<AppActionResult | null, null>(
    (previous) => setAppEnabledAction(id, true, previous),
    null,
  );
  const [offState, switchOff, switchingOff] = useActionState<AppActionResult | null, null>(
    (previous) => setAppEnabledAction(id, false, previous),
    null,
  );
  const [rotateState, rotate, rotating] = useActionState<AppActionResult | null, null>(
    (previous) => rotateSecretAction(id, previous),
    null,
  );
  const [deleteState, remove, deleting] = useActionState<AppActionResult | null, null>(
    (previous) => deleteAppAction(id, previous),
    null,
  );

  useEffect(() => {
    if (onState?.ok) setDone(onState.message);
  }, [onState]);
  useEffect(() => {
    if (offState?.ok) {
      setAsking(undefined);
      setDone(offState.message);
    }
  }, [offState]);
  useEffect(() => {
    if (rotateState?.ok && rotateState.secret) {
      setAsking(undefined);
      setSecret({ value: rotateState.secret, message: rotateState.message });
    }
  }, [rotateState]);

  return (
    <div className={styles.actions}>
      {done ? <Alert variant="success">{done}</Alert> : null}
      {secret ? <SecretBox secret={secret.value} message={secret.message} /> : null}
      {onState && !onState.ok ? <Alert variant="error">{onState.error}</Alert> : null}
      <div className={styles.buttons}>
        {enabled ? (
          <Button type="button" variant="secondary" onClick={() => setAsking('off')}>
            Switch off
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            loading={switchingOn}
            onClick={() => startTransition(() => switchOn(null))}
          >
            {switchingOn ? 'Switching on…' : 'Switch on'}
          </Button>
        )}
        {confidential ? (
          <Button type="button" variant="secondary" onClick={() => setAsking('rotate')}>
            Make a new secret
          </Button>
        ) : null}
        <Button type="button" variant="destructive" onClick={() => setAsking('delete')}>
          Delete the app
        </Button>
      </div>

      <ConfirmDialog
        open={asking === 'off'}
        onClose={() => setAsking(undefined)}
        title="Switch this app off?"
        message={`${name} stops signing people in and stops refreshing what it was given, and disappears from the launcher. You can switch it on again.`}
        confirmLabel={switchingOff ? 'Switching off…' : 'Switch off'}
        destructive
        pending={switchingOff}
        error={offState && !offState.ok ? offState.error : undefined}
        onConfirm={() => startTransition(() => switchOff(null))}
      />
      {confidential ? (
        <ConfirmDialog
          open={asking === 'rotate'}
          onClose={() => setAsking(undefined)}
          title="Make a new secret?"
          message={`The old secret stops working at once, so ${name} cannot sign anyone in until it is given the new one. The new secret is shown once.`}
          confirmLabel={rotating ? 'Making…' : 'Make a new secret'}
          destructive
          pending={rotating}
          error={rotateState && !rotateState.ok ? rotateState.error : undefined}
          onConfirm={() => startTransition(() => rotate(null))}
        />
      ) : null}
      <ConfirmDialog
        open={asking === 'delete'}
        onClose={() => setAsking(undefined)}
        title="Delete this app?"
        message={`${name} is removed, and everything it was given is taken back: every token, and what people agreed to share with it. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete the app'}
        destructive
        pending={deleting}
        error={deleteState && !deleteState.ok ? deleteState.error : undefined}
        onConfirm={() => startTransition(() => remove(null))}
      />
    </div>
  );
}
