import Link from 'next/link';
import { Breadcrumb, PageContainer, PageHeader } from '@sovereignfs/ui';
import { discoverModels } from '../_lib/model-discovery';
import { listProviders } from '../_lib/providers';
import { ProvidersView } from '../_components/ProvidersView';
import styles from '../_components/providers.module.css';

/**
 * Warden's model provider settings page (RFC 0063 §4, epic task 22.4). A
 * Server Component: fetches this user's providers and a live merged model
 * list on every render, so a `router.refresh()` from the client after any
 * mutation is enough to reflect fresh state — no separate client-side fetch
 * layer needed.
 */
export default async function WardenProvidersPage() {
  const [providers, discovery] = await Promise.all([listProviders(), discoverModels()]);

  return (
    <PageContainer maxWidth="md">
      <Breadcrumb
        items={[{ label: 'Chat', href: '/warden' }, { label: 'Providers' }]}
        renderLink={(item, children) => <Link href={item.href ?? '#'}>{children}</Link>}
      />
      <PageHeader
        title="Model providers"
        description="Add any OpenAI-API-compatible endpoint — OpenRouter, a direct provider, or your own self-hosted server. Your key stays on this instance and is only ever sent to the endpoint you configure."
        action={
          <Link href="/warden/models" className={styles.headerLink}>
            Manage models
          </Link>
        }
      />
      <ProvidersView providers={providers} discovery={discovery} />
    </PageContainer>
  );
}
