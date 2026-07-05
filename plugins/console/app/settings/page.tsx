import styles from '../console.module.css';
import { ProviderConfigsSection, type ProviderConfigRow } from './ProviderConfigForms';
import { TenantForm, InviteOnlyForm, ExampleAppsForm, RootPluginForm } from './SettingsForms';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

interface Settings {
  tenantName: string;
  inviteOnly: boolean;
  examplesEnabled: boolean;
  rootPluginId: string;
}

interface PluginRow {
  id: string;
  name: string;
  adminOnly: boolean;
  shell: string;
  enabled: boolean;
}

interface ExternalConnection {
  id: string;
  pluginId: string;
  scope: 'user' | 'plugin' | 'instance';
  userId: string | null;
  provider: string;
  label: string;
  status: 'connected' | 'needs_reauth' | 'paused' | 'disconnected' | 'error';
  updatedAt: number;
  lastUsedAt: number | null;
  disconnectedAt: number | null;
}

async function adminGet<T>(path: string): Promise<T> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}${path}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

const DEFAULT_SETTINGS: Settings = {
  tenantName: 'Sovereign',
  inviteOnly: false,
  examplesEnabled: false,
  rootPluginId: '',
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default async function SettingsPage() {
  const [settingsResult, pluginsResult] = await Promise.allSettled([
    adminGet<Settings>('/api/admin/settings'),
    adminGet<PluginRow[]>('/api/admin/plugins'),
  ]);
  const connectionsResult = await adminGet<{ connections: ExternalConnection[] }>(
    '/api/admin/connections',
  ).catch(() => ({ connections: [] }));
  const providerConfigsResult = await adminGet<{ providers: ProviderConfigRow[] }>(
    '/api/admin/provider-configs',
  ).catch(() => ({ providers: [] }));
  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);
  const connections = connectionsResult.connections;
  const providerConfigs = providerConfigsResult.providers;

  const rootCandidates = plugins.filter((p) => p.enabled && !p.adminOnly && p.shell !== 'overlay');
  const rootInstalled = rootCandidates.some((p) => p.id === settings.rootPluginId);

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tenant</h2>
        <TenantForm initialName={settings.tenantName} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Registration</h2>
        <InviteOnlyForm initialValue={settings.inviteOnly} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Example plugins</h2>
        <ExampleAppsForm initialValue={settings.examplesEnabled} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Root plugin</h2>
        <RootPluginForm
          candidates={rootCandidates.map((p) => ({ id: p.id, name: p.name }))}
          currentId={settings.rootPluginId}
          currentInstalled={rootInstalled}
        />
        <p className={styles.helpText}>
          Current setting: <code className={styles.codeInline}>{settings.rootPluginId}</code>
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>External connections</h2>
        {connections.length === 0 && (
          <p className={styles.helpText}>No app-owned external connections are registered.</p>
        )}
        {connections.length > 0 && (
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>App</th>
                    <th>Provider</th>
                    <th>Scope</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn) => (
                    <tr key={conn.id}>
                      <td>{conn.label}</td>
                      <td>
                        <code className={styles.codeInline}>{conn.pluginId}</code>
                      </td>
                      <td>{conn.provider}</td>
                      <td>{conn.scope}</td>
                      <td>{conn.userId ?? '-'}</td>
                      <td>{conn.status}</td>
                      <td>{new Date(conn.updatedAt * 1000).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>External provider configuration</h2>
        <ProviderConfigsSection providers={providerConfigs} />
      </section>
    </div>
  );
}
