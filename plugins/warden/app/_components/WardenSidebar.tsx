'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  ConfirmDialog,
  Icon,
  Menu,
  NavList,
  Spinner,
  useCommitOnEnterOrBlur,
  useToast,
} from '@sovereignfs/ui';
import type { MenuEntry, NavListGroup } from '@sovereignfs/ui';
import {
  deleteSessionAction,
  pinSessionAction,
  renameSessionAction,
  unpinSessionAction,
} from '../actions';
import { SIDEBAR_RECENT_LIMIT, type SessionView } from '../_lib/sessions';
import {
  MODELS_PATHNAME,
  NEW_CHAT_PATHNAME,
  PROVIDERS_PATHNAME,
  resolveActiveSessionId,
} from '../_lib/active-session';
import { useWardenShell } from './WardenLayoutShell';
import { WardenSettingsDialog } from './WardenSettingsDialog';
import styles from './warden-sidebar.module.css';

/**
 * Warden's session sidebar (RFC 0063 §10, epic task 22.10). Purely
 * presentational — `pinnedSessions`/`recentSessions` are already grouped
 * and sorted server-side (`app/page.tsx`), so this component never
 * re-derives which group a session belongs in.
 *
 * Every mutation (rename/pin/unpin/delete) calls its server action, then
 * `router.refresh()` to re-fetch the list from the server — same
 * mutate-then-refresh pattern `ProvidersView`/`ModelsView` already use.
 *
 * Which row is highlighted is derived here from the URL rather than handed
 * down as a prop: this component now renders from `app/(chat)/layout.tsx`
 * (so it survives navigation between `/warden` and `/warden/new` instead of
 * being rebuilt each time), and a layout receives no `searchParams`. The
 * composer's own session comes from the server applying the *same*
 * `resolveActiveSessionId` rule to the same ordered list, so the two still
 * can never disagree about which session is "open".
 *
 * The collapse toggle comes from `WardenLayoutShell` via `useWardenShell()`
 * (it owns the collapse state, this component doesn't) — when the shell is
 * present, a collapse button renders at the top of the sidebar itself, since
 * the button should live inside the sidebar while it's visible and move back
 * to the main column only once collapsing hides the sidebar entirely.
 *
 * `loading` is the layout's streaming fallback: the static chrome (primary
 * nav, Settings) paints immediately with a spinner where the session list
 * will land, so opening Warden never waits on a database read before the
 * shell is on screen. The real list replaces it once `WardenSidebarLoader`
 * resolves — same chrome either side, so the swap is seamless.
 */
export function WardenSidebar({
  pinnedSessions,
  recentSessions,
  orderedSessionIds,
  loading = false,
}: {
  pinnedSessions: SessionView[];
  recentSessions: SessionView[];
  /** Every session id in `listSessions()` order — needed to apply the same
   *  "no `?session=` falls back to the most recent" rule the server uses. */
  orderedSessionIds: string[];
  loading?: boolean;
}) {
  const shell = useWardenShell();
  // Inside the mobile Sheet the overlay's own close button does this job.
  const onToggleCollapse = shell && !shell.inOverlay ? shell.toggleCollapse : undefined;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Derived from the URL rather than passed in — this renders from a
  // layout, which gets no `searchParams`. Shares one rule with the server
  // so the highlighted row and the loaded conversation can't drift apart.
  const activeSessionId = resolveActiveSessionId(
    orderedSessionIds,
    searchParams.get('session'),
    pathname === NEW_CHAT_PATHNAME,
  );
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [query, setQuery] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Beyond the first `SIDEBAR_RECENT_LIMIT` the Recent group folds, with a
  // "Show more" and — once there is enough to lose something in — a search
  // across every chat, pinned or not. A hard cutoff (the previous behaviour)
  // made the eleventh chat unreachable except by pinning it first.
  const totalSessions = pinnedSessions.length + recentSessions.length;
  const searchable = totalSessions > SIDEBAR_RECENT_LIMIT;
  const trimmedQuery = query.trim().toLowerCase();
  const matchesQuery = (session: SessionView) =>
    (session.title ?? 'New chat').toLowerCase().includes(trimmedQuery);
  const visiblePinned = trimmedQuery ? pinnedSessions.filter(matchesQuery) : pinnedSessions;
  const matchingRecent = trimmedQuery ? recentSessions.filter(matchesQuery) : recentSessions;
  const folded = !trimmedQuery && !showAllRecent && matchingRecent.length > SIDEBAR_RECENT_LIMIT;
  const visibleRecent = folded ? matchingRecent.slice(0, SIDEBAR_RECENT_LIMIT) : matchingRecent;
  const hiddenRecentCount = matchingRecent.length - visibleRecent.length;

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  function startRename(session: SessionView) {
    setMenuOpenId(null);
    setRenamingId(session.id);
    setRenameValue(session.title ?? '');
  }

  function commitRename() {
    const sessionId = renamingId;
    if (!sessionId) return;
    setRenamingId(null);
    startTransition(async () => {
      const result = await renameSessionAction(sessionId, renameValue);
      if (!result.ok)
        toast.show({ title: 'Could not rename session', message: result.error, category: 'error' });
      router.refresh();
    });
  }

  const renameHandlers = useCommitOnEnterOrBlur(commitRename);

  function handlePin(session: SessionView) {
    setMenuOpenId(null);
    startTransition(async () => {
      const action = session.pinnedAt === null ? pinSessionAction : unpinSessionAction;
      const result = await action(session.id);
      if (!result.ok) {
        toast.show({
          title: session.pinnedAt === null ? 'Could not pin session' : 'Could not unpin session',
          message: result.error,
          category: 'error',
        });
      }
      router.refresh();
    });
  }

  function confirmDelete() {
    const sessionId = confirmDeleteId;
    if (!sessionId) return;
    setDeletePending(true);
    startTransition(async () => {
      const result = await deleteSessionAction(sessionId);
      setDeletePending(false);
      setConfirmDeleteId(null);
      if (!result.ok) {
        toast.show({ title: 'Could not delete session', message: result.error, category: 'error' });
      } else if (sessionId === activeSessionId) {
        router.push('/warden');
      } else {
        router.refresh();
      }
    });
  }

  function menuItemsFor(session: SessionView): MenuEntry[] {
    return [
      { label: 'Rename', icon: 'pencil', onSelect: () => startRename(session) },
      {
        label: session.pinnedAt === null ? 'Pin' : 'Unpin',
        icon: 'pin',
        onSelect: () => handlePin(session),
      },
      { type: 'separator' },
      {
        label: 'Delete',
        icon: 'trash-2',
        destructive: true,
        onSelect: () => {
          setMenuOpenId(null);
          setConfirmDeleteId(session.id);
        },
      },
    ];
  }

  function renderRow(session: SessionView) {
    const isActive = session.id === activeSessionId;
    const isRenaming = session.id === renamingId;
    const label = session.title ?? 'New chat';

    return (
      <div key={session.id} className={isActive ? `${styles.row} ${styles.rowActive}` : styles.row}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={renameHandlers.onKeyDown}
            onBlur={renameHandlers.onBlur}
            aria-label={`Rename "${label}"`}
          />
        ) : (
          <Link
            href={`/warden?session=${session.id}`}
            className={styles.rowLabel}
            // The active row was conveyed by background colour alone, which
            // no screen reader announces. `NavList` above already does this.
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        )}
        {!isRenaming && (
          <Menu
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.rowMenuTrigger}
                aria-label={`Options for "${label}"`}
                onClick={() => setMenuOpenId(menuOpenId === session.id ? null : session.id)}
              >
                <Icon name="ellipsis-vertical" size="sm" aria-hidden />
              </Button>
            }
            open={menuOpenId === session.id}
            onClose={() => setMenuOpenId(null)}
            items={menuItemsFor(session)}
            aria-label={`Session options for "${label}"`}
            width={180}
          />
        )}
      </div>
    );
  }

  const deletingSession = [...pinnedSessions, ...recentSessions].find(
    (s) => s.id === confirmDeleteId,
  );

  const primaryNavGroups: NavListGroup[] = [
    {
      id: 'primary',
      items: [
        {
          id: 'new',
          label: 'New chat',
          href: NEW_CHAT_PATHNAME,
          icon: 'plus',
          active: pathname === NEW_CHAT_PATHNAME,
        },
        // Real destinations inside the chat shell now, not tabs on a
        // separate settings page — so these can genuinely be the active row.
        {
          id: 'providers',
          label: 'Providers',
          href: PROVIDERS_PATHNAME,
          icon: 'link',
          active: pathname === PROVIDERS_PATHNAME,
        },
        {
          id: 'models',
          label: 'Models',
          href: MODELS_PATHNAME,
          icon: 'layers',
          active: pathname === MODELS_PATHNAME,
        },
      ],
    },
  ];

  return (
    <nav className={styles.sidebar} aria-label="Chat sessions">
      {onToggleCollapse && (
        <div className={styles.collapseRow}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Hide sessions sidebar"
            onClick={onToggleCollapse}
          >
            <Icon name="panel-left" size="sm" aria-hidden />
          </Button>
        </div>
      )}

      <div className={styles.primaryNav}>
        <NavList
          groups={primaryNavGroups}
          variant="static"
          density="compact"
          aria-label="Warden navigation"
          renderLink={(_item, linkProps) => (
            <Link
              href={linkProps.href}
              className={linkProps.className}
              aria-current={linkProps['aria-current']}
            >
              {linkProps.children}
            </Link>
          )}
        />
      </div>

      <div className={styles.scrollArea}>
        {loading && (
          <div className={styles.loadingRow}>
            <Spinner label="Loading chats…" />
          </div>
        )}
        {searchable && (
          <label className={styles.searchBar} aria-label="Search chats">
            <Icon name="search" size="sm" aria-hidden className={styles.searchIcon} />
            <input
              type="search"
              placeholder="Search chats…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={styles.searchInput}
            />
          </label>
        )}
        {visiblePinned.length > 0 && (
          <div className={styles.group}>
            <p className={styles.groupLabel}>Pinned</p>
            {visiblePinned.map(renderRow)}
          </div>
        )}
        {!loading && (
          <div className={styles.group}>
            {visiblePinned.length > 0 && <p className={styles.groupLabel}>Recent</p>}
            {totalSessions === 0 ? (
              <p className={styles.emptyText}>No chats yet — start one above.</p>
            ) : trimmedQuery && visiblePinned.length === 0 && visibleRecent.length === 0 ? (
              <p className={styles.emptyText}>No chats match &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              visibleRecent.map(renderRow)
            )}
            {hiddenRecentCount > 0 && (
              <button
                type="button"
                className={styles.showMore}
                onClick={() => setShowAllRecent(true)}
              >
                Show {hiddenRecentCount} more
              </button>
            )}
            {!trimmedQuery && showAllRecent && recentSessions.length > SIDEBAR_RECENT_LIMIT && (
              <button
                type="button"
                className={styles.showMore}
                onClick={() => setShowAllRecent(false)}
              >
                Show fewer
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.settingsLink} onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size="sm" aria-hidden />
          Settings
        </button>
      </div>

      <WardenSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete session"
        message={
          <>
            Delete <strong>{deletingSession?.title ?? 'this session'}</strong>? This can&rsquo;t be
            undone.
          </>
        }
        onConfirm={confirmDelete}
        confirmLabel={deletePending ? 'Deleting…' : 'Delete'}
        destructive
        pending={deletePending}
      />
    </nav>
  );
}
