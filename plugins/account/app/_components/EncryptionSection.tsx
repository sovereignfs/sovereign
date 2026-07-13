'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button, ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import type {
  E2eeDeviceEnrollment,
  E2eeProfile,
  E2eeRecoveryWrapper,
  E2eeState,
} from '@sovereignfs/sdk';
import {
  CMK_ALGORITHM,
  generateCmk,
  generateDeviceKey,
  generateRecoverySecret,
  unwrapCmkWithRecoverySecret,
  wrapCmkWithDeviceKey,
  wrapCmkWithRecoverySecret,
} from '@sovereignfs/sdk/e2ee-crypto';
import { getOrCreateDeviceId, storeDeviceKey } from '@sovereignfs/sdk/e2ee-device';
import { getE2eeLocalState } from '@sovereignfs/sdk/e2ee-state';
import { deviceHint } from '../_lib/device-hint';
import { enrollDeviceAction, revokeE2eeDeviceAction, setupE2eeAction } from '../actions';
import styles from '../account.module.css';

interface Props {
  initialProfile: E2eeProfile | null;
  initialRecoveryWrapper: E2eeRecoveryWrapper | null;
  initialDevices: E2eeDeviceEnrollment[];
}

/** `'checking'` is a local UI-only state before `getE2eeLocalState` resolves. */
type LocalState = 'checking' | E2eeState;
type View = 'idle' | 'setup-intro' | 'setup-secret' | 'unlock';

// ── Setup flow ────────────────────────────────────────────────────────────

function SetupFlow({
  onDone,
  onCancel,
}: {
  onDone: (devices: E2eeDeviceEnrollment[]) => void;
  onCancel: () => void;
}) {
  const [secret] = useState(() => generateRecoverySecret());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      try {
        const cmk = await generateCmk();
        const recoveryWrapper = await wrapCmkWithRecoverySecret(cmk, secret);
        const deviceId = getOrCreateDeviceId();
        const deviceKey = await generateDeviceKey();
        const deviceWrapped = await wrapCmkWithDeviceKey(cmk, deviceKey);
        const deviceLabel = deviceHint(navigator.userAgent);

        const result = await setupE2eeAction({
          cmkAlgorithm: CMK_ALGORITHM,
          recoveryWrapper,
          device: {
            deviceId,
            deviceLabel,
            wrappedCmk: deviceWrapped.wrappedCmk,
            algorithmVersion: deviceWrapped.algorithmVersion,
          },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await storeDeviceKey(deviceId, deviceKey);
        onDone([
          {
            id: deviceId,
            userId: '',
            deviceId,
            deviceLabel,
            wrappedCmk: deviceWrapped.wrappedCmk,
            algorithmVersion: deviceWrapped.algorithmVersion,
            createdAt: Math.floor(Date.now() / 1000),
            lastUsedAt: null,
            revokedAt: null,
          },
        ]);
      } catch {
        setError('Something went wrong setting up encryption. Please try again.');
      }
    });
  }

  return (
    <div className={styles.form}>
      <p className={styles.help}>
        Your recovery secret is the <strong>only</strong> way to unlock your encrypted data on a new
        device, or if this device is lost. Sovereign cannot recover it — record it somewhere safe
        before continuing.
      </p>
      <div className={styles.backupCodesBox}>
        <p className={styles.help}>Your recovery secret:</p>
        <ul className={styles.backupCodesList}>
          <li className={styles.backupCode}>
            <code>{secret}</code>
          </li>
        </ul>
      </div>
      <label className={styles.help}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.currentTarget.checked)}
        />{' '}
        I&rsquo;ve recorded my recovery secret somewhere safe.
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onCancel} className={styles.revokeButton}>
          Cancel
        </button>
        <Button type="button" disabled={!confirmed || pending} onClick={handleContinue}>
          {pending ? 'Setting up…' : 'Enable encryption'}
        </Button>
      </div>
    </div>
  );
}

// ── Unlock flow (this device has no local key yet) ──────────────────────

function UnlockFlow({
  recoveryWrapper,
  onDone,
  onCancel,
}: {
  recoveryWrapper: E2eeRecoveryWrapper;
  onDone: (device: E2eeDeviceEnrollment) => void;
  onCancel: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleUnlock() {
    setError(null);
    startTransition(async () => {
      let cmk;
      try {
        cmk = await unwrapCmkWithRecoverySecret(recoveryWrapper, secret);
      } catch {
        setError('Incorrect recovery secret.');
        return;
      }
      try {
        const deviceId = getOrCreateDeviceId();
        const deviceKey = await generateDeviceKey();
        const deviceWrapped = await wrapCmkWithDeviceKey(cmk, deviceKey);
        const deviceLabel = deviceHint(navigator.userAgent);

        const result = await enrollDeviceAction({
          deviceId,
          deviceLabel,
          wrappedCmk: deviceWrapped.wrappedCmk,
          algorithmVersion: deviceWrapped.algorithmVersion,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await storeDeviceKey(deviceId, deviceKey);
        onDone({
          id: deviceId,
          userId: '',
          deviceId,
          deviceLabel,
          wrappedCmk: deviceWrapped.wrappedCmk,
          algorithmVersion: deviceWrapped.algorithmVersion,
          createdAt: Math.floor(Date.now() / 1000),
          lastUsedAt: null,
          revokedAt: null,
        });
      } catch {
        setError('Something went wrong unlocking encryption on this device. Please try again.');
      }
    });
  }

  return (
    <div className={styles.form}>
      <p className={styles.help}>
        Enter your recovery secret to unlock encrypted data on this device.
      </p>
      <FormField label="Recovery secret" id="e2ee-recovery-secret" required>
        {(field) => (
          <Input
            {...field}
            value={secret}
            onChange={(e) => setSecret(e.currentTarget.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
          />
        )}
      </FormField>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onCancel} className={styles.revokeButton}>
          Cancel
        </button>
        <Button type="button" disabled={!secret || pending} onClick={handleUnlock}>
          {pending ? 'Unlocking…' : 'Unlock'}
        </Button>
      </div>
    </div>
  );
}

// ── Device list ───────────────────────────────────────────────────────────

function DeviceRow({
  device,
  isThisDevice,
  onRevoked,
}: {
  device: E2eeDeviceEnrollment;
  isThisDevice: boolean;
  onRevoked: (deviceId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeE2eeDeviceAction(device.id);
      setConfirmOpen(false);
      if (result.ok) onRevoked(device.id);
    });
  }

  return (
    <li className={styles.sessionRow}>
      <div className={styles.sessionInfo}>
        <span className={styles.sessionDevice}>{device.deviceLabel ?? 'Unknown device'}</span>
        <span className={styles.sessionMeta}>
          Enrolled {new Date(device.createdAt * 1000).toLocaleDateString()}
        </span>
      </div>
      {isThisDevice ? (
        <span className={styles.activeBadge}>
          <span className={styles.activeDot} aria-hidden="true" />
          This device
        </span>
      ) : (
        <>
          <button
            type="button"
            className={styles.revokeButton}
            onClick={() => setConfirmOpen(true)}
          >
            Revoke
          </button>
          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Revoke device"
            message="This device will no longer be able to unlock encrypted data without the recovery secret."
            confirmLabel={pending ? 'Revoking…' : 'Revoke'}
            destructive
            pending={pending}
            onConfirm={handleRevoke}
          />
        </>
      )}
    </li>
  );
}

// ── Main section ──────────────────────────────────────────────────────────

export function EncryptionSection({
  initialProfile,
  initialRecoveryWrapper,
  initialDevices,
}: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [recoveryWrapper] = useState(initialRecoveryWrapper);
  const [devices, setDevices] = useState(initialDevices);
  const [localState, setLocalState] = useState<LocalState>('checking');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [view, setView] = useState<View>('idle');

  useEffect(() => {
    let cancelled = false;
    void getE2eeLocalState(profile, devices).then((result) => {
      if (cancelled) return;
      setLocalState(result.state);
      setDeviceId(result.deviceId);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, devices]);

  if (localState === 'checking') return null;

  if (localState === 'unsupported') {
    return (
      <p className={styles.help}>
        Client-side encryption needs a modern browser (WebCrypto + IndexedDB support) and
        isn&rsquo;t available here.
      </p>
    );
  }

  if (view === 'setup-intro' || view === 'setup-secret') {
    return (
      <SetupFlow
        onCancel={() => setView('idle')}
        onDone={(newDevices) => {
          setProfile({
            id: 'local',
            userId: '',
            status: 'active',
            cmkAlgorithm: CMK_ALGORITHM,
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
          });
          setDevices(newDevices);
          setView('idle');
        }}
      />
    );
  }

  if (view === 'unlock' && recoveryWrapper) {
    return (
      <UnlockFlow
        recoveryWrapper={recoveryWrapper}
        onCancel={() => setView('idle')}
        onDone={(device) => {
          setDevices((prev) => [device, ...prev.filter((d) => d.deviceId !== device.deviceId)]);
          setView('idle');
        }}
      />
    );
  }

  if (localState === 'not-set-up') {
    return (
      <div className={styles.passkeySection}>
        <p className={styles.help}>
          Encrypt sensitive data client-side so it&rsquo;s unreadable to the operator or runtime —
          only you (and devices you enroll) can decrypt it.
        </p>
        <Button type="button" onClick={() => setView('setup-intro')}>
          Set up encryption
        </Button>
      </div>
    );
  }

  if (localState === 'locked') {
    return (
      <div className={styles.passkeySection}>
        <p className={styles.help}>
          Encryption is set up on your account, but this device hasn&rsquo;t been unlocked yet.
        </p>
        <Button type="button" onClick={() => setView('unlock')}>
          Unlock this device
        </Button>
      </div>
    );
  }

  // Unlocked — show status + device list.
  return (
    <div className={styles.passkeySection}>
      <div className={styles.totpCard}>
        <div className={styles.totpCardInfo}>
          <span className={styles.totpCardTitle}>Client-side encryption</span>
          <span className={styles.totpCardStatus}>Unlocked on this device</span>
        </div>
      </div>
      <ul className={styles.sessionGroup}>
        {devices
          .filter((d) => d.revokedAt === null)
          .map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              isThisDevice={device.deviceId === deviceId}
              onRevoked={(revokedDeviceId) =>
                setDevices((prev) => prev.filter((d) => d.deviceId !== revokedDeviceId))
              }
            />
          ))}
      </ul>
    </div>
  );
}
