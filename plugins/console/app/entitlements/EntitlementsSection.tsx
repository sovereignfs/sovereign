'use client';

import { useState } from 'react';
import { Badge, EmptyState, SegmentedControl } from '@sovereignfs/ui';
import { CopyIdButton } from '../_components/CopyIdButton';
import styles from '../console.module.css';

type EntFilter = 'all' | 'inactive';

const FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'inactive' as const, label: 'Inactive only' },
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

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusLabel(row: EntitlementRow, active: boolean): string {
  if (active) return 'Active';
  if (row.status === 'cancelled') return 'Cancelled';
  if (row.status === 'active') return 'Expired';
  return row.status.charAt(0).toUpperCase() + row.status.slice(1);
}

/**
 * Entitlement list — the reference table on desktop and a compact list on
 * mobile (the table card is CSS-hidden there; the list used to vanish
 * entirely). Full user ids with a copy button replace the 8-character
 * truncation with no way to get the value out.
 */
export function EntitlementsSection({ rows }: { rows: EntitlementRow[] }) {
  const [filter, setFilter] = useState<EntFilter>('all');

  const now = Math.floor(Date.now() / 1000);
  const isActive = (row: EntitlementRow) =>
    row.status === 'active' && (row.expiresAt == null || row.expiresAt > now);

  const filtered = filter === 'inactive' ? rows.filter((r) => !isActive(r)) : rows;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="shield"
        heading="No entitlements yet"
        description="Entitlements appear here once a paid app's license is imported or granted."
      />
    );
  }

  return (
    <div className={styles.fieldStack}>
      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={FILTER_OPTIONS}
        size="sm"
        aria-label="Filter entitlements"
      />

      {filtered.length === 0 ? (
        <p className={styles.emptyTableMsg}>Every entitlement is currently active.</p>
      ) : (
        <>
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table} aria-label="Entitlements">
                <thead>
                  <tr>
                    <th className={styles.th}>App</th>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>Tier</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Source</th>
                    <th className={styles.th}>Issued</th>
                    <th className={styles.th}>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const active = isActive(row);
                    return (
                      <tr key={row.id} className={styles.tr}>
                        <td className={styles.td}>
                          <Badge variant="mono" size="sm">
                            {row.pluginId}
                          </Badge>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.userIdRow}>
                            <span className={styles.userId} title={row.userId}>
                              {row.userId}
                            </span>
                            <CopyIdButton value={row.userId} label="Copy user ID" />
                          </span>
                        </td>
                        <td className={styles.td}>
                          {row.tierId ?? <span className={styles.textMuted}>—</span>}
                        </td>
                        <td className={styles.td}>
                          <Badge
                            variant="status"
                            size="sm"
                            status={active ? 'active' : 'deactivated'}
                          >
                            {statusLabel(row, active)}
                          </Badge>
                        </td>
                        <td className={styles.td}>{row.source}</td>
                        <td className={styles.td}>{formatDate(row.issuedAt)}</td>
                        <td className={styles.td}>
                          {row.expiresAt ? (
                            formatDate(row.expiresAt)
                          ) : (
                            <span className={styles.textMuted}>Never</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul className={[styles.compactList, styles.mobileOnlyList].join(' ')}>
            {filtered.map((row) => {
              const active = isActive(row);
              return (
                <li key={row.id} className={styles.compactRow}>
                  <span className={styles.compactRowLabel}>
                    <span className={styles.compactRowTitle}>
                      {row.pluginId}
                      {row.tierId ? ` · ${row.tierId}` : ''}
                    </span>
                    <span className={styles.compactRowSubtitle}>
                      {row.userId} · {row.source} · issued {formatDate(row.issuedAt)}
                      {row.expiresAt ? ` · expires ${formatDate(row.expiresAt)}` : ''}
                    </span>
                  </span>
                  <Badge variant="status" size="sm" status={active ? 'active' : 'deactivated'}>
                    {statusLabel(row, active)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
