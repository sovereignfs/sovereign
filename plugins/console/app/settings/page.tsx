import styles from '../console.module.css';
import { TenantForm, InviteOnlyForm, ExampleAppsForm, RootPluginForm } from './SettingsForms';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

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
  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);

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
    </div>
  );
}
