'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { passkeyProblem } from '../../(auth)/messages';
import styles from '../security.module.css';

export type PasskeyRow = {
  id: string;
  name: string | null;
  /** An ISO date, or null when it was not recorded. */
  createdAt: string | null;
  /** Whether the device syncs it between the person's devices. */
  synced: boolean;
};

const reload = () => window.location.reload();

/** Adding, naming and removing passkeys. The page reloads after a change, so it shows what the server holds. */
export function PasskeyPanel({ passkeys }: { passkeys: PasskeyRow[] }) {
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
            <PasskeyItem key={passkey.id} passkey={passkey} />
          ))}
        </ul>
      ) : null}
      {supported === false ? (
        <Alert variant="warning">This browser cannot make passkeys. Try another one.</Alert>
      ) : (
        <AddPasskey />
      )}
    </div>
  );
}

function AddPasskey() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    if (result?.error) {
      setPending(false);
      setError(passkeyProblem(result.error));
      return;
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
          {pending ? 'Waiting for your device…' : 'Add a passkey'}
        </Button>
      </div>
    </form>
  );
}

function PasskeyItem({ passkey }: { passkey: PasskeyRow }) {
  const [mode, setMode] = useState<'view' | 'rename' | 'remove'>('view');
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

  const title = passkey.name?.trim() || 'Passkey';
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
              {passkey.createdAt ? `Added ${formatDate(passkey.createdAt)}. ` : ''}
              {passkey.synced ? 'Synced between your devices.' : 'Stays on one device.'}
            </p>
          </div>
          {mode === 'remove' ? (
            <div className={styles.row}>
              <Button variant="destructive" loading={pending} onClick={() => void remove()}>
                Remove {title}
              </Button>
              <Button variant="ghost" onClick={() => setMode('view')}>
                Keep it
              </Button>
            </div>
          ) : (
            <div className={styles.row}>
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

/** A date for people, in the browser's language: the day only. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
