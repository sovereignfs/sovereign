import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { isSidebarCollapsed, SIDEBAR_COOKIE_NAME } from '../_lib/sidebar-preference';
import { WardenLayoutShell } from '../_components/WardenLayoutShell';
import { WardenSidebar } from '../_components/WardenSidebar';
import { WardenSidebarLoader } from '../_components/WardenSidebarLoader';
import styles from '../warden.module.css';

/**
 * Owns the chat shell — the collapsible sidebar and the column the chat
 * renders into — for `/warden`, `/warden/new`, `/warden/providers` and
 * `/warden/models` alike.
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
 * **This layout awaits nothing that does I/O.** (`cookies()` below reads the
 * already-parsed request — no round trip.) A `loading.tsx` only ever wraps the page
 * *below* its own segment's layout, so any `await` here blocks the whole
 * route — shell, sidebar and spinner alike — from painting at all. That is
 * exactly what happened when this layout resolved the session list and a
 * live model-discovery pass inline: clicking the Warden icon showed nothing
 * for as long as the slowest configured provider took to answer (up to 8s),
 * and the earlier root-level `loading.tsx` fix had quietly stopped applying.
 * The sidebar's data lives in `WardenSidebarLoader` behind its own
 * `<Suspense>`, with the static chrome as the fallback, so the first flush
 * carries the shell and the session list streams in behind it.
 *
 * Scoped to a `(chat)` route group (no effect on the URL) so a sibling
 * route outside the group would keep its own `PageContainer` layout and not
 * inherit the chat shell.
 *
 * Layouts receive no `searchParams`, so which row is highlighted can't be
 * resolved here; `WardenSidebar` derives it client-side from the URL via
 * the shared `resolveActiveSessionId` rule.
 */
export default async function WardenChatLayout({ children }: { children: ReactNode }) {
  // The sidebar's collapsed/expanded preference, so the first paint is
  // already in the right state instead of jumping after hydration — see
  // `sidebar-preference.ts`.
  const jar = await cookies();
  const initialCollapsed = isSidebarCollapsed(jar.get(SIDEBAR_COOKIE_NAME)?.value);

  return (
    <div className={styles.page} data-plugin-fullbleed>
      <WardenLayoutShell
        initialCollapsed={initialCollapsed}
        sidebar={
          <Suspense
            fallback={
              <WardenSidebar
                pinnedSessions={[]}
                recentSessions={[]}
                orderedSessionIds={[]}
                loading
              />
            }
          >
            <WardenSidebarLoader />
          </Suspense>
        }
      >
        {children}
      </WardenLayoutShell>
    </div>
  );
}
