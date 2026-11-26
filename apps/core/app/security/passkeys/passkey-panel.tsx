'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { deriveForSignIn } from '../../../src/auth/derive';
import { prfEnabled, prfExtension, prfOutput } from '../../../src/keys/passkey';
import {
  givePasskeyWayIn,
  isUnlocked,
  letPasskeyUnlock,
  unlockWithPasswordAgain,
} from '../../../src/keys/session';
import { passkeyProblem } from '../../(auth)/messages';
import styles from '../security.module.css';
import { writtenDate } from '../../../src/time/written';

export type PasskeyRow = {
  id: string;
  /** WebAuthn's id for it, which its way into the person's keys is named by. */
  credentialId: string;
  name: string | null;
  /** An ISO date, or null when it was not recorded. */
  createdAt: string | null;
  /** Whether the device syncs it between the person's devices. */
  synced: boolean;
  /** Whether it also unlocks the person's encrypted data (core-app §5.5). */
  unlocks: boolean;
};

/** What the panel needs to let a passkey unlock, given only when the person has keys. */
export type PasskeyKeys = { rpId: string; email: string };

const reload = () => window.location.reload();

/** Adding, naming and removing passkeys. The page reloads after a change, so it shows what the server holds. */
export function PasskeyPanel({
  passkeys,
  keys,
  timeZone,
}: {
  passkeys: PasskeyRow[];
  keys?: PasskeyKeys | undefined;
  /** The person's zone, for the day each passkey was added. */
  timeZone?: string | null | undefined;
}) {
  // Known only in the browser, so it is read after the first render, never during it.
  const [supported, setSupported] = useState<boolean | undefined>();
  useEffect(() => setSupported(typeof window.PublicKeyCredential === 'function'), []);

  return (
    <div className={styles.form}>
      <h2 className={styles.heading}>
        {passkeys.length === 0 ? 'You have no passkeys' : 'Your passkeys'}
      </h2>
      {passkeys.length > 0 ? (
        <ul className={styles.passkeys}>
          {passkeys.map((passkey) => (
            <PasskeyItem key={passkey.id} passkey={passkey} keys={keys} timeZone={timeZone} />
          ))}
        </ul>
      ) : null}
      {supported === false ? (
        <Alert variant="warning">This browser cannot make passkeys. Try another one.</Alert>
      ) : (
        <AddPasskey keys={keys} />
      )}
    </div>
  );
}

function AddPasskey({ keys }: { keys?: PasskeyKeys | undefined }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [again, setAgain] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const extensions = keys ? await prfExtension().catch(() => undefined) : undefined;
    const result = await authClient.passkey.addPasskey({
      name: name.trim() || undefined,
      ...(extensions ? { extensions, returnWebAuthnResponse: true } : {}),
    });
    if (result?.error) {
      setPending(false);
      setError(passkeyProblem(result.error));
      return;
    }
    // Added. While this browser is unlocked it also gets its way in (core-app §5.5): from the output the device gave now, or, from a
    // device that gives it only when the passkey is used, from one more touch. Nothing here stops the passkey being added.
    if (keys && result && 'webauthn' in result) {
      const id = result.webauthn.response.id;
      const output = prfOutput(result.webauthn.clientExtensionResults);
      if (output) await givePasskeyWayIn(id, output);
      else if (prfEnabled(result.webauthn.clientExtensionResults) && (await isUnlocked())) {
        setAgain(true);
        await letPasskeyUnlock(keys.rpId, id);
      }
    }
    reload();
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Name" hint="So you can tell it apart later, such as “Work laptop”.">
        {(field) => (
          <Input
            {...field}
            name="name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {again ? 'Use it once more…' : pending ? 'Waiting for your device…' : 'Add a passkey'}
        </Button>
      </div>
    </form>
  );
}

function PasskeyItem({
  passkey,
  keys,
  timeZone,
}: {
  passkey: PasskeyRow;
  keys?: PasskeyKeys | undefined;
  timeZone: string | null | undefined;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'remove' | 'unlock'>('view');
  const [name, setName] = useState(passkey.name ?? '');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.passkey.updatePasskey({ id: passkey.id, name: name.trim() });
    if (result.error) {
      setPending(false);
      setError('The name could not be changed. Try again.');
      return;
    }
    reload();
  }

  async function remove() {
    setPending(true);
    setError(undefined);
    const result = await authClient.passkey.deletePasskey({ id: passkey.id });
    if (result.error) {
      setPending(false);
      setError('The passkey could not be removed. Try again.');
      return;
    }
    reload();
  }

  async function letItUnlock() {
    if (!keys) return;
    setPending(true);
    setError(undefined);
    // Its way in wraps the keys this browser holds open; a browser that holds none asks for the password first.
    if (!(await isUnlocked())) {
      setPending(false);
      setMode('unlock');
      return;
    }
    if (await letPasskeyUnlock(keys.rpId, passkey.credentialId)) {
      reload();
      return;
    }
    setPending(false);
    setError('This passkey can’t unlock your encrypted data. It still signs you in.');
  }

  const title = passkey.name?.trim() || 'Passkey';
  const unlockNote = keys
    ? passkey.unlocks
      ? ' Also unlocks your encrypted data.'
      : ' Doesn’t unlock your encrypted data.'
    : '';
  return (
    <li className={styles.passkey}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {mode === 'rename' ? (
        <form className={styles.form} onSubmit={(event) => void rename(event)}>
          <FormField label="Name">
            {(field) => (
              <Input
                {...field}
                name="name"
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
          <div className={styles.row}>
            <Button type="submit" loading={pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div>
            <p className={styles.passkeyName}>{title}</p>
            <p className={styles.footer}>
              {passkey.createdAt ? `Added ${writtenDate(passkey.createdAt, timeZone)}. ` : ''}
              {passkey.synced ? 'Synced between your devices.' : 'Stays on one device.'}
              {unlockNote}
            </p>
          </div>
          {mode === 'unlock' && keys ? (
            <UnlockFirst
              email={keys.email}
              onUnlocked={() => {
                setMode('view');
                void letItUnlock();
              }}
              onCancel={() => setMode('view')}
            />
          ) : mode === 'remove' ? (
            <div className={styles.form}>
              {passkey.unlocks ? (
                <Alert variant="warning">
                  This passkey also unlocks your encrypted data. Once it’s removed, unlock with your
                  password or another passkey.
                </Alert>
              ) : null}
              <div className={styles.row}>
                <Button variant="destructive" loading={pending} onClick={() => void remove()}>
                  Remove {title}
                </Button>
                <Button variant="ghost" onClick={() => setMode('view')}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.row}>
              {keys && !passkey.unlocks ? (
                <Button variant="secondary" loading={pending} onClick={() => void letItUnlock()}>
                  Let it unlock
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setMode('rename')}>
                Rename
              </Button>
              <Button variant="secondary" onClick={() => setMode('remove')}>
                Remove
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

/** The password, asked for again to unlock this browser before a passkey is given its way in. */
function UnlockFirst({
  email,
  onUnlocked,
  onCancel,
}: {
  email: string;
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the box: a password manager can fill it without telling the page.
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!password) return;
    setPending(true);
    setError(undefined);
    try {
      // Opened in the browser alone: nothing is sent but what reads the person's own wrapped keys.
      const { secret } = await deriveForSignIn(password, email);
      if (await unlockWithPasswordAgain(secret)) {
        onUnlocked();
        return;
      }
      setError('That password doesn’t unlock your encrypted data. Check it and try again.');
    } catch {
      setError('This page couldn’t get ready. Reload it and try again.');
    }
    setPending(false);
  }

  return (
    // POST, should a script of someone else's send it: nothing of it goes in the address (core-app §5.2).
    <form className={styles.form} method="post" onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Your password" hint="To unlock this device first.">
        {(field) => (
          <Input
            {...field}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? 'Unlocking…' : 'Unlock'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
