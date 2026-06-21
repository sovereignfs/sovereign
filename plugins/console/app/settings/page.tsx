import styles from '../console.module.css';
import {
  TenantForm,
  InviteOnlyForm,
  RootPluginForm,
  BrandingForm,
  LogoUploadForm,
  FaviconUploadForm,
} from './SettingsForms';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface Settings {
  tenantName: string;
  inviteOnly: boolean;
  rootPluginId: string;
}

interface Branding {
  brandName: string;
  brandLogo: string | null;
  brandLogoDark: string | null;
  brandFavicon: string | null;
  brandPrimary: string | null;
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
const DEFAULT_BRANDING: Branding = {
  brandName: 'Sovereign',
  brandLogo: null,
  brandLogoDark: null,
  brandFavicon: null,
  brandPrimary: null,
  emailFromName: null,
  emailLogo: null,
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default async function SettingsPage() {
  const [settingsResult, pluginsResult, brandingResult] = await Promise.allSettled([
    adminGet<Settings>('/api/admin/settings'),
    adminGet<PluginRow[]>('/api/admin/plugins'),
    adminGet<Branding>('/api/admin/tenant-branding'),
  ]);
  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);
  const branding = settled(brandingResult, DEFAULT_BRANDING);

  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);
  const branding = settled(brandingResult, DEFAULT_BRANDING);

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
          <h3 className={styles.sectionTitle}>Branding</h3>
          <p className={styles.helpText}>
            Customise the name, logo, and accent colour shown across the platform. Uploads are
            stored in <code className={styles.codeInline}>data/brand/</code>.
          </p>

          <BrandingForm initialValues={branding} />

          <LogoUploadForm dark={false} />
          <LogoUploadForm dark={true} />
          <FaviconUploadForm />
        </section>
      </div>
    </div>
  );
}
