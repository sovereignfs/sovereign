'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@sovereignfs/ui';
import styles from './NotificationBell.module.css';

// Module-level singletons shared across all NotificationBell instances (sidebar + header are
// both mounted in the same page). This ensures exactly one toast fires per new notification
// regardless of how many bell components are polling concurrently.
const seenIds = new Set<string>();
let initialFetchDone = false;

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
  transport?: 'polling' | 'sse';
}

interface SsePayload {
  notificationId: string;
  userId: string;
  title: string;
  body?: string;
  url?: string;
  category: string;
  source?: string;
}

const POLL_INTERVAL_MS = 30_000;
const SSE_ERROR_FALLBACK_THRESHOLD = 3;

export function NotificationBell({ placement = 'header' }: { placement?: 'sidebar' | 'header' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [transport, setTransport] = useState<'polling' | 'sse'>('polling');
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        const res = await fetch('/api/account/notifications', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = (await res.json()) as NotificationResponse;

        if (data.transport && data.transport !== transport) {
          setTransport(data.transport);
        }

        const isFirstFetch = !initialFetchDone;

        for (const item of data.notifications) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            if (!isFirstFetch && !opts?.silent && item.readAt == null) {
              toast.show({
                title: item.title,
                message: item.body ?? undefined,
                category: item.category,
              });
            }
          }
        }

        initialFetchDone = true;

        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {
        // Silently ignore transient fetch failures.
      }
    },
    [toast, transport],
  );

  // Initial fetch — runs once on mount to get transport mode and seed seen-ids.
  useEffect(() => {
    void fetchNotifications({ silent: true });
  }, []); // intentional empty deps: seed is a one-time operation

  // Polling mode: interval fetch. Skipped once SSE takes over.
  useEffect(() => {
    if (transport !== 'polling') return;
    const interval = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [transport, fetchNotifications]);

  // SSE mode: open an EventSource; fall back to polling after 3 consecutive errors.
  useEffect(() => {
    if (transport !== 'sse') return;

    let errorCount = 0;
    const es = new EventSource('/api/account/notifications/stream');

    es.onmessage = (event: MessageEvent<string>) => {
      errorCount = 0;
      try {
        const payload = JSON.parse(event.data) as SsePayload;
        const newItem: NotificationItem = {
          id: payload.notificationId,
          title: payload.title,
          body: payload.body ?? null,
          url: payload.url ?? null,
          category: payload.category,
          readAt: null,
          createdAt: Math.floor(Date.now() / 1000),
        };

        if (!seenIds.has(newItem.id)) {
          seenIds.add(newItem.id);
          toast.show({
            title: newItem.title,
            message: newItem.body ?? undefined,
            category: newItem.category,
          });
          setItems((prev) => [newItem, ...prev]);
          setUnreadCount((c) => c + 1);
        }
      } catch {
        // Malformed payload — ignore.
      }
    };

    es.onerror = () => {
      errorCount += 1;
      if (errorCount >= SSE_ERROR_FALLBACK_THRESHOLD) {
        es.close();
        setTransport('polling');
      }
    };

    return () => es.close();
  }, [transport, toast]);

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
            if (!o) void fetchNotifications({ silent: true });
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
