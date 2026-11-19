'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Checkbox, FormField, Select } from '@sovereignfs/ui';
import { askForPasskey } from '../../src/lock/ceremony';
import { lockChallenge, removeLock, saveLock } from './lock-actions';
import styles from './security.module.css';

const IDLE_CHOICES = [1, 5, 15, 60] as const;
const DEFAULT_IDLE = 15;

const minutes = (count: number) => (count === 1 ? '1 minute' : `${count} minutes`);

/**
 * The lock on this device (RFC 0006 B1), on the Security page: off, with what it does and a way to turn it on; or on, with its idle time
 * and whether leaving the app locks too, which can be changed, and a way to turn it off.
 */
export function LockPanel({
  lock,
  hasPasskey,
}: {
  lock: { idleMinutes: number; onLeave: boolean } | undefined;
  hasPasskey: boolean;
}) {
  const router = useRouter();
  const [idle, setIdle] = useState(lock?.idleMinutes ?? DEFAULT_IDLE);
  const [onLeave, setOnLeave] = useState(lock?.onLeave ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Turning it on needs a passkey; a lock already on (a passkey removed since) can still be changed or turned off.
  if (!lock && !hasPasskey) {
    return (
      <>
        <p className={styles.text}>
          A lock asks for your passkey (Face ID, Touch ID or your fingerprint) when you come back to
          this device after a while. It needs a passkey first.
        </p>
        <p className={styles.footer}>
          <Link className={styles.link} href="/security/passkeys">
            Add a passkey
          </Link>
        </p>
      </>
    );
  }

  async function save() {
    setPending(true);
    setError(undefined);
    const refused =
      'Your passkey did not answer on this device. Try again, or add a passkey here first.';
    try {
      // Turning it on asks for one of the account's passkeys on this device, checked by core; changing it, where it is on, does not.
      let passkey: unknown;
      if (!lock) {
        const request = await lockChallenge();
        const asked = request ? await askForPasskey(request) : undefined;
        if (!asked) {
          setPending(false);
          setError(refused);
          return;
        }
        passkey = asked.answer;
      }
      const result = await saveLock({ idleMinutes: idle, onLeave, passkey });
      setPending(false);
      if (!result.ok) {
        setError(result.reason === 'passkey' ? refused : 'That could not be saved. Try again.');
        return;
      }
    } catch {
      setPending(false);
      setError('That could not be saved. Try again.');
      return;
    }
    router.refresh();
  }

  async function turnOff() {
    setPending(true);
    setError(undefined);
    await removeLock();
    setPending(false);
    router.refresh();
  }

  return (
    <>
      <p className={styles.text}>
        {lock
          ? `On for this device: it locks after ${minutes(lock.idleMinutes)} without use${lock.onLeave ? ', and when you leave the app' : ''}. Unlock with your passkey or your password.`
          : 'Off. A lock asks for your passkey (Face ID, Touch ID or your fingerprint) when you come back to this device after a while. Your password always unlocks it too.'}
      </p>
      <FormField label="Lock after">
        {(field) => (
          <Select
            {...field}
            value={String(idle)}
            disabled={pending}
            onChange={(event) => setIdle(Number(event.target.value))}
          >
            {IDLE_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {minutes(choice)} without use
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <Checkbox
        label="Also lock when I leave the app"
        checked={onLeave}
        disabled={pending}
        onChange={setOnLeave}
      />
      {error ? (
        <p className={styles.text} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button loading={pending} onClick={() => void save()}>
          {lock ? 'Save' : 'Turn on'}
        </Button>
        {lock ? (
          <Button variant="secondary" disabled={pending} onClick={() => void turnOff()}>
            Turn off
          </Button>
        ) : null}
      </div>
    </>
  );
}
