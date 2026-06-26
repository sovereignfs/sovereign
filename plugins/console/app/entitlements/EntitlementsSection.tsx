'use client';

import { useState } from 'react';
import { Badge, SegmentedControl } from '@sovereignfs/ui';
import styles from '../console.module.css';
import entStyles from './entitlements.module.css';

type EntFilter = 'none' | 'entries';

const FILTER_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'entries' as const, label: 'With entries' },
];

export interface EntitlementRow {
  id: string;
  userId: string;
  pluginId: string;
  tierId: string | null;
  status: string;
  source: string;
  issuedAt: number;
  expiresAt: number | null;
}

function KeyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5" />
      <path d="M21 21l-9.35-9.35" />
      <path d="M17 17l2 2" />
      <path d="M14 14l2 2" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className={entStyles.emptyState}>
      <div className={entStyles.emptyIcon}>
        <KeyIcon />
      </div>
      <p className={entStyles.emptyTitle}>No entitlements configured</p>
      <p className={entStyles.emptyDesc}>
        Entitlements appear here when plugins use the monetization manifest field.
      </p>
    </div>
  );
}

export function EntitlementsSection({
  rows,
  isOwner,
}: {
  rows: EntitlementRow[];
  isOwner: boolean;
}) {
  const [filter, setFilter] = useState<EntFilter>('entries');

  const now = Math.floor(Date.now() / 1000);
  const isActive = (row: EntitlementRow) =>
    row.status === 'active' && (row.expiresAt == null || row.expiresAt > now);

  const filtered = filter === 'none' ? rows.filter((r) => !isActive(r)) : rows;

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <section className={styles.section}>
      <div className={entStyles.sectionHeaderRow}>
        <div>
          <h2 className={styles.sectionTitle}>Plugin entitlements</h2>
          <p className={styles.help}>
            Signed licenses imported by users for paid plugins.{' '}
            {isOwner
              ? 'Generate and grant licenses below, or users can import them via Account → Billing.'
              : 'Users manage their own licenses via Account → Billing.'}
          </p>
        </div>
        {rows.length > 0 && (
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            size="sm"
            aria-label="Filter entitlements"
          />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableWrapper}>
            <table className={styles.table} aria-label="Entitlements">
              <thead>
                <tr>
                  <th className={styles.th}>Plugin</th>
                  <th className={styles.th}>User ID</th>
                  <th className={styles.th}>Tier</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Source</th>
                  <th className={styles.th}>Issued</th>
                  <th className={styles.th}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={entStyles.emptyRow}>
                      No entries match this filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const active = isActive(row);
                    return (
                      <tr key={row.id} className={styles.tr}>
                        <td className={styles.td}>
                          <Badge variant="mono">{row.pluginId}</Badge>
                        </td>
                        <td className={styles.td}>
                          <code className={entStyles.userId}>{row.userId.slice(0, 8)}…</code>
                        </td>
                        <td className={styles.td}>
                          {row.tierId ?? <span className={styles.textMuted}>—</span>}
                        </td>
                        <td className={styles.td}>
                          <Badge variant="status" status={active ? 'active' : 'deactivated'}>
                            {active
                              ? 'Active'
                              : row.status === 'cancelled'
                                ? 'Cancelled'
                                : row.status}
                          </Badge>
                        </td>
                        <td className={styles.td}>{row.source}</td>
                        <td className={styles.td}>{formatDate(row.issuedAt)}</td>
                        <td className={styles.td}>
                          {row.expiresAt ? (
                            formatDate(row.expiresAt)
                          ) : (
                            <span className={styles.textMuted}>perpetual</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
