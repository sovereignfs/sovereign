import { Badge } from '@sovereignfs/ui';
import { togglePluginAction } from './actions';
import { PluginInstallPanel, RemovePluginButton } from './PluginInstallPanel';
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
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const selfUrl = `http://localhost:${process.env.PORT ?? '3000'}`;
  const res = await fetch(`${selfUrl}/api/admin/plugins`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch plugins: ${res.status}`);
  return res.json() as Promise<PluginRow[]>;
}

function TypeBadge({ type }: { type: string }) {
  return <Badge variant={type === 'platform' ? 'role' : 'mono'}>{type}</Badge>;
}

export default async function PluginsPage() {
  const plugins = await getPlugins();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Plugins</h2>
      </div>

      <PluginInstallPanel />

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
            {plugins.map((plugin) => {
              const isChrome = plugin.type === 'platform';
              return (
                <tr key={plugin.id} className={styles.tr}>
                  <td className={styles.td}>
                    <div className={styles.userCell}>
                      <span className={styles.userName}>{plugin.name}</span>
                      {plugin.description && (
                        <span className={styles.userEmail}>{plugin.description}</span>
                      )}
                      <span className={styles.userId}>{plugin.id}</span>
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
                      <Badge variant="status" status="enabled">
                        Enabled
                      </Badge>
                    ) : plugin.compatibilityError ? (
                      <span title={plugin.compatibilityError}>
                        <Badge variant="status" status="failed">
                          Incompatible
                        </Badge>
                      </span>
                    ) : (
                      <Badge variant="status" status="deactivated">
                        Disabled
                      </Badge>
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
                    <div className={styles.rowActions}>
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

                      {!isChrome && (
                        <RemovePluginButton pluginId={plugin.id} pluginName={plugin.name} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
