import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-basic.module.css';

// The platform auto-namespaces plugin capabilities to `<pluginId>:<capName>`.
// This constant matches the `view-advanced` entry in manifest.json.
const CAP_VIEW_ADVANCED = 'fs.sovereign.example-basic:view-advanced';

export default async function ExampleBasicPage() {
  const session = await sdk.auth.getSession();
  const user = session?.user;

  // sdk.auth.hasCapability checks session.user.capabilities — a flat list the
  // middleware builds from the platform-role preset plus any plugin-declared
  // capabilities with defaultGrant: 'all' (RFC 0022).
  const canViewAdvanced = sdk.auth.hasCapability(session, CAP_VIEW_ADVANCED);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Example Plugin</h1>
        <p className={styles.lead}>
          A minimal Sovereign plugin. Edit{' '}
          <code className={styles.code}>plugins/example-basic/app/page.tsx</code> to get started.
        </p>
      </header>

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

      {canViewAdvanced && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Advanced section</h2>
          <p className={styles.muted}>
            Visible because this session has the{' '}
            <code className={styles.code}>{CAP_VIEW_ADVANCED}</code> capability (declared in
            manifest.json with <code className={styles.code}>defaultGrant: &quot;all&quot;</code>).
          </p>
        </section>
      )}

      <div>
        <Button variant="primary" size="md">
          Design system Button
        </Button>
      </div>
    </div>
  );
}
