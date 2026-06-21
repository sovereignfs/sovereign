import { sdk } from '@sovereignfs/sdk';
import { Button } from '@sovereignfs/ui';
import styles from './example-monetized.module.css';

// ─── Demo keypair ────────────────────────────────────────────────────────────
// This plugin uses a committed demo keypair so you can test the full
// monetization flow without setting up a real billing system.
//
// NEVER use these keys in a production plugin — they are public.
//
// Public key (stored in manifest.json → monetization.license.publicKey):
//   OQETbqoRboorjWYxjfpWCx4780PQ2MWbJDxW-rOxDdQ
//
// Private key (for signing demo tokens — see instructions below):
//   TjwqILr7pqij4iX5fyAwRtgggduXDJD2hBBu_4OgpKU
// ─────────────────────────────────────────────────────────────────────────────

// A pre-signed perpetual "pro" demo token for demo@example.com.
// Any user can import this to unlock the plugin without a real payment.
const DEMO_TOKEN =
  'eyJwbHVnaW5JZCI6ImZzLnNvdmVyZWlnbi5leGFtcGxlLW1vbmV0aXplZCIsInN1YiI6ImRlbW9AZXhhbXBsZS5jb20iLCJpc3N1ZWRBdCI6MTc1MDAwMDAwMCwidGllciI6InBybyJ9.Rfv-w5U2LNuxc9oTfFHW-TPhV8j3uMeS7MaDGHxhVvrQ6OcX66R392QEr6ztGQ5dEb2n3FpuBeOqNgVlmnJoDg';

export default async function ExampleMonetizedPage() {
  const session = await sdk.auth.getSession();
  const user = session?.user;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Example: Monetized Plugin</h1>
        <span className={styles.badge}>Pro tier active</span>
      </div>
      <p className={styles.lead}>
        If you can see this page, the platform verified your license token before routing you here.
        This is a reference plugin for the monetization manifest field (RFC 0003).
      </p>

      {/* Gated content ─────────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Gated content</h2>
        <p className={styles.muted}>
          This section is only reachable because your entitlement passed the middleware check.
          Without a valid license, visiting <code className={styles.code}>/example-monetized</code>{' '}
          redirects to the platform paywall page at{' '}
          <code className={styles.code}>/paywall/fs.sovereign.example-monetized</code>.
        </p>
        <dl className={styles.dl}>
          {user && (
            <>
              <div className={styles.row}>
                <dt>Signed in as</dt>
                <dd>
                  {user.name} ({user.email})
                </dd>
              </div>
              <div className={styles.row}>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
            </>
          )}
          <div className={styles.row}>
            <dt>Access</dt>
            <dd className={styles.ok}>✓ Entitlement verified</dd>
          </div>
        </dl>
      </section>

      {/* Developer guide ────────────────────────────────────────────────────── */}
      <section className={styles.devCard}>
        <h2 className={styles.cardTitle}>Developer guide — testing monetization</h2>
        <p className={styles.muted}>
          This plugin uses a committed demo keypair so you can test the full flow locally without a
          real billing system. The keys below are intentionally public — use your own generated
          keypair in any real plugin.
        </p>

        <div className={styles.step}>
          <span className={styles.stepNum}>1</span>
          <div>
            <p className={styles.stepTitle}>Revoke your current license (to test the paywall)</p>
            <p className={styles.muted}>
              Go to <strong>Account → Billing</strong> and cancel the entitlement for this plugin.
              Your next visit to <code className={styles.code}>/example-monetized</code> will
              redirect to the paywall page.
            </p>
          </div>
        </div>

        <div className={styles.step}>
          <span className={styles.stepNum}>2</span>
          <div>
            <p className={styles.stepTitle}>Import the pre-signed demo token</p>
            <p className={styles.muted}>
              On the paywall page, paste this token into the "License token" field and click
              <strong> Activate license</strong>. It grants perpetual pro-tier access for{' '}
              <code className={styles.code}>demo@example.com</code>.
            </p>
            <pre className={styles.token}>{DEMO_TOKEN}</pre>
          </div>
        </div>

        <div className={styles.step}>
          <span className={styles.stepNum}>3</span>
          <div>
            <p className={styles.stepTitle}>Sign your own tokens (optional)</p>
            <p className={styles.muted}>
              Use the demo private key to mint tokens with any payload — e.g. a different
              subscriber, an expiry date, or a different tier:
            </p>
            <pre className={styles.code_block}>{`node -e "
const c = require('crypto');
const priv = c.createPrivateKey({
  key: {
    kty: 'OKP', crv: 'Ed25519',
    x: 'OQETbqoRboorjWYxjfpWCx4780PQ2MWbJDxW-rOxDdQ',
    d: 'TjwqILr7pqij4iX5fyAwRtgggduXDJD2hBBu_4OgpKU'
  },
  format: 'jwk'
});
const payload = Buffer.from(JSON.stringify({
  pluginId: 'fs.sovereign.example-monetized',
  sub:      'you@example.com',
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
  tier:     'pro'
})).toString('base64url');
const sig = c.sign(null, Buffer.from(payload), priv).toString('base64url');
console.log(payload + '.' + sig);
"`}</pre>
          </div>
        </div>

        <div className={styles.step}>
          <span className={styles.stepNum}>4</span>
          <div>
            <p className={styles.stepTitle}>Use your own keypair in a real plugin</p>
            <p className={styles.muted}>
              Generate a fresh keypair and put only the public key in your manifest. Keep the
              private key in your billing backend — never commit it.
            </p>
            <pre className={styles.code_block}>{`node -e "
const c = require('crypto');
const { publicKey: pub, privateKey: priv } =
  c.generateKeyPairSync('ed25519');
const { x } = pub.export({ format: 'jwk' });
const { d } = priv.export({ format: 'jwk' });
console.log('Public key (manifest):', x);
console.log('Private key (secret):',  d);
"`}</pre>
          </div>
        </div>
      </section>

      <div>
        <form action="/api/account/entitlements" method="post">
          <input type="hidden" name="pluginId" value="fs.sovereign.example-monetized" />
          <input type="hidden" name="licenseToken" value={DEMO_TOKEN} />
          <input type="hidden" name="returnPath" value="/example-monetized" />
          <Button type="submit" variant="secondary" size="sm">
            Re-import demo token
          </Button>
        </form>
      </div>
    </div>
  );
}
