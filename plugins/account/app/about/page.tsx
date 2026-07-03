import { sdk } from '@sovereignfs/sdk';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

function formatRuntimeVersion(version: string): string {
  if (!version || version === 'unknown') return 'unknown';
  return version.startsWith('v') ? version : `v${version}`;
}

export default async function AboutPage() {
  const config = await sdk.platform.getConfig();

  return (
    <section className={styles.sections}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>About this instance</h2>
          <p className={styles.sectionSubtitle}>
            Instance and platform details for this Sovereign workspace.
          </p>
        </div>

        <dl className={styles.aboutList}>
          <div className={styles.aboutRow}>
            <dt className={styles.aboutLabel}>Instance</dt>
            <dd className={styles.aboutValue}>{config.instanceName}</dd>
          </div>
          <div className={styles.aboutRow}>
            <dt className={styles.aboutLabel}>Platform</dt>
            <dd className={styles.aboutValue}>Sovereign</dd>
          </div>
          <div className={styles.aboutRow}>
            <dt className={styles.aboutLabel}>Runtime</dt>
            <dd className={styles.aboutValue}>{formatRuntimeVersion(config.version)}</dd>
          </div>
          <div className={styles.aboutRow}>
            <dt className={styles.aboutLabel}>Links</dt>
            <dd className={styles.aboutValue}>
              <span className={styles.aboutLinks}>
                <a
                  href="https://github.com/sovereignfs/sovereign/tree/main/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Docs
                </a>
                <a href="https://github.com/sovereignfs/sovereign" target="_blank" rel="noreferrer">
                  Source
                </a>
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
