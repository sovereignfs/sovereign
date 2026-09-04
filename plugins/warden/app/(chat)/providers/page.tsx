import { PageContainer, PageHeader } from '@sovereignfs/ui';
import { discoverModels } from '../../_lib/model-discovery';
import { listProviders } from '../../_lib/providers';
import { ProvidersView } from '../../_components/ProvidersView';
import styles from '../../warden.module.css';

/**
 * Provider management, rendered in the chat shell's main column rather than
 * as a page of its own — the sidebar stays put, so this reads as another
 * destination within Warden instead of leaving it.
 *
 * This restores the standalone `/warden/providers` route that task 22.9
 * folded into `/warden/settings?tab=providers`. That consolidation predated
 * the persistent sidebar: with one, a full-page settings surface means the
 * navigation you just used disappears out from under you.
 */
export default async function WardenProvidersPage() {
  const [providers, discovery] = await Promise.all([listProviders(), discoverModels()]);

  return (
    <div className={styles.paneScroll}>
      <PageContainer maxWidth="md">
        <PageHeader
          title="Providers"
          description="Connect an OpenAI-compatible provider to make its models available in chat."
        />
        <ProvidersView providers={providers} discovery={discovery} />
      </PageContainer>
    </div>
  );
}
