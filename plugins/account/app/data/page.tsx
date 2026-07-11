'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
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

interface VaultSecret {
  id: string;
  pluginId: string;
  scope: 'user' | 'plugin' | 'instance';
  label: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

interface ExternalConnection {
  id: string;
  pluginId: string;
  scope: 'user' | 'plugin' | 'instance';
  provider: string;
  label: string;
  status: 'connected' | 'needs_reauth' | 'paused' | 'disconnected' | 'error';
  updatedAt: number;
  lastUsedAt: number | null;
}

export default function DataPage() {
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [connections, setConnections] = useState<ExternalConnection[]>([]);
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
      const secretsRes = await fetch('/api/account/secrets', { cache: 'no-store' });
      if (!secretsRes.ok) throw new Error(`Failed to load vault metadata: ${secretsRes.status}`);
      const secretsData = (await secretsRes.json()) as { secrets: VaultSecret[] };
      setSecrets(secretsData.secrets);
      const connectionsRes = await fetch('/api/account/connections', { cache: 'no-store' });
      if (!connectionsRes.ok) {
        throw new Error(`Failed to load connection metadata: ${connectionsRes.status}`);
      }
      const connectionsData = (await connectionsRes.json()) as {
        connections: ExternalConnection[];
      };
      setConnections(connectionsData.connections);
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

  const revokeSecret = async (id: string) => {
    const res = await fetch(`/api/account/secrets/${id}`, { method: 'DELETE' });
    if (res.ok) setSecrets((prev) => prev.filter((secret) => secret.id !== id));
  };

  const disconnectConnection = async (id: string) => {
    const res = await fetch(`/api/account/connections/${id}`, { method: 'DELETE' });
    if (res.ok) setConnections((prev) => prev.filter((conn) => conn.id !== id));
  };

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Data access consents</h2>
          <p className={styles.sectionSubtitle}>
            These plugins can read your data from other plugins. Revoke any consent you no longer
            want.
          </p>
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text, red)' }}>{error}</p>}

        {!loading && grants.length === 0 && <p className={styles.help}>No active data consents.</p>}

        {grants.length > 0 && (
          <ul className={styles.sessionGroup}>
            {grants.map((grant) => (
              <li key={grant.id} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <span className={styles.sessionDevice}>{grant.consumerId}</span>
                  <span className={styles.sessionMeta}>Read {grant.contract}</span>
                </div>
                <button
                  type="button"
                  className={styles.revokeButton}
                  onClick={() => void revoke(grant.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Connected accounts</h2>
          <p className={styles.sectionSubtitle}>
            These external provider accounts are connected by apps. Disconnecting removes the saved
            credential reference where possible.
          </p>
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {!loading && connections.length === 0 && (
          <p className={styles.help}>No connected external accounts.</p>
        )}

        {connections.length > 0 && (
          <ul className={styles.sessionGroup}>
            {connections.map((conn) => (
              <li key={conn.id} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <span className={styles.sessionDevice}>{conn.label}</span>
                  <span className={styles.sessionMeta}>
                    {conn.pluginId} · {conn.provider} · {conn.status} · Updated{' '}
                    {new Date(conn.updatedAt * 1000).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.revokeButton}
                  onClick={() => void disconnectConnection(conn.id)}
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Saved app credentials</h2>
          <p className={styles.sectionSubtitle}>
            These entries are encrypted credentials saved by apps on your behalf. Values are never
            shown or included in exports.
          </p>
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {!loading && secrets.length === 0 && (
          <p className={styles.help}>No saved app credentials.</p>
        )}

        {secrets.length > 0 && (
          <ul className={styles.sessionGroup}>
            {secrets.map((secret) => (
              <li key={secret.id} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <span className={styles.sessionDevice}>{secret.label}</span>
                  <span className={styles.sessionMeta}>
                    {secret.pluginId} · Updated {new Date(secret.updatedAt * 1000).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.revokeButton}
                  onClick={() => void revokeSecret(secret.id)}
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

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
    }
  }, [open]);

  async function onDelete() {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
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
        <div className={styles.dangerCard}>
          <h2 className={styles.dangerCardTitle}>Delete account</h2>
          <p className={styles.dangerCardBody}>
            Permanently removes all your data from this instance. This cannot be undone — export
            first if you want a copy.
          </p>
          <div>
            <button type="button" className={styles.dangerButton} onClick={() => setOpen(true)}>
              Delete my account
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        message={
          <>
            <p className={styles.confirmMessage}>
              All your data will be permanently removed, including your profile, preferences,
              activity history, notifications, and any data held by installed plugins. This cannot
              be undone.
            </p>
            <FormField label="Confirm with your password" id="delete-account-password">
              {(field) => (
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={deleting}
                />
              )}
            </FormField>
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete permanently'}
        destructive
        pending={deleting}
        error={error}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
