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
  // Sequenced, not concurrent: a discovery pass *writes* each connection's
  // status and last-checked time (`markProviderHealthy`/`markProviderError`),
  // so reading the rows alongside it renders the state from before this
  // check — which is how a just-failed provider came to sit under a
  // reassuring timestamp belonging to an older, successful attempt.
  // `discoverModels()` is cached, so this usually costs nothing extra.
  const discovery = await discoverModels();
  const providers = await listProviders();

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
