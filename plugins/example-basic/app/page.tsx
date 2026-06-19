import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-basic.module.css';

export default async function ExampleBasicPage() {
  const session = await sdk.auth.getSession();
  const user = session?.user;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Example Plugin</h1>
      <p className={styles.lead}>
        A minimal Sovereign plugin. Edit{' '}
        <code className={styles.code}>plugins/example-basic/app/page.tsx</code> to get started.
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Session</h2>
        {user ? (
          <dl className={styles.dl}>
            <div className={styles.row}>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div className={styles.row}>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className={styles.row}>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.muted}>No active session.</p>
        )}
      </section>

      <div>
        <Button variant="primary" size="md">
          Design system Button
        </Button>
      </div>
    </div>
  );
}
