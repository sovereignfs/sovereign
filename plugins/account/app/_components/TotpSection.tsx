'use client';

import { useActionState, useTransition, useState } from 'react';
import {
  type TotpEnableState,
  type TotpDisableState,
  type BackupCodesState,
  getTotpSetupAction,
  enableTotpAction,
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
      <button type="button" onClick={onDone} className={styles.button}>
        I&rsquo;ve saved my backup codes
      </button>
    </div>
  );
}

// ── Setup flow ────────────────────────────────────────────────────────────

interface UriData {
  totpURI: string;
  qrDataUrl: string;
  password: string;
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
          password: fd.get('password') as string,
        });
      } else {
        setError(result?.error ?? 'Failed to get setup URI.');
      }
    });
  }

  return (
    <form action={handleSubmit} className={styles.form}>
      <p className={styles.help}>
        Use an authenticator app to generate time-based one-time passwords for extra security.
      </p>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="totp-password">
          Confirm your password
        </label>
        <input
          id="totp-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={styles.input}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? 'Loading…' : 'Continue'}
      </button>
    </form>
  );
}

function EnableStep({
  qrDataUrl,
  totpURI,
  password,
  onEnabled,
  onBack,
}: UriData & { onEnabled: (codes: string[]) => void; onBack: () => void }) {
  const [state, formAction, pending] = useActionState<TotpEnableState, FormData>(
    enableTotpAction,
    null,
  );

  if (state?.ok) {
    onEnabled(state.backupCodes);
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
        <input type="hidden" name="password" value={password} />
        <p className={styles.help}>Once you&rsquo;ve scanned it, click Enable to activate TOTP.</p>
        {state?.ok === false && <p className={styles.error}>{state.error}</p>}
        <div className={styles.buttonRow}>
          <button type="button" onClick={onBack} className={styles.revokeButton}>
            Back
          </button>
          <button type="submit" className={styles.button} disabled={pending}>
            {pending ? 'Enabling…' : 'Enable TOTP'}
          </button>
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
      <div className={styles.field}>
        <label className={styles.label} htmlFor="disable-totp-password">
          Confirm your password
        </label>
        <input
          id="disable-totp-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={styles.input}
        />
      </div>
      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onBack} className={styles.revokeButton}>
          Cancel
        </button>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Disabling…' : 'Disable TOTP'}
        </button>
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
      <div className={styles.field}>
        <label className={styles.label} htmlFor="regen-password">
          Confirm your password
        </label>
        <input
          id="regen-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={styles.input}
        />
      </div>
      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      <div className={styles.buttonRow}>
        <button type="button" onClick={onBack} className={styles.revokeButton}>
          Cancel
        </button>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Generating…' : 'Regenerate backup codes'}
        </button>
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
  const [newCodes, setNewCodes] = useState<string[]>([]);

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
        {...uriData}
        onEnabled={(codes) => {
          setNewCodes(codes);
          setView('backup-codes');
        }}
        onBack={() => setView('get-uri')}
      />
    );
  }

  if (view === 'backup-codes') {
    return (
      <BackupCodesList
        codes={newCodes}
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

  // Idle — status card
  return (
    <div className={styles.totpStatus}>
      <p className={styles.readonlyValue}>
        Status:{' '}
        <span className={enabled ? styles.statusEnabled : styles.statusDisabled}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </p>
      {enabled ? (
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.revokeButton}
            onClick={() => setView('regen-codes')}
          >
            Regenerate backup codes
          </button>
          <button type="button" className={styles.revokeButton} onClick={() => setView('disable')}>
            Disable TOTP
          </button>
        </div>
      ) : (
        <button type="button" className={styles.button} onClick={() => setView('get-uri')}>
          Set up authenticator app
        </button>
      )}
    </div>
  );
}
