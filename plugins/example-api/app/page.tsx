import { sdk } from '@sovereignfs/sdk';
import styles from './example-api.module.css';

export default async function ExampleApiPage() {
  const session = await sdk.auth.getSession();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Example: API Provider</h1>
      <p className={styles.lead}>
        This plugin demonstrates the API provider pattern (PLT-16). Its manifest declares{' '}
        <code className={styles.code}>&quot;apiProvider&quot;: true</code>, so public{' '}
        <code className={styles.code}>/api/*</code> requests are delegated to this plugin before the
        platform session gate.
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

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Try the delegated routes</h2>
        <div className={styles.examples}>
          <div>
            <p className={styles.exampleTitle}>GET status</p>
            <pre className={styles.block}>{`curl http://localhost:3000/api/demo/status`}</pre>
          </div>
          <div>
            <p className={styles.exampleTitle}>POST echo</p>
            <pre className={styles.block}>{`curl -X POST http://localhost:3000/api/demo/echo \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer demo-key' \\
  -d '{"title":"Hello from Sovereign"}'`}</pre>
          </div>
          <div>
            <p className={styles.exampleTitle}>Structured error</p>
            <pre className={styles.block}>{`curl -X POST http://localhost:3000/api/demo/echo`}</pre>
          </div>
        </div>
        <p className={styles.note}>
          The bearer header is optional in this example. Real API-provider plugins should verify
          their own API keys, signatures, or webhook secrets inside the delegated route.
        </p>
      </section>

      {session && (
        <p className={styles.note}>
          Signed in as <strong>{session.user.name}</strong>.
        </p>
      )}
    </div>
  );
}
