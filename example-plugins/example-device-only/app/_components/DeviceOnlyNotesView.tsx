'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  Button,
  DeviceOnlyGate,
  DeviceStorageKeyGate,
  Input,
  PageContainer,
  Textarea,
} from '@sovereignfs/ui';
import type { DeviceStorageKeyGateStatus } from '@sovereignfs/ui';
import { isDeviceOnlyTierAvailable, supports } from '@sovereignfs/sdk/device-client';
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
import { exportDeviceOnlyData, importDeviceOnlyData } from '@sovereignfs/sdk/device-only-export';
import type { DeviceOnlyExportFile } from '@sovereignfs/sdk/device-only-export';
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
 * WebAuthn PRF + OPFS) outermost, then a transport-specific check for
 * whether *this user* can actually use it — before either gate does
 * `NotesPanel` below ever call `@sovereignfs/sdk/device-only-kv`'s
 * `get`/`set`/`delete`/`list`. Neither gate is re-checked lazily by the
 * panel itself — this component owns that, matching the documented pattern
 * in `docs/plugin-development.md`.
 *
 * The second gate is transport-specific, not a single shared check, because
 * `getDeviceStorageKeyStatus()` is explicitly web/PWA-only (its own doc
 * comment, `@sovereignfs/sdk/device-only-storage`): it answers "has this
 * browser enrolled a WebAuthn-PRF-wrapped key in OPFS yet," a question with
 * no native equivalent — a native shell's SQLCipher database has no
 * separate app-level enrollment step at all, the OS's own biometric/passcode
 * prompt gates every `secureStorage` call directly. Calling
 * `getDeviceStorageKeyStatus()` unconditionally (as an earlier version of
 * this component did) always answered `'unsupported'` on native — since
 * `isWebAuthnAvailable()`/`isOpfsAvailable()` are about the *web* ceremony,
 * not the native bridge — permanently blocking `DeviceStorageKeyGate` and
 * making this reference plugin unusable on native shells even though the
 * tier itself was fully available. `supports('secureStorage')` (the same
 * check `DeviceStorageKeySection.tsx` in Account → Security uses) decides
 * which path applies, matching that component's own dispatcher pattern.
 */
export function DeviceOnlyNotesView() {
  const [tierAvailable, setTierAvailable] = useState(false);
  const [native, setNative] = useState<boolean | null>(null);
  const [keyStatus, setKeyStatus] = useState<DeviceStorageKeyGateStatus>('checking');

  useEffect(() => {
    setTierAvailable(isDeviceOnlyTierAvailable());
    const isNative = supports('secureStorage');
    setNative(isNative);
    if (!isNative) {
      void getDeviceStorageKeyStatus().then(setKeyStatus);
    }
  }, []);

  return (
    <PageContainer maxWidth="sm" className={styles.page}>
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
        {native === null ? null : native ? (
          <NotesPanel native />
        ) : (
          <DeviceStorageKeyGate
            status={keyStatus}
            surfaceName="Device-only notes"
            setupAction={<Link href="/account/security">Set up Device Storage Key</Link>}
          >
            <NotesPanel native={false} />
          </DeviceStorageKeyGate>
        )}
      </DeviceOnlyGate>
    </PageContainer>
  );
}

function NotesPanel({ native }: { native: boolean }) {
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
    // The in-memory unlock session (`device-only-session.ts`) models the
    // web/PWA PRF ceremony's re-lock policy window — native has no
    // equivalent JS-visible session at all, since the OS gates every
    // `secureStorage` call directly at the point of use, so there is
    // nothing meaningful to show here on that path.
    if (!native) setUnlocked(await isDeviceStorageKeyUnlocked());
  }, [native]);

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
      {native ? (
        <div className={styles.sessionBadge}>
          Protected by this device's passcode, fingerprint, or face unlock — prompted automatically
          whenever a note is saved, read, or listed.
        </div>
      ) : (
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
      )}

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

      {/*
        `exportDeviceOnlyData`/`importDeviceOnlyData` (RFC 0093 §4 Layer 2)
        are OPFS-only today — they read/write through `listDeviceOnlyPluginIds()`,
        which has no native bridge equivalent (`device-only-kv.ts`'s own doc
        comment: no `secureStorage` op enumerates all plugin ids). Account →
        Security's own native branch doesn't render export/import either, for
        the same reason — matched here rather than presenting a control that
        would fail on tap.
      */}
      {!native && <ExportImportPanel onImported={refresh} />}
    </div>
  );
}

/**
 * RFC 0093 §4 Layer 2 — the always-available, no-server export/import path,
 * demonstrated the same way Account → Security's own "Export data"/"Import
 * data" controls use it (`plugins/account/app/_components/
 * DeviceStorageKeySection.tsx`), so this example proves that piece of the
 * stack end to end too, not just the KV store and unlock session above.
 */
function ExportImportPanel({ onImported }: { onImported: () => void }) {
  const [mode, setMode] = useState<'idle' | 'export' | 'import'>('idle');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMode('idle');
    setPassphrase('');
    setConfirmPassphrase('');
    setSelectedFile(null);
  }

  async function handleExport() {
    setError(null);
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases don’t match.');
      return;
    }
    if (passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters.');
      return;
    }
    setPending(true);
    try {
      const result = await exportDeviceOnlyData(passphrase);
      if (result.status !== 'ok') {
        setError(`Could not export (${result.status}).`);
        return;
      }
      const blob = new Blob([JSON.stringify(result.file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `example-device-only-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Exported. Check your downloads.');
      reset();
    } catch {
      setError('Something went wrong exporting your data. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function handleImport() {
    if (!selectedFile) return;
    setError(null);
    setPending(true);
    try {
      let parsed: DeviceOnlyExportFile;
      try {
        parsed = JSON.parse(await selectedFile.text()) as DeviceOnlyExportFile;
      } catch {
        setError('That file doesn’t look like a Sovereign export.');
        return;
      }
      const result = await importDeviceOnlyData(parsed, passphrase);
      if (result.status === 'invalid-passphrase') {
        setError('Incorrect passphrase.');
        return;
      }
      if (result.status === 'invalid-file') {
        setError('That file doesn’t look like a Sovereign export.');
        return;
      }
      if (result.status !== 'ok') {
        setError(`Could not import (${result.status}).`);
        return;
      }
      setMessage(
        `Restored ${String(result.entryCount)} item${result.entryCount === 1 ? '' : 's'} across ${String(result.pluginCount)} app${result.pluginCount === 1 ? '' : 's'}.`,
      );
      reset();
      await onImported();
    } catch {
      setError('Something went wrong restoring your data. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (mode === 'idle') {
    return (
      <div className={styles.sessionBadge}>
        {message ?? 'Move this data to another device with an encrypted export file.'}
        <div className={styles.buttonRow}>
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode('export')}>
            Export data
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setMessage(null);
              setMode('import');
            }}
          >
            Import data
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'export') {
    return (
      <div className={styles.form}>
        <Input
          type="password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-label="Export passphrase"
        />
        <Input
          type="password"
          placeholder="Confirm passphrase"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          aria-label="Confirm export passphrase"
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttonRow}>
          <button type="button" onClick={reset} className={styles.deleteButton}>
            Cancel
          </button>
          <Button
            type="button"
            variant="primary"
            disabled={!passphrase || !confirmPassphrase || pending}
            onClick={() => void handleExport()}
          >
            {pending ? 'Exporting…' : 'Download export'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className={styles.hiddenInput}
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={styles.deleteButton}
      >
        {selectedFile ? selectedFile.name : 'Choose export file'}
      </button>
      <Input
        type="password"
        placeholder="Passphrase"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        aria-label="Import passphrase"
      />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={reset} className={styles.deleteButton}>
          Cancel
        </button>
        <Button
          type="button"
          variant="primary"
          disabled={!selectedFile || !passphrase || pending}
          onClick={() => void handleImport()}
        >
          {pending ? 'Restoring…' : 'Restore'}
        </Button>
      </div>
    </div>
  );
}
