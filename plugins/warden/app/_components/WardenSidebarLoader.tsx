import { sdk } from '@sovereignfs/sdk';
import { listSessions } from '../_lib/sessions';
import { WardenSidebar } from './WardenSidebar';

/**
 * The async half of the sidebar: reads this user's sessions and hands the
 * grouped, sorted lists to `WardenSidebar`. Rendered inside a `<Suspense>`
 * by `app/(chat)/layout.tsx`, with `<WardenSidebar loading />` as the
 * fallback — so the layout itself awaits nothing, the shell and the
 * sidebar's static chrome paint on the first flush, and only the session
 * list streams in behind them.
 *
 * Deliberately touches nothing but the sessions table. An earlier version
 * of the layout also awaited `discoverModels()` here so the Settings dialog
 * could be handed its model list up front — which tied painting the
 * sidebar to a live network round trip against every configured provider
 * (up to 8s each on a cold cache). The dialog now loads that itself when
 * opened (`WardenSettingsDialog`), which also means it can never show a
 * list that went stale while the user was on the Models page.
 */
export async function WardenSidebarLoader() {
  const session = await sdk.auth.requireSession();
  const allSessions = await listSessions(session.user.id, session.user.tenantId);

  const pinnedSessions = allSessions
    .filter((s) => s.pinnedAt !== null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  // Every unpinned session, not the first `SIDEBAR_RECENT_LIMIT`: the
  // sidebar applies that limit itself and offers "Show more" and search
  // over the rest, so an older chat is always reachable from here.
  const recentSessions = allSessions.filter((s) => s.pinnedAt === null);

  return (
    <WardenSidebar
      pinnedSessions={pinnedSessions}
      recentSessions={recentSessions}
      orderedSessionIds={allSessions.map((s) => s.id)}
    />
  );
}
