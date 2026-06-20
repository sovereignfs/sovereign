import styles from '../console.module.css';
import entStyles from './entitlements.module.css';

interface EntitlementRow {
  id: string;
  userId: string;
  pluginId: string;
  tierId: string | null;
  status: string;
  source: string;
  issuedAt: number;
  expiresAt: number | null;
  createdAt: number;
}

async function loadEntitlements(): Promise<EntitlementRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch('http://localhost:3000/api/admin/entitlements', {
      headers: { authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entitlements: EntitlementRow[] };
    return data.entitlements;
  } catch {
    return [];
  }
}

export default async function EntitlementsPage() {
  const rows = await loadEntitlements();

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const now = Math.floor(Date.now() / 1000);
  const isActive = (row: EntitlementRow) =>
    row.status === 'active' && (row.expiresAt == null || row.expiresAt > now);

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plugin entitlements</h2>
        <p className={styles.help}>
          Signed licenses imported by users for paid plugins. Admins can view entitlements but not
          create them — licenses are issued by plugin authors. Users manage their own licenses via{' '}
          <strong>Account → Billing</strong>.
        </p>

        {rows.length === 0 ? (
          <p className={styles.help}>No entitlements recorded.</p>
        ) : (
          <div className={entStyles.tableWrapper}>
            <table className={entStyles.table} aria-label="Entitlements">
              <thead>
                <tr>
                  <th className={entStyles.th}>Plugin</th>
                  <th className={entStyles.th}>User ID</th>
                  <th className={entStyles.th}>Tier</th>
                  <th className={entStyles.th}>Status</th>
                  <th className={entStyles.th}>Source</th>
                  <th className={entStyles.th}>Issued</th>
                  <th className={entStyles.th}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={isActive(row) ? '' : entStyles.rowInactive}>
                    <td className={entStyles.td}>
                      <code className={entStyles.code}>{row.pluginId}</code>
                    </td>
                    <td className={entStyles.td}>
                      <code className={entStyles.code}>{row.userId.slice(0, 8)}…</code>
                    </td>
                    <td className={entStyles.td}>
                      {row.tierId ?? <span className={entStyles.none}>—</span>}
                    </td>
                    <td className={entStyles.td}>
                      <span
                        className={`${entStyles.badge} ${isActive(row) ? entStyles.badgeActive : entStyles.badgeInactive}`}
                      >
                        {isActive(row) ? 'active' : row.status}
                      </span>
                    </td>
                    <td className={entStyles.td}>{row.source}</td>
                    <td className={entStyles.td}>{formatDate(row.issuedAt)}</td>
                    <td className={entStyles.td}>
                      {row.expiresAt ? (
                        formatDate(row.expiresAt)
                      ) : (
                        <span className={entStyles.none}>perpetual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
