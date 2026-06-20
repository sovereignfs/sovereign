'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@sovereignfs/ui';
import styles from './NotificationBell.module.css';

interface NotificationItem {
  id: string;
  title: string;
  body?: string | null;
  url?: string | null;
  category: string;
  readAt?: number | null;
  createdAt: number;
}

interface NotificationResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell({ placement = 'header' }: { placement?: 'sidebar' | 'header' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Track which IDs we've already toasted so we don't re-toast on refetch.
  const seenIds = useRef<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/account/notifications', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = (await res.json()) as NotificationResponse;

      // Toast new (unseen) notifications.
      for (const item of data.notifications) {
        if (!seenIds.current.has(item.id)) {
          seenIds.current.add(item.id);
          // Only show a toast for unread items that came in after the initial load.
          if (item.readAt == null && seenIds.current.size > 1) {
            toast.show({
              title: item.title,
              message: item.body ?? undefined,
              category: item.category,
            });
          }
        }
      }

      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silently ignore transient fetch failures.
    }
  }, [toast]);

  // Initial fetch + polling.
  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/account/notifications', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read-all' }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, readAt: Math.floor(Date.now() / 1000) })));
    setUnreadCount(0);
  };

  const dismiss = async (id: string) => {
    await fetch('/api/account/notifications', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', id }),
    });
    setItems((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => {
            if (!o) void fetchNotifications();
            return !o;
          });
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          className={`${styles.panel} ${placement === 'sidebar' ? styles.panelSidebar : styles.panelHeader}`}
        >
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className={styles.list} aria-label="Notification list">
            {items.length === 0 && <li className={styles.empty}>No notifications yet.</li>}
            {items.map((item) => (
              <li
                key={item.id}
                className={`${styles.item} ${item.readAt == null ? styles.unread : ''}`}
              >
                <div className={styles.itemBody}>
                  {item.url ? (
                    <a href={item.url} className={styles.itemTitle} onClick={() => setOpen(false)}>
                      {item.title}
                    </a>
                  ) : (
                    <span className={styles.itemTitle}>{item.title}</span>
                  )}
                  {item.body && <p className={styles.itemMessage}>{item.body}</p>}
                </div>
                <button
                  type="button"
                  className={styles.dismissBtn}
                  aria-label={`Dismiss: ${item.title}`}
                  onClick={() => void dismiss(item.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
