'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, ConsentPrompt, FormField, Input } from '@sovereignfs/ui';
import { BackupDestinationPanel } from '../_components/BackupDestinationPanel';
import { GitRestorePanel } from '../_components/GitRestorePanel';
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

interface PendingDataGrantRequest {
  consumerId: string;
  consumerName: string;
  providerId: string;
  providerName: string;
  contract: string;
  version: number;
  description: string | null;
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

interface DeviceGrant {
  userId: string;
  pluginId: string;
  capability: string;
  grantedAt: number;
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
  metadata?: Record<string, unknown> | null;
}

const DEVICE_CAPABILITY_LABELS: Record<string, string> = {
  'notifications.native': 'Send notifications',
  'haptics.impact': 'Use haptics',
};

/**
 * A connection's `metadata` is free-form per plugin (no standardized schema)
 * — Warden's BYO model-provider feature, for example, stores the actual
 * external `baseUrl` there. The platform has no way to gate connection
 * creation on informed consent the way it does for cross-plugin data grants
 * (there's no manifest-declared description to show, and blocking creation
 * would break Warden's real, already-explicit "paste your own endpoint and
 * key" form). What it can do — and didn't, until now, despite the API
 * already returning this field — is stop hiding whatever a plugin *did*
 * disclose. Filtered to primitive values only, so this never dumps a large
 * nested object into the row.
 */
function connectionMetadataSummary(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const parts = Object.entries(metadata)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean',
    )
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function deviceCapabilityLabel(capability: string): string {
  return DEVICE_CAPABILITY_LABELS[capability] ?? capability;
}

export default function DataPage() {
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingDataGrantRequest[]>([]);
  const [deviceGrants, setDeviceGrants] = useState<DeviceGrant[]>([]);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [connections, setConnections] = useState<ExternalConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [pendingRequestError, setPendingRequestError] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [deviceGrantError, setDeviceGrantError] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/data-grants', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load grants: ${res.status}`);
      const data = (await res.json()) as {
        grants: ConsentGrant[];
        pending?: PendingDataGrantRequest[];
      };
      setGrants(data.grants);
      setPendingRequests(data.pending ?? []);
      const deviceRes = await fetch('/api/account/device-grants', { cache: 'no-store' });
      if (!deviceRes.ok) {
        throw new Error(`Failed to load device permissions: ${deviceRes.status}`);
      }
      const deviceData = (await deviceRes.json()) as { grants: DeviceGrant[] };
      setDeviceGrants(deviceData.grants);
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

  const pendingKey = (r: PendingDataGrantRequest) =>
    `${r.consumerId}:${r.providerId}:${r.contract}:${r.version}`;

  const allowRequest = async (request: PendingDataGrantRequest) => {
    setPendingRequestError(null);
    setPendingRequestId(pendingKey(request));
    try {
      const res = await fetch('/api/account/data-grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consumerId: request.consumerId,
          providerId: request.providerId,
          contract: request.contract,
          version: request.version,
        }),
      });
      if (!res.ok) {
        setPendingRequestError('Could not grant this request — please try again.');
        return;
      }
      setPendingRequests((prev) => prev.filter((r) => pendingKey(r) !== pendingKey(request)));
      await load();
    } catch (e) {
      setPendingRequestError(e instanceof Error ? e.message : 'Could not grant this request.');
    } finally {
      setPendingRequestId(null);
    }
  };

  const denyRequest = (request: PendingDataGrantRequest) => {
    // Not persisted — no grant is created, and the app can ask again later
    // (e.g. after a manifest update). This only dismisses it for this visit.
    setPendingRequests((prev) => prev.filter((r) => pendingKey(r) !== pendingKey(request)));
  };

  const revoke = async (id: string) => {
    setGrantError(null);
    try {
      const res = await fetch(`/api/account/data-grants/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setGrantError('Could not revoke this consent — please try again.');
        return;
      }
      setGrants((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : 'Could not revoke this consent.');
    }
  };

  const revokeDeviceGrant = async (pluginId: string, capability: string) => {
    setDeviceGrantError(null);
    try {
      const res = await fetch('/api/account/device-grants', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pluginId, capability }),
      });
      if (!res.ok) {
        setDeviceGrantError('Could not revoke this permission — please try again.');
        return;
      }
      setDeviceGrants((prev) =>
        prev.filter((g) => !(g.pluginId === pluginId && g.capability === capability)),
      );
    } catch (e) {
      setDeviceGrantError(e instanceof Error ? e.message : 'Could not revoke this permission.');
    }
  };

  const revokeSecret = async (id: string) => {
    setSecretError(null);
    try {
      const res = await fetch(`/api/account/secrets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setSecretError('Could not revoke this credential — please try again.');
        return;
      }
      setSecrets((prev) => prev.filter((secret) => secret.id !== id));
    } catch (e) {
      setSecretError(e instanceof Error ? e.message : 'Could not revoke this credential.');
    }
  };

  const disconnectConnection = async (id: string) => {
    setConnectionError(null);
    try {
      const res = await fetch(`/api/account/connections/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setConnectionError('Could not disconnect this account — please try again.');
        return;
      }
      setConnections((prev) => prev.filter((conn) => conn.id !== id));
      // Disconnecting a connection with a secretRef atomically deletes the
      // linked secret server-side (disconnectPluginConnection) — refresh the
      // separate secrets list so it doesn't keep showing the deleted entry
      // until the next full page load.
      try {
        const secretsRes = await fetch('/api/account/secrets', { cache: 'no-store' });
        if (secretsRes.ok) {
          const secretsData = (await secretsRes.json()) as { secrets: VaultSecret[] };
          setSecrets(secretsData.secrets);
        }
      } catch {
        // Best-effort — the secrets section will self-correct on next full load.
      }
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : 'Could not disconnect this account.');
    }
  };

  return (
    <div className={styles.sections}>
      {pendingRequests.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Pending data-sharing requests</h2>
            <p className={styles.sectionSubtitle}>
              These apps have declared they want to read data from another app on this instance.
              Nothing is shared until you allow it.
            </p>
          </div>

          {pendingRequestError && (
            <p className={styles.error} role="alert">
              {pendingRequestError}
            </p>
          )}

          <ul className={styles.sessionGroup}>
            {pendingRequests.map((request) => (
              <li key={pendingKey(request)}>
                <ConsentPrompt
                  consumerName={request.consumerName}
                  providerName={request.providerName}
                  contract={request.contract}
                  description={request.description}
                  pending={pendingRequestId === pendingKey(request)}
                  onAllow={() => void allowRequest(request)}
                  onDeny={() => denyRequest(request)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Data access consents</h2>
          <p className={styles.sectionSubtitle}>
            These apps can read your data from other apps. Revoke any consent you no longer want.
          </p>
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text, red)' }}>{error}</p>}
        {grantError && (
          <p className={styles.error} role="alert">
            {grantError}
          </p>
        )}

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
          <h2 className={styles.sectionTitle}>Device app permissions</h2>
          <p className={styles.sectionSubtitle}>
            Apps you&apos;ve allowed to use device capabilities (notifications, haptics). App
            identity here is self-reported by the app itself, not verified by the platform — revoke
            anything you don&apos;t recognize.
          </p>
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {deviceGrantError && (
          <p className={styles.error} role="alert">
            {deviceGrantError}
          </p>
        )}
        {!loading && deviceGrants.length === 0 && (
          <p className={styles.help}>No device permissions granted.</p>
        )}

        {deviceGrants.length > 0 && (
          <ul className={styles.sessionGroup}>
            {deviceGrants.map((grant) => (
              <li key={`${grant.pluginId}:${grant.capability}`} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <span className={styles.sessionDevice}>{grant.pluginId}</span>
                  <span className={styles.sessionMeta}>
                    {deviceCapabilityLabel(grant.capability)} · Granted{' '}
                    {new Date(grant.grantedAt * 1000).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.revokeButton}
                  onClick={() => void revokeDeviceGrant(grant.pluginId, grant.capability)}
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
        {connectionError && (
          <p className={styles.error} role="alert">
            {connectionError}
          </p>
        )}
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
                  {connectionMetadataSummary(conn.metadata) && (
                    <span className={styles.sessionMeta}>
                      {connectionMetadataSummary(conn.metadata)}
                    </span>
                  )}
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
        {secretError && (
          <p className={styles.error} role="alert">
            {secretError}
          </p>
        )}
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

      <BackupDestinationPanel onConnected={load} />

      <GitRestorePanel />

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
              activity history, notifications, and any data held by installed apps. This cannot be
              undone.
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
