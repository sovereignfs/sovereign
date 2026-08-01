import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-overlay-large.module.css';

export default async function ExampleOverlayLargePage() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <header className={styles.headerBlock}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Overlay size</p>
            <h1 className={styles.title}>Large</h1>
          </div>
          <span className={styles.badge}>Default size</span>
        </div>

        <p className={styles.lead}>
          Large overlays are useful for settings and management workflows that should keep the user
          in context. Omitting <code className={styles.code}>overlaySize</code> also resolves to
          this size.
        </p>
      </header>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Shell behavior</h2>
          <ul className={styles.list}>
            <li>Soft navigation opens a dialog over the current page.</li>
            <li>Hard navigation renders this route as a full page fallback.</li>
            <li>The platform owns the scrim, close button, and fixed dialog size.</li>
          </ul>
        </div>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Session context</h2>
          <dl className={styles.dl}>
            <div className={styles.row}>
              <dt>Name</dt>
              <dd>{session?.user.name ?? 'Unknown'}</dd>
            </div>
            <div className={styles.row}>
              <dt>Role</dt>
              <dd>{session?.user.role ?? 'none'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className={styles.actions}>
        <Link className={styles.link} href="/example-overlay-small" replace>
          Small
        </Link>
        <Link className={styles.link} href="/example-overlay-medium" replace>
          Medium
        </Link>
        <Button variant="primary" size="sm">
          Confirm
        </Button>
      </div>
    </div>
  );
}
