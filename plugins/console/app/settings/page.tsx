import { updateInviteOnlyAction, updateRootPluginAction, updateTenantNameAction } from './actions';
import styles from '../console.module.css';

const SELF_URL = 'http://localhost:3000';

interface Settings {
  tenantName: string;
  inviteOnly: boolean;
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

export default async function SettingsPage() {
  const [settings, plugins] = await Promise.all([
    adminGet<Settings>('/api/admin/settings'),
    adminGet<PluginRow[]>('/api/admin/plugins'),
  ]);

  // Only installed, enabled, non-adminOnly, non-overlay plugins are eligible
  // roots (CON-11): `/` is served as a full page, which overlay plugins cannot.
  const rootCandidates = plugins.filter((p) => p.enabled && !p.adminOnly && p.shell !== 'overlay');
  const rootInstalled = rootCandidates.some((p) => p.id === settings.rootPluginId);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Settings</h2>
      </div>

      <div className={styles.settingsSections}>
        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Tenant</h3>
          <form action={updateTenantNameAction} className={styles.settingsForm}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="tenantName">
                Tenant name
              </label>
              <input
                id="tenantName"
                name="tenantName"
                type="text"
                required
                defaultValue={settings.tenantName}
                className={styles.input}
              />
            </div>
            <button type="submit" className={styles.actionButton}>
              Save name
            </button>
          </form>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Registration</h3>
          <form action={updateInviteOnlyAction} className={styles.settingsForm}>
            <label className={styles.checkboxRow}>
              <input type="checkbox" name="inviteOnly" defaultChecked={settings.inviteOnly} />
              <span>
                Invite-only registration
                <span className={styles.helpText}>
                  When enabled, only invited email addresses can register. The first user is always
                  exempt.
                </span>
              </span>
            </label>
            <button type="submit" className={styles.actionButton}>
              Save registration policy
            </button>
          </form>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Root plugin</h3>
          <form action={updateRootPluginAction} className={styles.settingsForm}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="rootPluginId">
                Plugin served at <code className={styles.codeInline}>/</code>
              </label>
              {rootCandidates.length === 0 ? (
                <p className={styles.helpText}>
                  No eligible plugins installed yet. The Launcher (the default root) arrives with
                  the next platform task; until then <code className={styles.codeInline}>/</code>{' '}
                  shows a placeholder.
                </p>
              ) : (
                <select
                  id="rootPluginId"
                  name="rootPluginId"
                  defaultValue={rootInstalled ? settings.rootPluginId : undefined}
                  className={styles.roleSelect}
                >
                  {!rootInstalled && (
                    <option value="" disabled>
                      {settings.rootPluginId} (not installed)
                    </option>
                  )}
                  {rootCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {rootCandidates.length > 0 && (
              <button type="submit" className={styles.actionButton}>
                Save root plugin
              </button>
            )}
          </form>
          <p className={styles.helpText}>
            Current setting: <code className={styles.codeInline}>{settings.rootPluginId}</code>
          </p>
        </section>
      </div>
    </div>
  );
}
