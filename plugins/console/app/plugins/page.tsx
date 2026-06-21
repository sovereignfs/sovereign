import { togglePluginAction } from './actions';
import styles from '../console.module.css';

interface PluginRow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  type: string;
  routePrefix: string;
  adminOnly: boolean;
  enabled: boolean;
  compatibilityError: string | null;
  compatibilityWarnings: string[];
}

async function getPlugins(): Promise<PluginRow[]> {
  // Self-fetch — the runtime always listens on :3000 (see plugins/actions.ts).
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`http://localhost:${process.env.PORT ?? '3000'}/api/admin/plugins`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch plugins: ${res.status}`);
  return res.json() as Promise<PluginRow[]>;
}

function TypeBadge({ type }: { type: string }) {
  return <span className={type === 'platform' ? styles.badgeAdmin : styles.badgeUser}>{type}</span>;
}

export default async function PluginsPage() {
  const plugins = await getPlugins();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Plugins</h2>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Plugin</th>
              <th className={styles.th}>Version</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Route</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((plugin) => (
              <tr key={plugin.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userCell}>
                    <span className={styles.userName}>{plugin.name}</span>
                    {plugin.description && (
                      <span className={styles.userEmail}>{plugin.description}</span>
                    )}
                  </div>
                </td>

                <td className={styles.td}>
                  <code className={styles.codeInline}>{plugin.version}</code>
                </td>

                <td className={styles.td}>
                  <TypeBadge type={plugin.type} />
                  {plugin.adminOnly && <span className={styles.adminOnlyNote}> admin-only</span>}
                </td>

                <td className={styles.td}>
                  <code className={styles.codeInline}>{plugin.routePrefix}</code>
                </td>

                <td className={styles.td}>
                  {plugin.enabled ? (
                    <span className={styles.badgeActive}>Enabled</span>
                  ) : plugin.compatibilityError ? (
                    <span className={styles.badgeDeactivated} title={plugin.compatibilityError}>
                      Incompatible
                    </span>
                  ) : (
                    <span className={styles.badgeDeactivated}>Disabled</span>
                  )}
                  {plugin.compatibilityWarnings.length > 0 && (
                    <span
                      className={styles.adminOnlyNote}
                      title={plugin.compatibilityWarnings.join('\n')}
                    >
                      {' '}
                      ⚠ version advisory
                    </span>
                  )}
                </td>

                <td className={styles.td}>
                  {plugin.compatibilityError ? (
                    <span className={styles.adminOnlyNote} title={plugin.compatibilityError}>
                      Incompatible — cannot enable
                    </span>
                  ) : (
                    <form action={togglePluginAction}>
                      <input type="hidden" name="pluginId" value={plugin.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={plugin.enabled ? 'false' : 'true'}
                      />
                      <button
                        type="submit"
                        className={
                          plugin.enabled ? styles.deactivateButton : styles.reactivateButton
                        }
                      >
                        {plugin.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
