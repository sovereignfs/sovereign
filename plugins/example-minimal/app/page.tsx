import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-minimal.module.css';

export default async function ExampleMinimalPage() {
  const session = await sdk.auth.getSession();

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Minimal example navigation">
        <span className={styles.brand}>Example: Minimal</span>
        <Link className={styles.navLink} href="/launcher">
          Launcher
        </Link>
      </nav>

      <section className={styles.workspace}>
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Chrome-free route group</p>
          <h1 className={styles.title}>A plugin-owned fullscreen surface</h1>
          <p className={styles.lead}>
            Minimal shell routes remove the platform sidebar and mobile chrome. The session gate
            still applies, so this page can read the current user while owning its entire viewport.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" size="md">
              Primary control
            </Button>
            <Link className={styles.secondaryLink} href="/example-basic">
              Compare default shell
            </Link>
          </div>
        </div>

        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Runtime context</h2>
          <dl className={styles.dl}>
            <div>
              <dt>User</dt>
              <dd>{session?.user.name ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Shell</dt>
              <dd>minimal</dd>
            </div>
            <div>
              <dt>Navigation</dt>
              <dd>plugin-owned</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
