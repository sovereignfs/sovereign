import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Breadcrumb, PageContainer, PageHeader } from '@sovereignfs/ui';
import { discoverModels } from '../_lib/model-discovery';
import { listVisibilityOverrides } from '../_lib/model-visibility';
import { ModelsView } from '../_components/ModelsView';

/**
 * Warden's model visibility settings page. A single provider's catalog can
 * run into the hundreds (OpenRouter alone returns 400+) — this page is
 * where a user curates which ones actually show up in the chat selector,
 * separate from the providers page's job of connecting endpoints. Server
 * Component: fetches a live discovery pass and this user's visibility
 * overrides on every render, matching the providers page's pattern
 * (mutations trigger `router.refresh()` rather than a separate client-side
 * fetch layer).
 */
export default async function WardenModelsPage() {
  const session = await sdk.auth.requireSession();
  const [discovery, visibilityOverrides] = await Promise.all([
    discoverModels(),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
  ]);

  return (
    <PageContainer maxWidth="md">
      <Breadcrumb
        items={[
          { label: 'Chat', href: '/warden' },
          { label: 'Providers', href: '/warden/providers' },
          { label: 'Models' },
        ]}
        renderLink={(item, children) => <Link href={item.href ?? '#'}>{children}</Link>}
      />
      <PageHeader
        title="Models"
        description="The local model shows up automatically. Provider models stay off until you turn them on here — handy since a single provider can offer hundreds."
      />
      <ModelsView discovery={discovery} visibilityOverrides={[...visibilityOverrides]} />
    </PageContainer>
  );
}
