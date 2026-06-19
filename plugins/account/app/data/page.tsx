'use client';

import { useCallback, useEffect, useState } from 'react';
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
    </div>
  );
}
