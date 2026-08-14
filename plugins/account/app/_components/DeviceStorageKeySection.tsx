'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { Button, ConfirmDialog, FormField, Input, Select } from '@sovereignfs/ui';
import { secureStorage, supports } from '@sovereignfs/sdk/device-client';
import {
  deriveDeviceOnlyKeyViaPrf,
  fromBase64Url,
  generateDeviceStorageKey,
  generateRecoverySecret,
  toBase64Url,
  wrapDeviceStorageKeyWithPrfKey,
  wrapDeviceStorageKeyWithRecoverySecret,
} from '@sovereignfs/sdk/device-only-crypto';
import {
  clearWrappedDeviceStorageKeys,
  getDeviceStorageKeyStatus,
  loadReLockPolicy,
  requestPersistentStorage,
  saveReLockPolicy,
  saveWrappedDeviceStorageKeys,
} from '@sovereignfs/sdk/device-only-storage';
import { lockDeviceStorageKey } from '@sovereignfs/sdk/device-only-session';
import { exportDeviceOnlyData, importDeviceOnlyData } from '@sovereignfs/sdk/device-only-export';
import type {
  DeviceOnlyExportFile,
  DeviceOnlyExportResult,
  DeviceOnlyImportResult,
} from '@sovereignfs/sdk/device-only-export';
import type { DeviceStorageKeyStatus, ReLockPolicy } from '@sovereignfs/sdk/device-only-storage';
import styles from '../account.module.css';

const RE_LOCK_POLICY_LABELS: Record<ReLockPolicy, string> = {
  immediate: 'Immediately',
  '1m': 'After 1 minute',
  '5m': 'After 5 minutes',
  '15m': 'After 15 minutes',
  '1h': 'After 1 hour',
};
const RE_LOCK_POLICY_OPTIONS: ReLockPolicy[] = ['immediate', '1m', '5m', '15m', '1h'];

/** `'checking'` is a local UI-only state before `getDeviceStorageKeyStatus` resolves — same pattern as EncryptionSection's own `LocalState`. */
type LocalState = 'checking' | DeviceStorageKeyStatus;
type View = 'idle' | 'setup' | 'export' | 'import';

/**
 * Every export/import failure mode short of the two import-specific ones
 * (`invalid-passphrase`/`invalid-file`) is one of `getUnlockedDeviceStorageKey()`'s
 * own non-`'ok'` statuses, re-surfaced unchanged by both
 * `exportDeviceOnlyData`/`importDeviceOnlyData` — see their own doc
 * comments in `device-only-export.ts`. Shared here rather than duplicated
 * per flow.
 */
function unlockFailureMessage(
  status: 'unsupported' | 'no-device-auth' | 'not-set-up' | 'cancelled' | 'failed',
  error?: string,
): string {
  if (status === 'cancelled') return 'Cancelled.';
  if (status === 'failed') return error ?? 'Something went wrong. Please try again.';
  return 'Device Storage Key isn’t available right now — check its status above and try again.';
}

interface PendingSetup {
  secret: string;
  prfWrapped: Awaited<ReturnType<typeof wrapDeviceStorageKeyWithPrfKey>>;
  prfCredentialId: string;
  recoveryWrapped: Awaited<ReturnType<typeof wrapDeviceStorageKeyWithRecoverySecret>>;
}

// ── Setup flow ────────────────────────────────────────────────────────────
//
// Two steps, deliberately separated: step 1 runs the live WebAuthn ceremony
// (the passkey registration prompt) and does all the crypto, holding the
// result only in React state. Step 2 shows the recovery code and persists to
// OPFS only after the user confirms they've saved it. Nothing is written to
// disk until that final confirmation — closing the tab after step 1 leaves
// no half-set-up state behind.

function SetupFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [setup, setSetup] = useState<PendingSetup | null>(null);

  const [client] = useState(() =>
    createAuthClient({
      plugins: [
        // Cast to silence the minor peer-version type mismatch between
        // @better-auth/passkey and better-auth (runtime-compatible) — same
        // cast PasskeySection.tsx already uses for the identical call.
        passkeyClient() as unknown as BetterAuthClientPlugin,
      ],
    }),
  );

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      try {
        // A new passkey, registered with the PRF extension explicitly
        // requested rather than assuming an existing login passkey supports
        // it (RFC 0093 §2, epic task 1.22) — most authenticators only
        // report PRF support at creation time, not retroactively on one
        // that predates the request.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches PasskeySection.tsx's cast for the same untyped plugin surface
        const result = await (client as any).passkey.addPasskey({
          name: `Device Storage Key — ${new Date().toLocaleDateString()}`,
          authenticatorAttachment: 'platform',
          extensions: { prf: {} },
          returnWebAuthnResponse: true,
        });
        if (result?.error) {
          setError(result.error.message ?? 'Failed to set up this device. Please try again.');
          return;
        }
        const clientExtensionResults = result?.webauthn?.clientExtensionResults as
          { prf?: { enabled?: boolean } } | undefined;
        if (!clientExtensionResults?.prf?.enabled) {
          setError(
            'This browser or device doesn’t support the security feature Device Storage Key needs (WebAuthn PRF). Try a recent version of Chrome, Edge, or Safari — or use the native app.',
          );
          return;
        }
        const rawId = result?.webauthn?.response?.rawId as string | undefined;
        if (!rawId) {
          setError('Something went wrong setting up this device. Please try again.');
          return;
        }

        const credentialIdBytes = fromBase64Url(rawId);
        const prfResult = await deriveDeviceOnlyKeyViaPrf(credentialIdBytes);
        if (prfResult.status !== 'ok') {
          setError('Something went wrong setting up this device. Please try again.');
          return;
        }

        const deviceStorageKey = await generateDeviceStorageKey();
        const prfWrapped = await wrapDeviceStorageKeyWithPrfKey(deviceStorageKey, prfResult.key);
        const secret = generateRecoverySecret();
        const recoveryWrapped = await wrapDeviceStorageKeyWithRecoverySecret(
          deviceStorageKey,
          secret,
        );

        setSetup({
          secret,
          prfWrapped,
          prfCredentialId: toBase64Url(credentialIdBytes),
          recoveryWrapped,
        });
        setStep('confirm');
      } catch {
        setError('Something went wrong setting up this device. Please try again.');
      }
    });
  }

  function handleFinish() {
    if (!setup) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveWrappedDeviceStorageKeys({
          prfWrapped: setup.prfWrapped,
          prfCredentialId: setup.prfCredentialId,
          recoveryWrapped: setup.recoveryWrapped,
        });
        // Best-effort — the browser may deny the request (RFC 0093 §6); the
        // status page's own probe re-checks and this never blocks setup.
        await requestPersistentStorage();
        onDone();
      } catch {
        setError('Something went wrong saving your Device Storage Key. Please try again.');
      }
    });
  }

  if (step === 'register') {
    return (
      <div className={styles.form}>
        <p className={styles.help}>
          Sets up a security key on <strong>this device only</strong>, protected by your
          fingerprint, face, or device passcode. Apps that keep their data only on this device use
          it to encrypt what they save here — that data lives exclusively on this device and is
          never sent to Sovereign&rsquo;s server. If this device is lost, stolen, or wiped and you
          don&rsquo;t have your recovery code,{' '}
          <strong>that data is gone permanently — there is no other way to get it back</strong>.
          You&rsquo;ll get a recovery code in the next step; set up your own key again separately on
          each device you use.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttonRow}>
          <button type="button" onClick={onCancel} className={styles.revokeButton}>
            Cancel
          </button>
          <Button type="button" disabled={pending} onClick={handleRegister}>
            {pending ? 'Setting up…' : 'Continue'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <p className={styles.help}>
        Your recovery code is the <strong>only</strong> way to regain access to this device&rsquo;s
        data — whether this device stops recognizing your fingerprint, face, or passcode (for
        example after a biometric reset), or the device itself is lost, stolen, or wiped. Sovereign
        cannot recover it for you, and there is no other backup: without this code, that loss is{' '}
        <strong>permanent</strong>. Record it somewhere safe before continuing.
      </p>
      <div className={styles.backupCodesBox}>
        <p className={styles.help}>Your recovery code:</p>
        <ul className={styles.backupCodesList}>
          <li className={styles.backupCode}>
            <code>{setup?.secret}</code>
          </li>
        </ul>
      </div>
      <label className={styles.help}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.currentTarget.checked)}
        />{' '}
        I&rsquo;ve recorded my recovery code somewhere safe.
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onCancel} className={styles.revokeButton}>
          Cancel
        </button>
        <Button type="button" disabled={!confirmed || pending} onClick={handleFinish}>
          {pending ? 'Finishing…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  );
}

// ── Auto-lock ─────────────────────────────────────────────────────────────
//
// Saves on change, no separate "Save" button — matches how a Toggle or other
// live settings control behaves elsewhere in Account. Optimistic: the select
// reflects the new choice immediately and only reverts if the save itself
// fails, so a slow OPFS write never makes the control feel laggy.

function AutoLockControl() {
  const [policy, setPolicy] = useState<ReLockPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void loadReLockPolicy().then(setPolicy);
  }, []);

  function handleChange(next: ReLockPolicy) {
    const previous = policy;
    setError(null);
    setPolicy(next);
    startTransition(async () => {
      try {
        await saveReLockPolicy(next);
      } catch {
        setPolicy(previous);
        setError('Something went wrong saving this setting. Please try again.');
      }
    });
  }

  if (policy === null) return null;

  return (
    <FormField
      label="Auto-lock"
      id="device-storage-key-auto-lock"
      hint="How long these apps can be away from you before they need your fingerprint, face, or passcode again."
      error={error ?? undefined}
    >
      {(field) => (
        <Select
          {...field}
          value={policy}
          disabled={pending}
          onChange={(e) => handleChange(e.currentTarget.value as ReLockPolicy)}
        >
          {RE_LOCK_POLICY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {RE_LOCK_POLICY_LABELS[option]}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}

// ── Export ────────────────────────────────────────────────────────────────
//
// RFC 0093 §4 Layer 2 — the always-available, no-server floor for moving
// device-only data to a new device or just having a backup. Passphrase is
// user-chosen here (unlike the machine-generated recovery code above), so it
// is typed twice to catch mistakes before the file is unusable.

function ExportFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleExport() {
    setError(null);
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases don’t match.');
      return;
    }
    if (passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters.');
      return;
    }
    startTransition(async () => {
      try {
        const result: DeviceOnlyExportResult = await exportDeviceOnlyData(passphrase);
        if (result.status !== 'ok') {
          setError(
            unlockFailureMessage(
              result.status,
              result.status === 'failed' ? result.error : undefined,
            ),
          );
          return;
        }
        downloadExportFile(result.file);
        onDone();
      } catch {
        setError('Something went wrong exporting your data. Please try again.');
      }
    });
  }

  return (
    <div className={styles.form}>
      <p className={styles.help}>
        Downloads a single encrypted file with every app&rsquo;s data that lives only on this
        device. Choose a passphrase to protect it — you&rsquo;ll need the same passphrase to restore
        it on another device. Sovereign doesn&rsquo;t store this passphrase and can&rsquo;t recover
        it for you if you lose it.
      </p>
      <FormField label="Passphrase" id="device-only-export-passphrase" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.currentTarget.value)}
            autoComplete="new-password"
          />
        )}
      </FormField>
      <FormField label="Confirm passphrase" id="device-only-export-passphrase-confirm" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.currentTarget.value)}
            autoComplete="new-password"
          />
        )}
      </FormField>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onCancel} className={styles.revokeButton}>
          Cancel
        </button>
        <Button
          type="button"
          disabled={!passphrase || !confirmPassphrase || pending}
          onClick={handleExport}
        >
          {pending ? 'Exporting…' : 'Download export'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Matches `PortabilityPanel.tsx`'s own download pattern (RFC 0007) exactly —
 * the anchor must be attached to the document before `.click()` for some
 * browsers to honor `download`, not just constructed in memory.
 */
function downloadExportFile(file: DeviceOnlyExportFile): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sovereign-device-only-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────
//
// Restores a file from `ExportFlow` (this device or another) into this
// device's own store, re-encrypted under this device's own unlocked key —
// `importDeviceOnlyData` never copies ciphertext across devices, see its own
// doc comment. A full restore, not a merge: an existing value under the same
// app/item name on this device is overwritten.

function ImportFlow({
  onDone,
  onCancel,
}: {
  onDone: (summary: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImport() {
    if (!selectedFile) return;
    setError(null);
    startTransition(async () => {
      let parsed: DeviceOnlyExportFile;
      try {
        parsed = JSON.parse(await selectedFile.text()) as DeviceOnlyExportFile;
      } catch {
        setError('That file doesn’t look like a Sovereign export.');
        return;
      }
      try {
        const result: DeviceOnlyImportResult = await importDeviceOnlyData(parsed, passphrase);
        if (result.status === 'invalid-passphrase') {
          setError('Incorrect passphrase.');
          return;
        }
        if (result.status === 'invalid-file') {
          setError('That file doesn’t look like a Sovereign export.');
          return;
        }
        if (result.status !== 'ok') {
          setError(
            unlockFailureMessage(
              result.status,
              result.status === 'failed' ? result.error : undefined,
            ),
          );
          return;
        }
        onDone(
          `Restored ${String(result.entryCount)} item${result.entryCount === 1 ? '' : 's'} across ${String(result.pluginCount)} app${result.pluginCount === 1 ? '' : 's'}.`,
        );
      } catch {
        setError('Something went wrong restoring your data. Please try again.');
      }
    });
  }

  return (
    <div className={styles.form}>
      <p className={styles.help}>
        Restores data from an export file onto this device. This replaces any existing data under
        the same app and item name on this device.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className={styles.hiddenInput}
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className={styles.revokeButton}
        onClick={() => inputRef.current?.click()}
      >
        {selectedFile ? selectedFile.name : 'Choose export file'}
      </button>
      <FormField label="Passphrase" id="device-only-import-passphrase" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.currentTarget.value)}
            autoComplete="off"
          />
        )}
      </FormField>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onCancel} className={styles.revokeButton}>
          Cancel
        </button>
        <Button
          type="button"
          disabled={!selectedFile || !passphrase || pending}
          onClick={handleImport}
        >
          {pending ? 'Restoring…' : 'Restore'}
        </Button>
      </div>
    </div>
  );
}

// ── Native (Capacitor) ────────────────────────────────────────────────────
//
// The `secureStorage` bridge capability (sovereign-mobile's
// `SecureDatabase.swift`/`SecureDatabase.java`) already gates every
// operation behind the device's own biometric-or-passcode prompt and
// auto-generates its own Keychain/Keystore-held database key on first use —
// there is no separate JS-side enrollment ceremony to run here the way the
// web/PWA flow below needs (no WebAuthn PRF, no wrapped-key storage,
// nothing to "set up" from this component's perspective). This section's
// job on native is narrower: explain that, and offer a real round-trip
// through the bridge so a user (or tester) can confirm it actually works,
// surfacing the device's real state — including RFC 0093 §5's
// no-device-auth hard block — rather than precomputing it. There is no
// cheap, no-prompt status check to run eagerly on mount the way the web
// path's `getDeviceStorageKeyStatus()` has: every native `secureStorage`
// operation needs the database open, unlike the old per-item Keychain
// scheme where a read of a nonexistent key never touched the OS prompt.
//
// Auto-lock and export/import are deliberately not offered here. The
// re-lock window is currently fixed native-side
// (`SecureStorage.swift`/`SecureStorage.java`'s own 300s constant, not yet
// wired to this section's saved policy — see sovereign-mobile's
// `docs/epics/bridge.md` task 20.13 follow-up note), and
// `device-only-export.ts`/`device-only-kv.ts` are themselves OPFS-only
// today — neither reads or writes through the native `secureStorage`
// bridge, so showing either control here would offer a setting or an
// export that silently does nothing.

const NATIVE_VERIFY_PLUGIN_ID = 'fs.sovereign.account';
const NATIVE_VERIFY_KEY = 'device-storage-key-verify';

type NativeVerifyState = 'idle' | 'pending' | 'ok' | 'no-device-auth' | 'dismissed' | 'failed';

function NativeDeviceStorageKeySection() {
  const [state, setState] = useState<NativeVerifyState>('idle');
  const [error, setError] = useState<string | null>(null);

  function handleVerify() {
    setState('pending');
    setError(null);
    void (async () => {
      const probeValue = Date.now();
      const writeResult = await secureStorage.set(
        NATIVE_VERIFY_PLUGIN_ID,
        NATIVE_VERIFY_KEY,
        probeValue,
      );
      switch (writeResult.status) {
        case 'unavailable':
          setState('no-device-auth');
          return;
        case 'dismissed':
          setState('dismissed');
          return;
        case 'denied':
        case 'failed':
          setState('failed');
          setError(writeResult.status === 'failed' ? writeResult.error : null);
          return;
        case 'ok':
          break;
      }

      const readResult = await secureStorage.get<number>(
        NATIVE_VERIFY_PLUGIN_ID,
        NATIVE_VERIFY_KEY,
      );
      switch (readResult.status) {
        case 'unavailable':
          setState('no-device-auth');
          return;
        case 'dismissed':
          setState('dismissed');
          return;
        case 'denied':
        case 'failed':
          setState('failed');
          setError(readResult.status === 'failed' ? readResult.error : null);
          return;
        case 'ok':
          if (readResult.value === probeValue) {
            setState('ok');
          } else {
            setState('failed');
            setError('Wrote successfully but could not read the value back correctly.');
          }
          return;
      }
    })();
  }

  return (
    <div className={styles.passkeySection}>
      <p className={styles.help}>
        Unlocks apps that keep their data only on this device — no server copy, nothing to sync. On
        the native app this is handled automatically by your device&rsquo;s own passcode,
        fingerprint, or face unlock; there is nothing to set up here.
      </p>
      {state === 'ok' && (
        <p className={styles.success}>
          Verified — your device&rsquo;s passcode, fingerprint, or face unlock works for apps that
          keep data only on this device.
        </p>
      )}
      {state === 'no-device-auth' && (
        <p className={styles.help}>
          This device has no passcode, fingerprint, or face unlock set up — Sovereign can&rsquo;t
          protect on-device data without it. Set one up in your device&rsquo;s system settings, then
          try again.
        </p>
      )}
      {state === 'dismissed' && <p className={styles.help}>Cancelled.</p>}
      {state === 'failed' && (
        <p className={styles.error}>{error ?? 'Something went wrong. Please try again.'}</p>
      )}
      <button
        type="button"
        className={styles.revokeButton}
        disabled={state === 'pending'}
        onClick={handleVerify}
      >
        {state === 'pending' ? 'Checking…' : 'Verify it works'}
      </button>
    </div>
  );
}

// ── Web/PWA main section ─────────────────────────────────────────────────
//
// No server-side data to fetch: unlike RFC 0060's CMK, the Device Storage
// Key is never synced across devices (RFC 0093 §3) — setup state lives
// entirely in this device's OPFS, so there is no `initialProfile`-style prop
// and no server action for the core setup fact itself. Moving data to a new
// device is RFC 0093 §4's own export/import layer, not this key.

function WebDeviceStorageKeySection() {
  const [localState, setLocalState] = useState<LocalState>('checking');
  const [view, setView] = useState<View>('idle');
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetPending, startForget] = useTransition();
  const [checkAgainPending, startCheckAgain] = useTransition();
  const [importSummary, setImportSummary] = useState<string | null>(null);

  async function refreshLocalState() {
    setLocalState(await getDeviceStorageKeyStatus());
  }

  useEffect(() => {
    void refreshLocalState();
  }, []);

  function handleForget() {
    startForget(async () => {
      await clearWrappedDeviceStorageKeys();
      lockDeviceStorageKey();
      setForgetOpen(false);
      await refreshLocalState();
    });
  }

  if (localState === 'checking') return null;

  if (localState === 'unsupported') {
    return (
      <p className={styles.help}>
        Device Storage Key needs a modern browser (WebAuthn PRF and Origin Private File System
        support) and isn&rsquo;t available here. Use the native app instead.
      </p>
    );
  }

  if (localState === 'no-device-auth') {
    return (
      <div className={styles.passkeySection}>
        <p className={styles.help}>
          Device Storage Key needs a passcode, fingerprint, or face unlock set up on this device —
          Sovereign can&rsquo;t create one without it. Set one up in your device&rsquo;s system
          settings, then come back.
        </p>
        <button
          type="button"
          className={styles.revokeButton}
          disabled={checkAgainPending}
          onClick={() => startCheckAgain(refreshLocalState)}
        >
          {checkAgainPending ? 'Checking…' : 'Check again'}
        </button>
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <SetupFlow
        onCancel={() => setView('idle')}
        onDone={() => {
          setView('idle');
          void refreshLocalState();
        }}
      />
    );
  }

  if (view === 'export') {
    return <ExportFlow onCancel={() => setView('idle')} onDone={() => setView('idle')} />;
  }

  if (view === 'import') {
    return (
      <ImportFlow
        onCancel={() => setView('idle')}
        onDone={(summary) => {
          setImportSummary(summary);
          setView('idle');
        }}
      />
    );
  }

  if (localState === 'not-set-up') {
    return (
      <div className={styles.passkeySection}>
        <p className={styles.help}>
          Set up once to unlock apps that keep their data only on this device — no server copy,
          nothing to sync.
        </p>
        <Button type="button" onClick={() => setView('setup')}>
          Set up Device Storage Key
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.passkeySection}>
      <div className={styles.totpCard}>
        <div className={styles.totpCardInfo}>
          <span className={styles.totpCardTitle}>Device Storage Key</span>
          <span className={styles.totpCardStatus}>Set up on this device</span>
        </div>
        <button type="button" className={styles.revokeButton} onClick={() => setForgetOpen(true)}>
          Forget
        </button>
      </div>
      <AutoLockControl />
      {importSummary && <p className={styles.success}>{importSummary}</p>}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.revokeButton} onClick={() => setView('export')}>
          Export data
        </button>
        <button
          type="button"
          className={styles.revokeButton}
          onClick={() => {
            setImportSummary(null);
            setView('import');
          }}
        >
          Import data
        </button>
      </div>
      <ConfirmDialog
        open={forgetOpen}
        onClose={() => setForgetOpen(false)}
        title="Forget Device Storage Key"
        message="Apps that keep their data only on this device will no longer be able to unlock it here, unless you still have your recovery code. This doesn’t affect any other device."
        confirmLabel={forgetPending ? 'Forgetting…' : 'Forget'}
        destructive
        pending={forgetPending}
        onConfirm={handleForget}
      />
    </div>
  );
}

// ── Transport dispatch ───────────────────────────────────────────────────
//
// The one thing every render path here needs to get right before anything
// else: which of the two independent `device-only` backends (RFC 0093 §1)
// this surface is actually running against. `supports('secureStorage')` is
// the same check `isDeviceOnlyTierAvailable()` uses for the native half —
// checked here directly, rather than inferring it from `getTransport()`'s
// coarser platform value, so this stays correct if a future shell (desktop)
// ever implements the same bridge capability. A native shell never has the
// web/PWA backend simultaneously (WebAuthn PRF + OPFS support is
// irrelevant inside a Capacitor WebView even where present), so this is a
// strict either/or, not a preference order.
//
// Deferred to a mount-time effect, not read directly in render — this
// package's own hard rule against reading browser/bridge globals during
// render (matching `useDeviceEnvironment()`'s identical `null`-until-mount
// pattern above) applies to the bridge handshake the same way it does to
// `navigator`/`window`.

export function DeviceStorageKeySection() {
  const [nativeSecureStorage, setNativeSecureStorage] = useState<boolean | null>(null);

  useEffect(() => {
    setNativeSecureStorage(supports('secureStorage'));
  }, []);

  if (nativeSecureStorage === null) return null;
  if (nativeSecureStorage) return <NativeDeviceStorageKeySection />;
  return <WebDeviceStorageKeySection />;
}
