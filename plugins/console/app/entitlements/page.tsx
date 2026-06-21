import { sdk } from '@sovereignfs/sdk';
import { getInstalledPlugins } from '@/src/registry';
import { LicenseGenerator, type GeneratorPlugin, type GeneratorUser } from './LicenseGenerator';
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

interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  status: 'active' | 'deactivated' | 'invited';
}

const RUNTIME_URL = process.env.NEXT_PUBLIC_RUNTIME_URL ?? 'http://localhost:3000';
const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function loadEntitlements(): Promise<EntitlementRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/entitlements`, {
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

async function loadStoredKeys(): Promise<{
  keys: Record<string, string>;
  publicKeys: Record<string, string>;
}> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/license-keys`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return { keys: {}, publicKeys: {} };
    const data = (await res.json()) as {
      keys: Record<string, string>;
      publicKeys: Record<string, string>;
    };
    return { keys: data.keys ?? {}, publicKeys: data.publicKeys ?? {} };
  } catch {
    return { keys: {}, publicKeys: {} };
  }
}

async function loadUsers(): Promise<MemberRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${AUTH_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return (await res.json()) as MemberRow[];
  } catch {
    return [];
  }
}

export default async function EntitlementsPage() {
  const [rows, session] = await Promise.all([loadEntitlements(), sdk.auth.getSession()]);
  const isOwner = sdk.auth.hasCapability(session, 'role:assign');

  let generatorPlugins: GeneratorPlugin[] = [];
  let generatorUsers: GeneratorUser[] = [];
  let storedKeys: Record<string, string> = {};
  let storedPublicKeys: Record<string, string> = {};

  if (isOwner) {
    const [members, { keys, publicKeys }] = await Promise.all([loadUsers(), loadStoredKeys()]);
    storedKeys = keys;
    storedPublicKeys = publicKeys;
    // Only monetized plugins with a declared public key can have licenses generated.
    generatorPlugins = getInstalledPlugins().flatMap((p) => {
      const publicKey = p.monetization?.license?.publicKey;
      if (!publicKey) return [];
      return [{ id: p.id, name: p.name, publicKey, tiers: p.monetization?.tiers ?? [] }];
    });
    generatorUsers = members.flatMap((m) => {
      if (!m.id || m.status === 'invited') return [];
      return [{ id: m.id, email: m.email, name: m.name }];
    });
  }

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
      {isOwner && (
        <section className={styles.section}>
          <LicenseGenerator
            plugins={generatorPlugins}
            users={generatorUsers}
            storedKeys={storedKeys}
            storedPublicKeys={storedPublicKeys}
          />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plugin entitlements</h2>
        <p className={styles.help}>
          Signed licenses imported by users for paid plugins.{' '}
          {isOwner
            ? 'Generate and grant licenses above, or users can import them via Account → Billing.'
            : 'Users manage their own licenses via Account → Billing.'}
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
