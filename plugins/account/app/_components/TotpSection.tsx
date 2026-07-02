'use client';

import { useActionState, useTransition, useState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import {
  type TotpVerifyState,
  type TotpDisableState,
  type BackupCodesState,
  getTotpSetupAction,
  verifyTotpEnrollmentAction,
  disableTotpAction,
  regenerateBackupCodesAction,
} from '../actions';
import styles from '../account.module.css';

function BackupCodesList({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className={styles.backupCodesBox}>
      <p className={styles.help}>
        Save these backup codes somewhere safe. Each code can only be used once. You cannot view
        them again after dismissing this screen.
      </p>
      <ul className={styles.backupCodesList}>
        {codes.map((c) => (
          <li key={c} className={styles.backupCode}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <Button type="button" onClick={onDone}>
        I&rsquo;ve saved my backup codes
      </Button>
    </div>
  );
}

// ── Setup flow ────────────────────────────────────────────────────────────

interface UriData {
  totpURI: string;
  qrDataUrl: string;
  backupCodes: string[];
}

function GetUriStep({ onUri }: { onUri: (data: UriData) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await getTotpSetupAction(null, fd);
      if (result?.ok) {
        onUri({
          totpURI: result.totpURI,
          qrDataUrl: result.qrDataUrl,
          backupCodes: result.backupCodes,
        });
      } else {
        setError(result?.error ?? 'Failed to start TOTP setup.');
      }
    });
  }

  return (
    <form action={handleSubmit} className={styles.form}>
      <p className={styles.help}>
        Use an authenticator app to generate time-based one-time passwords for extra security.
      </p>
      <FormField label="Confirm your password" id="totp-password" required>
        {(field) => (
          <Input {...field} name="password" type="password" autoComplete="current-password" />
        )}
      </FormField>
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Loading…' : 'Continue'}
      </Button>
    </form>
  );
}

function EnableStep({
  qrDataUrl,
  totpURI,
  onEnabled,
  onBack,
}: {
  qrDataUrl: string;
  totpURI: string;
  onEnabled: () => void;
  onBack: () => void;
}) {
  const [state, formAction, pending] = useActionState<TotpVerifyState, FormData>(
    verifyTotpEnrollmentAction,
    null,
  );

  if (state?.ok) {
    onEnabled();
    return null;
  }

  return (
    <div className={styles.totpQrBox}>
      <p className={styles.help}>
        Scan this QR code with your authenticator app (e.g. Authy, Google Authenticator, 1Password).
      </p>
      <img
        src={qrDataUrl}
        alt="TOTP QR code — scan with your authenticator app"
        width={200}
        height={200}
      />
      <details className={styles.totpUriDetails}>
        <summary className={styles.help}>Can&rsquo;t scan? Copy the setup key</summary>
        <code className={styles.totpUri}>{totpURI}</code>
      </details>
      <form action={formAction} className={styles.form}>
        <FormField
          label="Enter the 6-digit code from your app to confirm"
          id="totp-verify-code"
          required
        >
          {(field) => (
            <Input
              {...field}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
            />
          )}
        </FormField>
        {state?.ok === false && <p className={styles.error}>{state.error}</p>}
        <div className={styles.buttonRow}>
          <button type="button" onClick={onBack} className={styles.revokeButton}>
            Back
          </button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Verifying…' : 'Enable TOTP'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Disable flow ──────────────────────────────────────────────────────────

function DisableForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [state, formAction, pending] = useActionState<TotpDisableState, FormData>(
    disableTotpAction,
    null,
  );

  if (state?.ok) {
    onDone();
    return null;
  }

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.help}>
        Disabling TOTP removes your authenticator app link. You will need to re-enroll to use it
        again.
      </p>
      <FormField label="Confirm your password" id="disable-totp-password" required>
        {(field) => (
          <Input {...field} name="password" type="password" autoComplete="current-password" />
        )}
      </FormField>
      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onBack} className={styles.revokeButton}>
          Cancel
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Disabling…' : 'Disable TOTP'}
        </Button>
      </div>
    </form>
  );
}

// ── Regenerate backup codes ───────────────────────────────────────────────

function RegenerateCodesForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, pending] = useActionState<BackupCodesState, FormData>(
    regenerateBackupCodesAction,
    null,
  );

  if (state?.ok) {
    return <BackupCodesList codes={state.codes} onDone={onBack} />;
  }

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.help}>Generating new backup codes will invalidate all existing ones.</p>
      <FormField label="Confirm your password" id="regen-password" required>
        {(field) => (
          <Input {...field} name="password" type="password" autoComplete="current-password" />
        )}
      </FormField>
      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onBack} className={styles.revokeButton}>
          Cancel
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Generating…' : 'Regenerate backup codes'}
        </Button>
      </div>
    </form>
  );
}

// ── Main TotpSection ──────────────────────────────────────────────────────

type View = 'idle' | 'get-uri' | 'enable' | 'backup-codes' | 'disable' | 'regen-codes';

export function TotpSection({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [view, setView] = useState<View>('idle');
  const [uriData, setUriData] = useState<UriData | null>(null);

  if (view === 'get-uri') {
    return (
      <GetUriStep
        onUri={(data) => {
          setUriData(data);
          setView('enable');
        }}
      />
    );
  }

  if (view === 'enable' && uriData) {
    return (
      <EnableStep
        qrDataUrl={uriData.qrDataUrl}
        totpURI={uriData.totpURI}
        onEnabled={() => {
          setView('backup-codes');
        }}
        onBack={() => setView('get-uri')}
      />
    );
  }

  if (view === 'backup-codes' && uriData) {
    return (
      <BackupCodesList
        codes={uriData.backupCodes}
        onDone={() => {
          setEnabled(true);
          setView('idle');
        }}
      />
    );
  }

  if (view === 'disable') {
    return (
      <DisableForm
        onDone={() => {
          setEnabled(false);
          setView('idle');
        }}
        onBack={() => setView('idle')}
      />
    );
  }

  if (view === 'regen-codes') {
    return <RegenerateCodesForm onBack={() => setView('idle')} />;
  }

  // Idle — toggle card + optional backup codes button below
  return (
    <div className={styles.passkeySection}>
      <div className={styles.totpCard}>
        <div className={styles.totpCardInfo}>
          <span className={styles.totpCardTitle}>Authenticator app</span>
          <span className={styles.totpCardStatus}>{enabled ? 'Configured' : 'Not configured'}</span>
        </div>
        <div className={styles.totpCardActions}>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
            onClick={() => setView(enabled ? 'disable' : 'get-uri')}
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
      </div>
      {enabled && (
        <button
          type="button"
          className={styles.addPasskeyBtn}
          onClick={() => setView('regen-codes')}
        >
          Backup codes
        </button>
      )}
    </div>
  );
}
