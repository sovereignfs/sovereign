import { headers } from 'next/headers';
import { Badge } from '@sovereignfs/ui';
import { getPlatformDb } from '@/src/db';
import { canUserOpenPlugin } from '@/src/plugin-access-server';
import { getPluginCatalogAction, togglePluginAction } from './actions';
import { PluginAccessDialog } from './PluginAccessDialog';
import { PluginCatalogSection } from './PluginCatalogSection';
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
  example: boolean;
  enabled: boolean;
  compatibilityError: string | null;
  compatibilityWarnings: string[];
  /** Whether the viewing admin can open this plugin's app (RFC 0065) — Console management is separate from app access. */
  openableByViewer: boolean;
}

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
        {plugin.example && <Badge variant="mono">example</Badge>}
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
          <PluginAccessDialog pluginId={plugin.id} pluginName={plugin.name} />
          {plugin.openableByViewer ? (
            <a href={plugin.routePrefix} className={styles.pluginCardBtnToggle}>
              Open
            </a>
          ) : (
            <span
              className={styles.pluginCardBtnToggle}
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="You are not currently allowed to open this plugin under its access policy."
            >
              Open
            </span>
          )}
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

function PluginTableRow({ plugin }: { plugin: PluginRow }) {
  const isPlatform = plugin.type === 'platform';
  return (
    <tr className={styles.tr}>
      <td className={styles.td}>
        <div className={styles.userCell}>
          <span className={styles.userName}>{plugin.name}</span>
          {plugin.description && <span className={styles.userEmail}>{plugin.description}</span>}
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
          {plugin.example && <Badge variant="mono">example</Badge>}
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
          <span className={styles.adminOnlyNote} title={plugin.compatibilityWarnings.join('\n')}>
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
              <input type="hidden" name="enabled" value={plugin.enabled ? 'false' : 'true'} />
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

          <PluginAccessDialog pluginId={plugin.id} pluginName={plugin.name} />

          {plugin.openableByViewer ? (
            <a href={plugin.routePrefix} className={styles.iconBtnReactivate} title="Open">
              Open
            </a>
          ) : (
            <span
              className={styles.adminOnlyNote}
              title="You are not currently allowed to open this plugin under its access policy."
            >
              Open (restricted)
            </span>
          )}

          {!isPlatform && <RemovePluginButton pluginId={plugin.id} pluginName={plugin.name} />}
        </div>
      </td>
    </tr>
  );
}

function PluginTable({ plugins }: { plugins: PluginRow[] }) {
  return (
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
            {plugins.map((plugin) => (
              <PluginTableRow key={plugin.id} plugin={plugin} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RawPluginRow = Omit<PluginRow, 'openableByViewer'>;

async function getPlugins(): Promise<RawPluginRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const selfUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  try {
    const res = await fetch(`${selfUrl}/api/admin/plugins`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[plugins] fetch failed: ${res.status}`);
      return [];
    }
    return res.json() as Promise<RawPluginRow[]>;
  } catch (err) {
    console.error('[plugins] fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Whether the viewing admin can open each plugin's app (RFC 0065) — separate
 * from Console management access. Computed server-side directly (not via the
 * `/api/admin/plugins` admin-key route, which has no per-user identity) so
 * the "Open" affordance can be disabled with a reason rather than hidden.
 */
async function withOpenability(plugins: RawPluginRow[]): Promise<PluginRow[]> {
  const h = await headers();
  const userId = h.get('x-sovereign-user-id');
  const role = h.get('x-sovereign-user-role') ?? 'platform:user';
  if (!userId) return plugins.map((p) => ({ ...p, openableByViewer: false }));

  const pdb = await getPlatformDb();
  const results = await Promise.all(
    plugins.map((p) => canUserOpenPlugin(pdb, userId, role, p.id, true, p.enabled)),
  );
  return plugins.map((p, i) => ({ ...p, openableByViewer: results[i] ?? false }));
}

export default async function PluginsPage() {
  const [rawPlugins, catalog] = await Promise.all([getPlugins(), getPluginCatalogAction()]);
  const inactiveCatalogIds = new Set(catalog.filter((e) => !e.active).map((e) => e.id));
  const plugins = await withOpenability(rawPlugins.filter((p) => !inactiveCatalogIds.has(p.id)));
  const mainPlugins = plugins.filter((p) => !p.example);
  const examplePlugins = plugins.filter((p) => p.example);

  return (
    <div className={styles.sections}>
      <PluginInstallPanel />

      <PluginCatalogSection catalog={catalog} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Installed plugins</h2>
        <PluginTable plugins={mainPlugins} />
        <div className={styles.pluginCardList}>
          {mainPlugins.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      </section>

      {examplePlugins.length > 0 && (
        <section className={styles.section}>
          <div className={styles.exampleBulkHeading}>
            <h2 className={styles.sectionTitle}>Example plugins</h2>
            <p className={styles.help}>
              Bundled reference plugins that demonstrate the platform. Show or hide them all from{' '}
              <strong>Settings → Example plugins</strong>; use the toggles here to override an
              individual one.
            </p>
          </div>
          <PluginTable plugins={examplePlugins} />
          <div className={styles.pluginCardList}>
            {examplePlugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
