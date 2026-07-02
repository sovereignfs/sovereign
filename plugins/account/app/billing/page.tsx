'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, Textarea } from '@sovereignfs/ui';
import styles from '../account.module.css';
import billingStyles from './billing.module.css';

interface EntitlementItem {
  id: string;
  pluginId: string;
  pluginName: string;
  tierId: string | null;
  status: string;
  source: string;
  issuedAt: number;
  expiresAt: number | null;
  active: boolean;
}

export default function BillingPage() {
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Import form state
  const [importing, setImporting] = useState(false);
  const [importPluginId, setImportPluginId] = useState('');
  const [importToken, setImportToken] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/account/entitlements', { credentials: 'same-origin' });
      if (res.ok) {
        const data = (await res.json()) as { entitlements: EntitlementItem[] };
        setEntitlements(data.entitlements);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    setCancelling(id);
    setError(null);
    const res = await fetch(`/api/account/entitlements?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) {
      setEntitlements((prev) => prev.filter((e) => e.id !== id));
    } else {
      setError('Could not cancel entitlement — please try again.');
    }
    setCancelling(null);
  };

  const importLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setImportError(null);
    setImportSuccess(false);
    const res = await fetch('/api/account/entitlements', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId: importPluginId.trim(), licenseToken: importToken.trim() }),
    });
    if (res.ok) {
      setImportSuccess(true);
      setImportPluginId('');
      setImportToken('');
      void load();
    } else {
      const data = (await res.json()) as { error?: string };
      setImportError(data.error ?? 'License import failed.');
    }
    setImporting(false);
  };

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const active = entitlements.filter((e) => e.active);
  const past = entitlements.filter((e) => !e.active);

  return (
    <div className={styles.sections}>
      {/* Active entitlements ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active licenses</h2>
        {loading ? (
          <p className={styles.help}>Loading…</p>
        ) : active.length === 0 ? (
          <p className={styles.help}>No active plugin licenses.</p>
        ) : (
          <ul className={billingStyles.list} aria-label="Active entitlements">
            {active.map((ent) => (
              <li key={ent.id} className={billingStyles.item}>
                <div className={billingStyles.itemInfo}>
                  <span className={billingStyles.pluginName}>{ent.pluginName}</span>
                  <span className={billingStyles.meta}>
                    {ent.tierId ? `${ent.tierId} · ` : ''}
                    {ent.expiresAt ? `Renews ${formatDate(ent.expiresAt)}` : 'Perpetual'}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.revokeButton}
                  onClick={() => void cancel(ent.id)}
                  disabled={cancelling === ent.id}
                  aria-label={`Revoke license for ${ent.pluginName}`}
                >
                  {cancelling === ent.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={billingStyles.error} role="alert">
            {error}
          </p>
        )}
      </section>

      {/* Import a new license ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Import a license</h2>
        <p className={styles.help}>
          Paste the signed license token you received from the plugin author or payment provider.
          When a paid plugin redirects you to its paywall page, you can also import the token
          directly from there.
        </p>
        <form onSubmit={(e) => void importLicense(e)} className={billingStyles.importForm}>
          <FormField label="Plugin ID" id="billing-plugin-id" required>
            {(field) => (
              <Input
                {...field}
                type="text"
                value={importPluginId}
                onChange={(e) => setImportPluginId(e.target.value)}
                placeholder="com.acme.myplugin"
              />
            )}
          </FormField>
          <FormField label="License token" id="billing-token" required>
            {(field) => (
              <Textarea
                {...field}
                className={billingStyles.tokenMono}
                value={importToken}
                onChange={(e) => setImportToken(e.target.value)}
                rows={4}
                placeholder="Paste your license token here…"
              />
            )}
          </FormField>
          <Button type="submit" disabled={importing}>
            {importing ? 'Importing…' : 'Import license'}
          </Button>
          {importError && (
            <p className={billingStyles.error} role="alert">
              {importError}
            </p>
          )}
          {importSuccess && (
            <p className={billingStyles.success} role="status">
              License imported and activated.
            </p>
          )}
        </form>
      </section>

      {/* Past / cancelled ───────────────────────────────────────────────── */}
      {past.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Past licenses</h2>
          <ul className={billingStyles.list} aria-label="Past entitlements">
            {past.map((ent) => (
              <li key={ent.id} className={`${billingStyles.item} ${billingStyles.itemInactive}`}>
                <div className={billingStyles.itemInfo}>
                  <span className={billingStyles.pluginName}>{ent.pluginName}</span>
                  <span className={billingStyles.meta}>
                    {ent.tierId ? `${ent.tierId} · ` : ''}
                    {ent.status === 'cancelled' ? 'Cancelled' : 'Expired'} ·{' '}
                    {ent.expiresAt ? formatDate(ent.expiresAt) : formatDate(ent.issuedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
