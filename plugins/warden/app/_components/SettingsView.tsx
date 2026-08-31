'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@sovereignfs/ui';
import type { ModelDiscoveryResult } from '../_lib/model-discovery';
import type { ProviderView } from '../_lib/providers';
import { GeneralSettings } from './GeneralSettings';
import { ModelsView } from './ModelsView';
import { ProvidersView } from './ProvidersView';
import styles from './settings.module.css';

const TAB_VALUES = ['general', 'providers', 'models'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return TAB_VALUES.includes(value as TabValue);
}

/**
 * Warden's consolidated Settings surface (RFC 0063 §11, epic task 22.9) —
 * replaces the standalone `/warden/providers` and `/warden/models` routes
 * with one page, tabbed via `@sovereignfs/ui`'s `Tabs` (the only tab
 * component with a real consumer anywhere in this repo; `NavTabs` has
 * none). `ProvidersView`/`ModelsView` are unchanged — only relocated.
 *
 * The active tab syncs to `?tab=` (not just local state) so a future
 * composer's model-picker popover (task 22.11) can deep-link straight to
 * `/warden/settings?tab=providers` or `?tab=models`.
 */
export function SettingsView({
  providers,
  discovery,
  visibilityOverrides,
  visibleModels,
  defaultModelKey,
}: {
  providers: ProviderView[];
  discovery: ModelDiscoveryResult;
  visibilityOverrides: string[];
  visibleModels: ModelDiscoveryResult['models'];
  defaultModelKey: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: TabValue = isTabValue(requestedTab) ? requestedTab : 'general';

  function selectTab(next: string) {
    router.replace(next === 'general' ? '/warden/settings' : `/warden/settings?tab=${next}`);
  }

  return (
    <div className={styles.page}>
      <Tabs
        items={[
          { value: 'general', label: 'General' },
          { value: 'providers', label: 'Providers' },
          { value: 'models', label: 'Models' },
        ]}
        value={activeTab}
        onChange={selectTab}
        aria-label="Settings sections"
      />
      {activeTab === 'general' && (
        <GeneralSettings visibleModels={visibleModels} defaultModelKey={defaultModelKey} />
      )}
      {activeTab === 'providers' && <ProvidersView providers={providers} discovery={discovery} />}
      {activeTab === 'models' && (
        <ModelsView discovery={discovery} visibilityOverrides={visibilityOverrides} />
      )}
    </div>
  );
}
