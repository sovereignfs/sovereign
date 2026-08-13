'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Button, DeviceOnlyGate, DeviceStorageKeyGate, Input, Textarea } from '@sovereignfs/ui';
import type { DeviceStorageKeyGateStatus } from '@sovereignfs/ui';
import { isDeviceOnlyTierAvailable } from '@sovereignfs/sdk/device-client';
import { getDeviceStorageKeyStatus } from '@sovereignfs/sdk/device-only-storage';
import {
  deleteDeviceOnlyValue,
  getDeviceOnlyValue,
  listDeviceOnlyKeys,
  setDeviceOnlyValue,
} from '@sovereignfs/sdk/device-only-kv';
import {
  isDeviceStorageKeyUnlocked,
  lockDeviceStorageKey,
} from '@sovereignfs/sdk/device-only-session';
import styles from '../example-device-only.module.css';

// The platform auto-namespaces this plugin's `device-only-kv.ts` entries
// under its own manifest id — matches manifest.json's `"id"` field, the same
// way `example-basic`'s capability constant matches its own manifest entry.
const PLUGIN_ID = 'fs.sovereign.example-device-only';

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
}

/**
 * The full `device-only` tier stack, end to end, in the order a real plugin
 * uses it: `DeviceOnlyGate` (can this surface offer the tier at all —
 * `isDeviceOnlyTierAvailable()`, either native Keychain/Keystore or web/PWA
 * WebAuthn PRF + OPFS) outermost, `DeviceStorageKeyGate` (has *this user* set
 * up their Device Storage Key — `getDeviceStorageKeyStatus()`) inside it,
 * and only past both gates does `NotesPanel` below ever call
 * `@sovereignfs/sdk/device-only-kv`'s `get`/`set`/`delete`/`list`. Neither
 * gate is re-checked lazily by the panel itself — this component owns that,
 * matching the documented pattern in `docs/plugin-development.md`.
 */
export function DeviceOnlyNotesView() {
  const [tierAvailable, setTierAvailable] = useState(false);
  const [keyStatus, setKeyStatus] = useState<DeviceStorageKeyGateStatus>('checking');

  useEffect(() => {
    setTierAvailable(isDeviceOnlyTierAvailable());
    void getDeviceStorageKeyStatus().then(setKeyStatus);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Example: Device-only notes</h1>
        <p className={styles.lead}>
          Every note below is encrypted and stored only on this device (RFC 0093) — never sent to
          the server. Edit{' '}
          <code className={styles.code}>
            example-plugins/example-device-only/app/_components/DeviceOnlyNotesView.tsx
          </code>{' '}
          to see how.
        </p>
      </header>

      <DeviceOnlyGate available={tierAvailable} surfaceName="Device-only notes">
        <DeviceStorageKeyGate
          status={keyStatus}
          surfaceName="Device-only notes"
          setupAction={<Link href="/account/security">Set up Device Storage Key</Link>}
        >
          <NotesPanel />
        </DeviceStorageKeyGate>
      </DeviceOnlyGate>
    </div>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const ids = await listDeviceOnlyKeys(PLUGIN_ID);
    const loaded: Note[] = [];
    for (const id of ids) {
      const result = await getDeviceOnlyValue<Note>(PLUGIN_ID, id);
      if (result.status === 'ok' && result.value) loaded.push(result.value);
    }
    loaded.sort((a, b) => b.createdAt - a.createdAt);
    setNotes(loaded);
    setUnlocked(await isDeviceStorageKeyUnlocked());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setError(null);
    setSaving(true);
    try {
      const note: Note = { id: crypto.randomUUID(), title, body, createdAt: Date.now() };
      // Every read AND write needs the current unlock session — the same
      // asymmetry Android Keystore has vs. iOS Keychain, see
      // device-only-kv.ts's own doc comment. A "locked" device shows the
      // platform's biometric/passcode prompt right here, transparently.
      const result = await setDeviceOnlyValue(PLUGIN_ID, note.id, note);
      if (result.status !== 'ok') {
        setError(`Could not save this note (${result.status}).`);
        return;
      }
      setTitle('');
      setBody('');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    // No unlock needed — deleting a file needs no decryption
    // (device-only-kv.ts's deleteDeviceOnlyValue).
    await deleteDeviceOnlyValue(PLUGIN_ID, id);
    await refresh();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.sessionBadge}>
        <span className={unlocked ? styles.unlocked : styles.locked}>
          {unlocked ? 'Session unlocked' : 'Session locked'}
        </span>
        {unlocked && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              lockDeviceStorageKey();
              void refresh();
            }}
          >
            Lock now
          </Button>
        )}
      </div>

      <form onSubmit={handleAdd} className={styles.form}>
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Note title"
        />
        <Textarea
          placeholder="Body (optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Note body"
        />
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Save note'}
        </Button>
      </form>

      <ul className={styles.list}>
        {notes === null && <li className={styles.muted}>Loading…</li>}
        {notes?.length === 0 && <li className={styles.muted}>No notes yet.</li>}
        {notes?.map((note) => (
          <li key={note.id} className={styles.note}>
            <div>
              <strong>{note.title}</strong>
              {note.body && <p>{note.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleDelete(note.id)}
              className={styles.deleteButton}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
