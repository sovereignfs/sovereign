import {
  updateInviteOnlyAction,
  updateRootPluginAction,
  updateTenantNameAction,
  updateBrandingAction,
  uploadLogoAction,
  uploadFaviconAction,
} from './actions';
import styles from '../console.module.css';

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

export default async function SettingsPage() {
  const [settings, plugins, branding] = await Promise.all([
    adminGet<Settings>('/api/admin/settings'),
    adminGet<PluginRow[]>('/api/admin/plugins'),
    adminGet<Branding>('/api/admin/tenant-branding'),
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
        <section className={styles.settingsSection}>
          <h3 className={styles.sectionTitle}>Branding</h3>
          <p className={styles.helpText}>
            Customise the name, logo, and accent colour shown across the platform. Uploads are
            stored in <code className={styles.codeInline}>data/brand/</code>.
          </p>

          {/* Text / colour fields */}
          <form action={updateBrandingAction} className={styles.settingsForm}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="brandName">
                Brand name
              </label>
              <input
                id="brandName"
                name="brandName"
                type="text"
                placeholder="Sovereign"
                defaultValue={branding.brandName !== 'Sovereign' ? branding.brandName : ''}
                className={styles.input}
              />
              <span className={styles.helpText}>Displayed in the shell header and login page.</span>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="brandPrimary">
                Primary colour
              </label>
              <input
                id="brandPrimary"
                name="brandPrimary"
                type="text"
                pattern="^#[0-9a-fA-F]{6}$"
                placeholder="#3b82f6"
                defaultValue={branding.brandPrimary ?? ''}
                className={styles.input}
              />
              <span className={styles.helpText}>
                6-digit hex (e.g. <code className={styles.codeInline}>#3b82f6</code>). Sets{' '}
                <code className={styles.codeInline}>--sv-color-accent</code>. Leave blank to use the
                default.
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="brandLogo">
                Logo URL (light theme)
              </label>
              <input
                id="brandLogo"
                name="brandLogo"
                type="url"
                placeholder="https://… or /api/brand/logo"
                defaultValue={branding.brandLogo ?? ''}
                className={styles.input}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="brandLogoDark">
                Logo URL (dark theme)
              </label>
              <input
                id="brandLogoDark"
                name="brandLogoDark"
                type="url"
                placeholder="https://… or /api/brand/logo?dark=1"
                defaultValue={branding.brandLogoDark ?? ''}
                className={styles.input}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="brandFavicon">
                Favicon URL
              </label>
              <input
                id="brandFavicon"
                name="brandFavicon"
                type="url"
                placeholder="https://… or /api/brand/favicon"
                defaultValue={branding.brandFavicon ?? ''}
                className={styles.input}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="emailFromName">
                Email sender name
              </label>
              <input
                id="emailFromName"
                name="emailFromName"
                type="text"
                placeholder="Sovereign"
                defaultValue={branding.emailFromName ?? ''}
                className={styles.input}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="emailLogo">
                Email logo URL
              </label>
              <input
                id="emailLogo"
                name="emailLogo"
                type="url"
                placeholder="https://…"
                defaultValue={branding.emailLogo ?? ''}
                className={styles.input}
              />
              <span className={styles.helpText}>
                Used in outbound email HTML templates. Must be publicly reachable.
              </span>
            </div>
            <button type="submit" className={styles.actionButton}>
              Save branding
            </button>
          </form>

          {/* Logo file upload (light) */}
          <form
            action={uploadLogoAction}
            className={styles.settingsForm}
            style={{ marginTop: '16px' }}
          >
            <input type="hidden" name="dark" value="0" />
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="logoFile">
                Upload logo (light theme)
              </label>
              <input
                id="logoFile"
                name="file"
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className={styles.input}
              />
              <span className={styles.helpText}>PNG, SVG, JPEG, or WebP · max 2 MB</span>
            </div>
            <button type="submit" className={styles.actionButton}>
              Upload
            </button>
          </form>

          {/* Logo file upload (dark) */}
          <form
            action={uploadLogoAction}
            className={styles.settingsForm}
            style={{ marginTop: '8px' }}
          >
            <input type="hidden" name="dark" value="1" />
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="logoDarkFile">
                Upload logo (dark theme)
              </label>
              <input
                id="logoDarkFile"
                name="file"
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className={styles.input}
              />
            </div>
            <button type="submit" className={styles.actionButton}>
              Upload
            </button>
          </form>

          {/* Favicon file upload */}
          <form
            action={uploadFaviconAction}
            className={styles.settingsForm}
            style={{ marginTop: '8px' }}
          >
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="faviconFile">
                Upload favicon
              </label>
              <input
                id="faviconFile"
                name="file"
                type="file"
                accept="image/png,image/svg+xml,image/x-icon,image/webp"
                className={styles.input}
              />
              <span className={styles.helpText}>PNG, SVG, ICO, or WebP · max 2 MB</span>
            </div>
            <button type="submit" className={styles.actionButton}>
              Upload
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
