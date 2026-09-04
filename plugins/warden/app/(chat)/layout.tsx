import type { ReactNode } from 'react';
import { sdk } from '@sovereignfs/sdk';
import { SIDEBAR_RECENT_LIMIT, listSessions } from '../_lib/sessions';
import { discoverModels } from '../_lib/model-discovery';
import { isModelVisible, listVisibilityOverrides } from '../_lib/model-visibility';
import { getDefaultModelKey } from '../_lib/user-settings';
import { WardenLayoutShell } from '../_components/WardenLayoutShell';
import { WardenSidebar } from '../_components/WardenSidebar';
import styles from '../warden.module.css';

/**
 * Owns the chat shell — the collapsible sidebar and the column the chat
 * renders into — for `/warden` and `/warden/new` alike.
 *
 * This deliberately lives in a layout rather than in the pages themselves.
 * When the shell was part of the page, moving between `/warden` and
 * `/warden/new` was a route-segment change, so React tore down and rebuilt
 * the *entire* screen — sidebar included — and the route-level
 * `loading.tsx` fallback covered all of it. Clicking "New chat" therefore
 * read as a full page reload rather than opening a blank composer.
 * A layout is preserved across navigations between the routes it wraps, so
 * now only the chat column swaps and the sidebar never even re-renders.
 *
 * Scoped to a `(chat)` route group (no effect on the URL) so `/warden/
 * settings` — a sibling of this group, not a child — keeps its own
 * `PageContainer` layout and does not inherit the chat shell.
 *
 * Layouts receive no `searchParams`, so which row is highlighted can't be
 * resolved here; `WardenSidebar` derives it client-side from the URL via
 * the shared `resolveActiveSessionId` rule.
 */
export default async function WardenChatLayout({ children }: { children: ReactNode }) {
  const session = await sdk.auth.requireSession();
  // The General settings dialog opens from the sidebar, so its (small,
  // cheap) data is resolved here alongside the session list.
  // `discoverModels()` is memoised for 30s, so this shares the page's own
  // discovery pass rather than triggering a second one.
  const [allSessions, discovery, visibilityOverrides, defaultModelKey] = await Promise.all([
    listSessions(session.user.id, session.user.tenantId),
    discoverModels(),
    listVisibilityOverrides(session.user.id, session.user.tenantId),
    getDefaultModelKey(session.user.id, session.user.tenantId),
  ]);
  const visibleModels = discovery.models.filter((model) =>
    isModelVisible(model.key, visibilityOverrides),
  );

  const pinnedSessions = allSessions
    .filter((s) => s.pinnedAt !== null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  const recentSessions = allSessions
    .filter((s) => s.pinnedAt === null)
    .slice(0, SIDEBAR_RECENT_LIMIT);

  return (
    <div className={styles.page} data-plugin-fullbleed>
      <WardenLayoutShell
        sidebar={
          <WardenSidebar
            pinnedSessions={pinnedSessions}
            recentSessions={recentSessions}
            orderedSessionIds={allSessions.map((s) => s.id)}
            settingsModels={visibleModels}
            settingsDefaultModelKey={defaultModelKey}
          />
        }
      >
        {children}
      </WardenLayoutShell>
    </div>
  );
}
