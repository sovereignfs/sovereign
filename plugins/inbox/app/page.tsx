import { sdk } from '@sovereignfs/sdk';
import { PageContainer, PageHeader } from '@sovereignfs/ui';
import { InboxTabs } from './_components/InboxTabs';

/**
 * Inbox's home — notifications and messages, tabbed (RFC 0048; workstream
 * 0018 leg 1). `type: "platform"` plugin (`fs.sovereign.inbox`), reached via
 * the shell bell (see `runtime/app/(platform)/_components/NotificationBell.tsx`),
 * not a Launcher tile (`CHROME_PLUGIN_IDS`).
 */
export default async function InboxPage() {
  await sdk.auth.requireSession();

  return (
    <PageContainer maxWidth="md">
      <PageHeader title="Inbox" description="Notifications and messages." />
      <InboxTabs />
    </PageContainer>
  );
}
