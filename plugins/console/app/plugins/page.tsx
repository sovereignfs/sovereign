import { Badge } from '@sovereignfs/ui';
import { togglePluginAction } from './actions';
import { PluginInstallPanel, RemovePluginButton } from './PluginInstallPanel';
import styles from '../console.module.css';

function PluginCard({ plugin }: { plugin: PluginRow }) {
  const isPlatform = plugin.type === 'platform';
  return (
    <div className={styles.pluginCard}>
      <div className={styles.pluginCardHeader}>
        <div className={styles.pluginCardInfo}>
          <span className={styles.pluginCardName}>{plugin.name}</span>
          {plugin.description && (
            <span className={styles.pluginCardDesc}>{plugin.description}</span>
          )}
          <span className={styles.pluginCardId}>{plugin.id}</span>
        </div>
        <div className={styles.pluginCardStatus}>
          {plugin.compatibilityError ? (
            <Badge variant="status" status="failed">
              Incompatible
            </Badge>
          ) : plugin.enabled ? (
            <Badge variant="role">Enabled</Badge>
          ) : (
            <Badge variant="status" status="deactivated">
              Disabled
            </Badge>
          )}
        </div>
      </div>

      <div className={styles.pluginCardMeta}>
        <code className={styles.pluginCardMetaCode}>{plugin.version}</code>
        <Badge variant="mono">{plugin.type}</Badge>
        {plugin.adminOnly && <Badge variant="mono">admin-only</Badge>}
        <code className={styles.pluginCardMetaCode}>{plugin.routePrefix}</code>
      </div>

      {plugin.compatibilityWarnings.length > 0 && (
        <p className={styles.pluginCardWarning}>⚠ {plugin.compatibilityWarnings.join(' · ')}</p>
      )}

      {!plugin.compatibilityError && (
        <div className={styles.pluginCardActions}>
          <form action={togglePluginAction}>
            <input type="hidden" name="pluginId" value={plugin.id} />
            <input type="hidden" name="enabled" value={plugin.enabled ? 'false' : 'true'} />
            <button type="submit" className={styles.pluginCardBtnToggle}>
              {plugin.enabled ? 'Disable' : 'Enable'}
            </button>
          </form>
          {!isPlatform && (
            <RemovePluginButton
              pluginId={plugin.id}
              pluginName={plugin.name}
              className={styles.pluginCardBtnRemove}
              label="Remove"
            />
          )}
        </div>
      )}
    </div>
  );
}

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

export default async function PluginsPage() {
  const plugins = await getPlugins();

  return (
    <div>
      <PluginInstallPanel />

      <div className={styles.tableCard}>
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
                const isPlatform = plugin.type === 'platform';
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
                      <div className={styles.typeBadges}>
                        <Badge variant="mono">{plugin.type}</Badge>
                        {plugin.adminOnly && <Badge variant="mono">admin-only</Badge>}
                      </div>
                    </td>

                    <td className={styles.td}>
                      <code className={styles.codeInline}>{plugin.routePrefix}</code>
                    </td>

                    <td className={styles.td}>
                      {plugin.compatibilityError ? (
                        <span title={plugin.compatibilityError}>
                          <Badge variant="status" status="failed">
                            Incompatible
                          </Badge>
                        </span>
                      ) : plugin.enabled ? (
                        <Badge variant="role">Enabled</Badge>
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
                            Incompatible
                          </span>
                        ) : (
                          <form action={togglePluginAction} style={{ display: 'inline-flex' }}>
                            <input type="hidden" name="pluginId" value={plugin.id} />
                            <input
                              type="hidden"
                              name="enabled"
                              value={plugin.enabled ? 'false' : 'true'}
                            />
                            <button
                              type="submit"
                              className={plugin.enabled ? styles.iconBtn : styles.iconBtnReactivate}
                              title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
                            >
                              {plugin.enabled ? (
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                              ) : (
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          </form>
                        )}

                        {!isPlatform && (
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

      {/* Mobile: card list (hidden on desktop via CSS) */}
      <div className={styles.pluginCardList}>
        {plugins.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} />
        ))}
      </div>
    </div>
  );
}
