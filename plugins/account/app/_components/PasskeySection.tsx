'use client';

import { useActionState, useTransition, useState, useRef } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { Button, Dialog } from '@sovereignfs/ui';
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
      <div className={styles.passkeyIconWrap}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
          <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
          <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
          <path d="M2 12a10 10 0 0 1 18-6" />
          <path d="M2 16h.01" />
          <path d="M21.8 16c.2-2 .131-5.354.2-6" />
          <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
          <path d="M8.65 22c.21-.66.45-1.32.57-2" />
          <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
        </svg>
      </div>
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
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
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
    <div className={styles.passkeySection}>
      {passkeys.length > 0 && (
        <ul className={styles.sessionGroup}>
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
        className={styles.addPasskeyBtn}
        onClick={handleAddPasskey}
        disabled={addPending}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          width="14"
          height="14"
        >
          <line x1="12" x2="12" y1="5" y2="19" />
          <line x1="5" x2="19" y1="12" y2="12" />
        </svg>
        {addPending ? 'Registering…' : 'Add a passkey'}
      </button>
    </div>
  );
}
