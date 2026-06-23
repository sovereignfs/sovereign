'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PortabilityPanel } from '../_components/PortabilityPanel';
import styles from '../account.module.css';

interface ConsentGrant {
  id: string;
  consumerId: string;
  providerId: string;
  contract: string;
  version: number;
  grantedAt: number;
}

export default function DataPage() {
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/data-grants', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load grants: ${res.status}`);
      const data = (await res.json()) as { grants: ConsentGrant[] };
      setGrants(data.grants);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    const res = await fetch(`/api/account/data-grants/${id}`, { method: 'DELETE' });
    if (res.ok) setGrants((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data access consents</h2>
        <p className={styles.help}>
          These plugins can read your data from other plugins. Revoke any consent you no longer
          want.
        </p>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text, red)' }}>{error}</p>}

        {!loading && grants.length === 0 && <p className={styles.help}>No active data consents.</p>}

        {grants.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {grants.map((grant) => (
              <li
                key={grant.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--sv-space-3) 0',
                  borderBottom: '1px solid var(--sv-color-border)',
                }}
              >
                <div>
                  <strong>{grant.consumerId}</strong>
                  <span style={{ color: 'var(--sv-color-text-secondary)' }}> reads </span>
                  <strong>
                    {grant.providerId}/{grant.contract}
                  </strong>{' '}
                  <span style={{ color: 'var(--sv-color-text-secondary)' }}>v{grant.version}</span>
                  <div
                    style={{
                      fontSize: 'var(--sv-font-size-sm)',
                      color: 'var(--sv-color-text-secondary)',
                    }}
                  >
                    Granted{' '}
                    {new Date(grant.grantedAt * 1000).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </div>
                </div>
                <button
                  onClick={() => void revoke(grant.id)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--sv-color-border)',
                    borderRadius: 'var(--sv-radius-sm)',
                    padding: 'var(--sv-space-1) var(--sv-space-3)',
                    cursor: 'pointer',
                    color: 'var(--sv-color-text-primary)',
                    fontSize: 'var(--sv-font-size-sm)',
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PortabilityPanel />

      <DeleteAccountSection />
    </div>
  );
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setPassword('');
      setError(null);
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => setOpen(false);
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, []);

  async function onDelete() {
    if (!password) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 403) {
        setError('Incorrect password. Please try again.');
        return;
      }
      if (res.status === 409) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Cannot delete account: you are the sole owner.');
        return;
      }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? `Deletion failed (${res.status})`);
        return;
      }
      const redirectHeader = res.headers.get('x-sovereign-redirect');
      window.location.href = redirectHeader ?? '/login?accountDeleted=1';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Delete your account</h2>
        <p className={styles.help}>
          Remove all your data from this instance permanently. This cannot be undone. Export your
          data first if you want a copy.
        </p>
        <button type="button" className={styles.dangerButton} onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </section>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className={styles.confirmNativeDialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.confirmDialog}>
          <h2 className={styles.confirmTitle}>Delete your account?</h2>
          <p className={styles.confirmMessage}>
            All your data will be permanently removed, including your profile, preferences, activity
            history, notifications, and any data held by installed plugins. This cannot be undone.
          </p>
          <label className={styles.field} htmlFor="delete-account-password">
            <span className={styles.label}>Confirm with your password</span>
            <input
              id="delete-account-password"
              type="password"
              className={styles.input}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={deleting}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void onDelete()}
              disabled={!password || deleting}
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
