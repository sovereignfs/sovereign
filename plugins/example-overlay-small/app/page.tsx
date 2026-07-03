import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-overlay-small.module.css';

export default async function ExampleOverlaySmallPage() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <header className={styles.headerBlock}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Overlay size</p>
          <h1 className={styles.title}>Small</h1>
        </div>

        <p className={styles.lead}>
          A compact overlay for quick actions. The platform owns the dialog chrome; this plugin only
          declares <code className={styles.code}>shellConfig.overlaySize: &quot;sm&quot;</code>.
        </p>
      </header>

      <dl className={styles.dl}>
        <div className={styles.row}>
          <dt>Route</dt>
          <dd>/example-overlay-small</dd>
        </div>
        <div className={styles.row}>
          <dt>User</dt>
          <dd>{session?.user.name ?? 'Unknown'}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button variant="primary" size="sm">
          Compact action
        </Button>
        <Link className={styles.link} href="/example-overlay-medium" replace>
          Medium overlay
        </Link>
      </div>
    </div>
  );
}
