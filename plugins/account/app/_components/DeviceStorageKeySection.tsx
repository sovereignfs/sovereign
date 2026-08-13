'use client';

import { useEffect, useState, useTransition } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { Button, ConfirmDialog, FormField, Select } from '@sovereignfs/ui';
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
type View = 'idle' | 'setup';

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
          it to encrypt what they save here. It isn&rsquo;t synced or backed up anywhere — set it up
          again separately on each device you use.
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
        Your recovery code is the <strong>only</strong> way to regain access if this device stops
        recognizing your fingerprint, face, or passcode — for example after a biometric reset.
        Sovereign cannot recover it for you — record it somewhere safe before continuing.
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

// ── Main section ──────────────────────────────────────────────────────────
//
// No server-side data to fetch: unlike RFC 0060's CMK, the Device Storage
// Key is never synced across devices (RFC 0093 §3) — setup state lives
// entirely in this device's OPFS, so there is no `initialProfile`-style prop
// and no server action for the core setup fact itself. Moving data to a new
// device is RFC 0093 §4's own export/import layer, not this key.

export function DeviceStorageKeySection() {
  const [localState, setLocalState] = useState<LocalState>('checking');
  const [view, setView] = useState<View>('idle');
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetPending, startForget] = useTransition();
  const [checkAgainPending, startCheckAgain] = useTransition();

  async function refreshLocalState() {
    setLocalState(await getDeviceStorageKeyStatus());
  }

  useEffect(() => {
    void refreshLocalState();
  }, []);

  function handleForget() {
    startForget(async () => {
      await clearWrappedDeviceStorageKeys();
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
