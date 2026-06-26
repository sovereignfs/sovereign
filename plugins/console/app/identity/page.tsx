import styles from '../console.module.css';
import {
  InstanceForm,
  LogoUploadForm,
  FaviconUploadForm,
  type InstanceValues,
} from '../settings/SettingsForms';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

const DEFAULT_INSTANCE: InstanceValues = {
  instanceName: 'Sovereign',
  instanceLogo: null,
  instanceLogoDark: null,
  instanceFavicon: null,
  instancePrimary: null,
  emailFromName: null,
  emailLogo: null,
};

async function loadInstance(): Promise<InstanceValues> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${SELF_URL}/api/admin/instance-config`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
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
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Instance identity</h2>
        <p className={styles.help}>
          Customise the name, logo, and accent colour shown across the platform.
        </p>
        <InstanceForm initialValues={instance} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Logo & favicon uploads</h2>
        <p className={styles.help}>
          Upload image files to serve via <code className={styles.codeInline}>/api/instance/</code>.
          Stored in <code className={styles.codeInline}>data/instance/</code>.
        </p>
        <LogoUploadForm dark={false} />
        <LogoUploadForm dark={true} />
        <FaviconUploadForm />
      </section>
    </div>
  );
}
