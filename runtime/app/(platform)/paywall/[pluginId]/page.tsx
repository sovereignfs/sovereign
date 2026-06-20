import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Button } from '@sovereignfs/ui';
import { getInstalledPlugins } from '@/src/registry';
import styles from './paywall.module.css';

interface Props {
  params: Promise<{ pluginId: string }>;
}

export default async function PaywallPage({ params }: Props) {
  const { pluginId } = await params;
  const decodedId = decodeURIComponent(pluginId);

  const plugin = getInstalledPlugins().find((p) => p.id === decodedId);
  if (!plugin || !plugin.monetization || plugin.monetization.model === 'free') {
    redirect('/');
  }

  const { monetization } = plugin;
  const tiers = monetization.tiers ?? [];
  const modelLabel: Record<string, string> = {
    one_time: 'One-time purchase',
    recurring: 'Subscription',
    pay_what_you_want: 'Pay what you want',
  };
  const intervalLabel: Record<string, string> = {
    day: 'day',
    week: 'week',
    month: 'month',
    year: 'year',
  };

  const hdrs = await headers();
  // Extract return path from Referer so the import form can redirect back.
  const referer = hdrs.get('referer') ?? plugin.routePrefix;
  let returnPath: string;
  try {
    returnPath = new URL(referer).pathname;
  } catch {
    returnPath = plugin.routePrefix;
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.pluginIcon}>
          <img
            src={`/plugin-icons/${encodeURIComponent(decodedId)}.svg`}
            alt=""
            aria-hidden="true"
            className={styles.icon}
          />
        </div>
        <h1 className={styles.title}>{plugin.name}</h1>
        {plugin.description && <p className={styles.description}>{plugin.description}</p>}

        <div className={styles.modelBadge}>
          {modelLabel[monetization.model] ?? monetization.model}
        </div>

        {tiers.length > 0 ? (
          <ul className={styles.tiers} aria-label="Available tiers">
            {tiers.map((tier) => (
              <li key={tier.id} className={styles.tier}>
                <span className={styles.tierName}>{tier.name}</span>
                <span className={styles.tierPrice}>
                  {(tier.price.amount / 100).toLocaleString('en-US', {
                    style: 'currency',
                    currency: tier.price.currency,
                  })}
                  {monetization.model === 'recurring' && monetization.interval
                    ? ` / ${intervalLabel[monetization.interval] ?? monetization.interval}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noTiers}>Contact the plugin author to purchase access.</p>
        )}

        <hr className={styles.divider} />

        <section className={styles.importSection}>
          <h2 className={styles.importTitle}>Already have a license?</h2>
          <p className={styles.importHint}>
            Paste the signed license token you received from the plugin author or payment provider.
            Your access will be activated immediately.
          </p>
          <form action="/api/account/entitlements" method="post" className={styles.importForm}>
            <input type="hidden" name="pluginId" value={decodedId} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <label htmlFor="license-token" className={styles.tokenLabel}>
              License token
            </label>
            <textarea
              id="license-token"
              name="licenseToken"
              className={styles.tokenInput}
              rows={4}
              placeholder="Paste your license token here…"
              required
              aria-describedby="license-token-hint"
            />
            <p id="license-token-hint" className={styles.tokenHint}>
              Tokens are provided by the plugin author after payment. They are signed and verified
              offline — no internet connection is required to activate.
            </p>
            <Button type="submit">Activate license</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
