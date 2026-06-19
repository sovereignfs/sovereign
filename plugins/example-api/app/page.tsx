import { sdk } from '@sovereignfs/sdk';
import styles from './example-api.module.css';

export default async function ExampleApiPage() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Example: API Provider</h1>
      <p className={styles.lead}>
        This plugin demonstrates the API provider pattern (PLT-16). To activate{' '}
        <code className={styles.code}>/api/*</code> delegation, add{' '}
        <code className={styles.code}>&quot;apiProvider&quot;: true</code> to{' '}
        <code className={styles.code}>manifest.json</code>.
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>How it works</h2>
        <ol className={styles.steps}>
          <li>
            The runtime reserves <code className={styles.code}>/api/account</code>,{' '}
            <code className={styles.code}>/api/admin</code>,{' '}
            <code className={styles.code}>/api/health</code>, and{' '}
            <code className={styles.code}>/api/plugins</code> for platform use.
          </li>
          <li>
            All other <code className={styles.code}>/api/&lt;slug&gt;/*</code> paths are delegated
            to the one plugin with <code className={styles.code}>apiProvider: true</code>.
          </li>
          <li>
            The middleware rewrites{' '}
            <code className={styles.code}>/api/&lt;slug&gt;/&lt;path&gt;</code> →{' '}
            <code className={styles.code}>{'/example-api/serve/<slug>/<path>'}</code> before the
            session gate, so external callers can use their own auth (e.g. API keys).
          </li>
          <li>
            The serve route at{' '}
            <code className={styles.code}>app/serve/[slug]/[...path]/route.ts</code> handles the
            request.
          </li>
        </ol>
      </section>

      {session && (
        <p className={styles.note}>
          Signed in as <strong>{session.user.name}</strong>.
        </p>
      )}
    </div>
  );
}
