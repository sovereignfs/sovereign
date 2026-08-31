import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Breadcrumb, PageContainer, PageHeader } from '@sovereignfs/ui';
import { discoverModels } from '../_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from '../_lib/model-visibility';
import { listProviders } from '../_lib/providers';
import { getDefaultModelKey } from '../_lib/user-settings';
import { SettingsView } from '../_components/SettingsView';

/**
 * Warden's consolidated Settings surface (RFC 0063 §11, epic task 22.9) —
 * replaces the standalone `/warden/providers` and `/warden/models` routes
 * (removed outright, no redirect — see workstream 0021's Decisions locked).
 * A Server Component: fetches everything every tab needs up front, so
 * switching tabs is instant client-side state, not a fresh page load.
 */
export default async function WardenSettingsPage() {
  const session = await sdk.auth.requireSession();
  const [providers, discovery, visibilityOverrides, defaultModelKey] = await Promise.all([
    listProviders(),
    discoverModels(),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
    getDefaultModelKey(session.user.id, session.user.tenantId),
  ]);
  const visibleModels = discovery.models.filter((model) =>
    isModelVisible(model.key, visibilityOverrides),
  );

  return (
    <PageContainer maxWidth="md">
      <Breadcrumb
        items={[{ label: 'Chat', href: '/warden' }, { label: 'Settings' }]}
        renderLink={(item, children) => <Link href={item.href ?? '#'}>{children}</Link>}
      />
      <PageHeader
        title="Settings"
        description="Manage your default model, providers, model visibility, retention, and data export."
      />
      <SettingsView
        providers={providers}
        discovery={discovery}
        visibilityOverrides={[...visibilityOverrides]}
        visibleModels={visibleModels}
        defaultModelKey={defaultModelKey}
      />
    </PageContainer>
  );
}
