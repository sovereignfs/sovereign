'use client';

import { useActionState, useTransition, useState, useRef } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { Dialog } from '@sovereignfs/ui';
import { type PasskeyDeleteState, deletePasskeyAction } from '../actions';
import styles from '../account.module.css';

interface PasskeyEntry {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  deviceType?: string | null;
  aaguid?: string | null;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function PasskeyRow({ passkey, onRemoved }: { passkey: PasskeyEntry; onRemoved: () => void }) {
  const [state, formAction, pending] = useActionState<PasskeyDeleteState, FormData>(
    deletePasskeyAction,
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (state?.ok) {
    onRemoved();
    return null;
  }

  return (
    <li className={styles.sessionRow}>
      <div className={styles.sessionInfo}>
        <span className={styles.sessionDevice}>{passkey.name ?? 'Unnamed passkey'}</span>
        <span className={styles.sessionMeta}>Added {formatDate(passkey.createdAt)}</span>
        {state?.ok === false && <span className={styles.error}>{state.error}</span>}
      </div>
      <button
        type="button"
        className={styles.revokeButton}
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? 'Removing…' : 'Remove'}
      </button>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        aria-label="Remove passkey"
      >
        <div className={styles.confirmDialog}>
          <h2 className={styles.confirmTitle}>Remove passkey</h2>
          <p className={styles.confirmMessage}>
            Remove &ldquo;{passkey.name ?? 'Unnamed passkey'}&rdquo;? You will no longer be able to
            sign in with this passkey.
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => {
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      </Dialog>
      <form ref={formRef} action={formAction} style={{ display: 'none' }}>
        <input type="hidden" name="id" value={passkey.id} />
      </form>
    </li>
  );
}

export function PasskeySection({ initialPasskeys }: { initialPasskeys: PasskeyEntry[] }) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  // Auth client with no baseURL so it calls the same-origin runtime, which
  // proxies /api/auth/passkey/* to the auth server server-side. This avoids
  // cross-origin issues: SameSite=Lax session cookies are not sent by the
  // browser on cross-origin fetch requests.
  const [client] = useState(() =>
    createAuthClient({
      plugins: [
        // Cast to silence the minor peer-version type mismatch between
        // @better-auth/passkey and better-auth (runtime-compatible).
        passkeyClient() as unknown as BetterAuthClientPlugin,
      ],
    }),
  );

  function handleAddPasskey() {
    setAddError(null);
    startAdd(async () => {
      const name = `Passkey — ${new Date().toLocaleDateString()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (client as any).passkey.addPasskey({ name });
      if (result?.error) {
        setAddError(result.error.message ?? 'Failed to register passkey.');
        return;
      }
      // Refresh the passkey list from the runtime proxy route.
      const res = await fetch('/api/account/passkeys');
      if (res.ok) {
        setPasskeys((await res.json()) as PasskeyEntry[]);
      }
    });
  }

  return (
    <div className={styles.form}>
      {passkeys.length === 0 ? (
        <p className={styles.help}>No passkeys registered yet.</p>
      ) : (
        <ul className={styles.sessionList}>
          {passkeys.map((pk) => (
            <PasskeyRow
              key={pk.id}
              passkey={pk}
              onRemoved={() => setPasskeys((prev) => prev.filter((p) => p.id !== pk.id))}
            />
          ))}
        </ul>
      )}
      {addError && <p className={styles.error}>{addError}</p>}
      <button
        type="button"
        className={styles.button}
        onClick={handleAddPasskey}
        disabled={addPending}
      >
        {addPending ? 'Registering…' : 'Add a passkey'}
      </button>
      <p className={styles.help}>
        Passkeys use your device&rsquo;s biometrics (Face ID, Touch ID, Windows Hello) or a hardware
        security key to sign in without a password.
      </p>
    </div>
  );
}
