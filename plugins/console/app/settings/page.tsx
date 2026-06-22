import styles from '../console.module.css';
import {
  TenantForm,
  InviteOnlyForm,
  RootPluginForm,
  InstanceForm,
  LogoUploadForm,
  FaviconUploadForm,
} from './SettingsForms';
import { EmailTemplatesForm } from './EmailTemplatesForms';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface Settings {
  tenantName: string;
  inviteOnly: boolean;
  rootPluginId: string;
}

interface InstanceIdentity {
  instanceName: string;
  instanceLogo: string | null;
  instanceLogoDark: string | null;
  instanceFavicon: string | null;
  instancePrimary: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
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

const DEFAULT_SETTINGS: Settings = { tenantName: 'Sovereign', inviteOnly: false, rootPluginId: '' };
const DEFAULT_INSTANCE: InstanceIdentity = {
  instanceName: 'Sovereign',
  instanceLogo: null,
  instanceLogoDark: null,
  instanceFavicon: null,
  instancePrimary: null,
  emailFromName: null,
  emailLogo: null,
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default async function SettingsPage() {
  const [settingsResult, pluginsResult, instanceResult, pwResetCopyResult, inviteCopyResult] =
    await Promise.allSettled([
      adminGet<Settings>('/api/admin/settings'),
      adminGet<PluginRow[]>('/api/admin/plugins'),
      adminGet<InstanceIdentity>('/api/admin/instance-config'),
      adminGet<{ copy: Record<string, string> }>(
        '/api/admin/email-templates?templateId=passwordReset',
      ),
      adminGet<{ copy: Record<string, string> }>('/api/admin/email-templates?templateId=invite'),
    ]);
  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);
  const instance = settled(instanceResult, DEFAULT_INSTANCE);
  const emailCopy = {
    passwordReset: settled(pwResetCopyResult, { copy: {} }).copy,
    invite: settled(inviteCopyResult, { copy: {} }).copy,
  };

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
          <TenantForm initialName={settings.tenantName} />
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Registration</h3>
          <InviteOnlyForm initialValue={settings.inviteOnly} />
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Root plugin</h3>
          <RootPluginForm
            candidates={rootCandidates.map((p) => ({ id: p.id, name: p.name }))}
            currentId={settings.rootPluginId}
            currentInstalled={rootInstalled}
          />
          <p className={styles.helpText}>
            Current setting: <code className={styles.codeInline}>{settings.rootPluginId}</code>
          </p>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Instance identity</h3>
          <p className={styles.helpText}>
            Customise the name, logo, and accent colour shown across the platform. Uploads are
            stored in <code className={styles.codeInline}>data/instance/</code>.
          </p>

          <InstanceForm initialValues={instance} />

          <LogoUploadForm dark={false} />
          <LogoUploadForm dark={true} />
          <FaviconUploadForm />
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Email templates</h3>
          <p className={styles.helpText}>
            Override the built-in copy for platform emails. Changes take effect immediately.
            Test-send delivers a sample to your own email address.
          </p>
          <EmailTemplatesForm initialCopy={emailCopy} previewBaseUrl={SELF_URL} />
        </section>
      </div>
    </div>
  );
}
