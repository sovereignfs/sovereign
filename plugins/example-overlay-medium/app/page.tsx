import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-overlay-medium.module.css';

export default async function ExampleOverlayMediumPage() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Overlay size</p>
        <h1 className={styles.title}>Medium</h1>
      </header>

      <p className={styles.lead}>
        A medium overlay fits short workflows with a preview, controls, and confirmation content.
        Intra-overlay links use <code className={styles.code}>replace</code> so the platform can
        dismiss the dialog with one back navigation.
      </p>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Example workflow</h2>
        <div className={styles.grid}>
          <div>
            <span className={styles.metric}>3</span>
            <span className={styles.label}>steps</span>
          </div>
          <div>
            <span className={styles.metric}>md</span>
            <span className={styles.label}>size</span>
          </div>
          <div>
            <span className={styles.metric}>{session ? 'on' : 'off'}</span>
            <span className={styles.label}>session</span>
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <Link className={styles.link} href="/example-overlay-small" replace>
          Small
        </Link>
        <Button variant="primary" size="sm">
          Save draft
        </Button>
        <Link className={styles.link} href="/example-overlay-large" replace>
          Large
        </Link>
      </div>
    </div>
  );
}
