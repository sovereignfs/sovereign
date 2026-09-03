'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Spinner } from '@sovereignfs/ui';
import styles from '../inbox.module.css';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  actionUrl: string | null;
  category: string;
  readAt: number | null;
  createdAt: number;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

function formatTime(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * The RFC 0048 "fuller list than bell panel" notification feed. Click
 * routing mirrors the bell's own rule (`NotificationBell.tsx`): a
 * notification with a full `body` opens its detail page; an action-only
 * notification navigates straight to `actionUrl`; either way it's marked
 * read. No server-side pagination for notifications (bounded, short-lived
 * by nature — dismissed rows drop out); "Unread only" filters the already-
 * fetched list client-side.
 */
export function NotificationsTab() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/notifications?limit=100', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load notifications: ${res.status}`);
      const data = (await res.json()) as NotificationsResponse;
      setItems(data.notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string): Promise<void> {
    await fetch('/api/account/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', id }),
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: Math.floor(Date.now() / 1000) } : n)),
    );
  }

  function handleOpen(item: NotificationItem) {
    void markRead(item.id);
    if (item.body) {
      router.push(`/inbox/${item.id}`);
    } else if (item.actionUrl) {
      router.push(item.actionUrl);
    }
  }

  const visible = unreadOnly ? items.filter((n) => !n.readAt) : items;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <Button
            variant={unreadOnly ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setUnreadOnly(false)}
          >
            All
          </Button>
          <Button
            variant={unreadOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setUnreadOnly(true)}
          >
            Unread
          </Button>
        </div>
        <Link href="/account/notifications" className={styles.help}>
          Notification preferences
        </Link>
      </div>

      {loading && <Spinner />}
      {error && <p style={{ color: 'var(--sv-color-error-text)' }}>{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          icon="bell"
          heading={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
          description="Alerts from apps and admins will show up here."
        />
      )}
      {!loading && visible.length > 0 && (
        <ul className={styles.list}>
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" className={styles.row} onClick={() => handleOpen(item)}>
                <div className={styles.rowHeader}>
                  <span className={styles.rowTitleGroup}>
                    {!item.readAt && <span className={styles.unreadDot} aria-hidden="true" />}
                    <span
                      className={
                        item.readAt
                          ? styles.rowTitle
                          : `${styles.rowTitle} ${styles.rowTitleUnread}`
                      }
                    >
                      {item.title}
                    </span>
                  </span>
                  <span className={styles.rowTime}>{formatTime(item.createdAt)}</span>
                </div>
                {(item.summary ?? item.body) && (
                  <p className={styles.rowPreview}>{item.summary ?? item.body}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
