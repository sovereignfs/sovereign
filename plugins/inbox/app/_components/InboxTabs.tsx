'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@sovereignfs/ui';
import { MessagesTab } from './MessagesTab';
import { NotificationsTab } from './NotificationsTab';
import styles from '../inbox.module.css';

const TAB_VALUES = ['notifications', 'messages'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return (TAB_VALUES as readonly string[]).includes(value ?? '');
}

/**
 * Notifications | Messages, `?tab=` query-synced via `router.replace` —
 * exact pattern copied from `plugins/warden/app/_components/SettingsView.tsx`
 * (`Tabs` is the only tab component with a real consumer anywhere in this
 * repo; `NavTabs` has none). No Preferences tab — notification preferences
 * stay at `/account/notifications`, unchanged, per the leg's own decision.
 */
export function InboxTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: TabValue = isTabValue(requestedTab) ? requestedTab : 'notifications';

  function selectTab(next: string) {
    router.replace(next === 'notifications' ? '/inbox' : `/inbox?tab=${next}`);
  }

  return (
    <div className={styles.page}>
      <Tabs
        items={[
          { value: 'notifications', label: 'Notifications' },
          { value: 'messages', label: 'Messages' },
        ]}
        value={activeTab}
        onChange={selectTab}
        aria-label="Inbox sections"
      />
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'messages' && <MessagesTab />}
    </div>
  );
}
