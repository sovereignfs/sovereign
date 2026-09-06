import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import styles from '../console.module.css';
import {
  InstanceForm,
  LogoUploadForm,
  FaviconUploadForm,
  type InstanceValues,
} from '../settings/SettingsForms';
import { renderFetchSignal } from '../_lib/fetch-timeout';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

const DEFAULT_INSTANCE: InstanceValues = {
  instanceName: 'Sovereign',
  instanceLogo: null,
  instanceLogoDark: null,
  instanceFavicon: null,
  instancePrimary: null,
  instanceRadius: null,
  instanceThemePreset: null,
  emailFromName: null,
  emailLogo: null,
};

async function loadInstance(): Promise<InstanceValues> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${SELF_URL}/api/admin/instance-config`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
      signal: renderFetchSignal(),
    });
    if (!res.ok) return DEFAULT_INSTANCE;
    return (await res.json()) as InstanceValues;
  } catch {
    return DEFAULT_INSTANCE;
  }
}

export default async function IdentityPage() {
  const instance = await loadInstance();

  return (
    <div>
      <ConsolePageHeader
        title="Identity"
        description="The name, logo, accent colour, corner radius and theme shown across this instance."
      />

      <div className={styles.overviewSection}>
        <h3 className={styles.overviewSectionTitle}>Instance identity</h3>
        <InstanceForm initialValues={instance} />
      </div>

      <div className={styles.overviewSection}>
        <h3 className={styles.overviewSectionTitle}>Upload assets</h3>
        <p className={styles.lede}>
          Upload image files to serve from <code className={styles.codeInline}>/api/instance/</code>
          . Stored in <code className={styles.codeInline}>data/instance/</code> on the server.
        </p>
        <LogoUploadForm dark={false} />
        <LogoUploadForm dark={true} />
        <FaviconUploadForm />
      </div>
    </div>
  );
}
