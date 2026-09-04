import { sdk } from '@sovereignfs/sdk';
import { PageContainer, PageHeader } from '@sovereignfs/ui';
import { discoverModels } from '../../_lib/model-discovery';
import { listVisibilityOverrides } from '../../_lib/model-visibility';
import { ModelsView } from '../../_components/ModelsView';
import styles from '../../warden.module.css';

/**
 * Model visibility, rendered in the chat shell's main column — see
 * `../providers/page.tsx` for why these are routes again rather than tabs
 * on a separate settings page.
 */
export default async function WardenModelsPage() {
  const session = await sdk.auth.requireSession();
  const [discovery, visibilityOverrides] = await Promise.all([
    discoverModels(),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
  ]);

  return (
    <div className={styles.paneScroll}>
      <PageContainer maxWidth="md">
        <PageHeader
          title="Models"
          description="Choose which models appear in the chat model picker."
        />
        <ModelsView discovery={discovery} visibilityOverrides={[...visibilityOverrides]} />
      </PageContainer>
    </div>
  );
}
