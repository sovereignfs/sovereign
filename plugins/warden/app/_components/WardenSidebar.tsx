'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  ConfirmDialog,
  Icon,
  Menu,
  useCommitOnEnterOrBlur,
  useToast,
} from '@sovereignfs/ui';
import type { MenuEntry } from '@sovereignfs/ui';
import {
  deleteSessionAction,
  pinSessionAction,
  renameSessionAction,
  unpinSessionAction,
} from '../actions';
import type { SessionView } from '../_lib/sessions';
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
 * `activeSessionId` and the composer's own selected session both derive
 * from the same URL-driven server data (`?session=`), so they can never
 * disagree about which session is "open" (the leg's own "do not proceed
 * if" condition).
 */
export function WardenSidebar({
  pinnedSessions,
  recentSessions,
  activeSessionId,
}: {
  pinnedSessions: SessionView[];
  recentSessions: SessionView[];
  activeSessionId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

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
        {session.pinnedAt !== null && (
          <Icon name="pin" size="xs" aria-hidden className={styles.rowPinIcon} />
        )}
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
          <Link href={`/warden?session=${session.id}`} className={styles.rowLabel}>
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
          />
        )}
      </div>
    );
  }

  const deletingSession = [...pinnedSessions, ...recentSessions].find(
    (s) => s.id === confirmDeleteId,
  );

  return (
    <nav className={styles.sidebar} aria-label="Chat sessions">
      <div className={styles.newSessionRow}>
        <Link href="/warden">
          <Button type="button" variant="secondary" size="sm">
            <Icon name="plus" size="sm" aria-hidden /> New
          </Button>
        </Link>
      </div>

      <div className={styles.scrollArea}>
        {pinnedSessions.length > 0 && (
          <div className={styles.group}>
            <p className={styles.groupLabel}>Pinned</p>
            {pinnedSessions.map(renderRow)}
          </div>
        )}
        <div className={styles.group}>
          {pinnedSessions.length > 0 && <p className={styles.groupLabel}>Recent</p>}
          {recentSessions.length === 0 && pinnedSessions.length === 0 ? (
            <p className={styles.emptyText}>No sessions yet — start one above.</p>
          ) : (
            recentSessions.map(renderRow)
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <Link href="/warden/settings" className={styles.settingsLink}>
          <Icon name="settings" size="sm" aria-hidden />
          Settings
        </Link>
      </div>

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
