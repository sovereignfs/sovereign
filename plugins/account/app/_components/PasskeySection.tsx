'use client';

import { useActionState, useTransition, useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
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
      <form action={formAction}>
        <input type="hidden" name="id" value={passkey.id} />
        <button type="submit" className={styles.revokeButton} disabled={pending}>
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </form>
    </li>
  );
}

export function PasskeySection({
  initialPasskeys,
  authPublicUrl,
}: {
  initialPasskeys: PasskeyEntry[];
  authPublicUrl: string;
}) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  // Auth client pointed at the auth server's public URL (RFC 0012). Created
  // once per component instance — the baseURL comes from the server component
  // so it is never hardcoded in the bundle.
  const [client] = useState(() =>
    createAuthClient({
      baseURL: authPublicUrl,
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
