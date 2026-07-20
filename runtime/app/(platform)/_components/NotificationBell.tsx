'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

const POLL_INTERVAL_MS = 10_000;
const SSE_ERROR_FALLBACK_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Shared store — NotificationBell is mounted twice at once (sidebar + mobile
// header; visibility between them is CSS-only, both exist in the DOM). Without
// this, each instance ran its own fetch, its own 10s poll loop, and its own
// EventSource, doubling DB/connection load for no benefit since only one bell
// is ever visible. Everything below is module-level state shared by every
// mounted instance, following React's external-store pattern so components
// just subscribe via `useSyncExternalStore`.
// ---------------------------------------------------------------------------

interface NotificationStore {
  items: NotificationItem[];
  unreadCount: number;
  transport: 'polling' | 'sse';
}

let store: NotificationStore = { items: [], unreadCount: 0, transport: 'polling' };
const listeners = new Set<() => void>();
const seenIds = new Set<string>();
let initialFetchDone = false;
let subscriberCount = 0;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let sseConnection: EventSource | null = null;
let sseErrorCount = 0;
// Set by whichever mounted instance last rendered — all instances share the
// same ToastProvider context, so any one of them can show a toast.
let showToast: ((opts: { title: string; message?: string; category: string }) => void) | null =
  null;

function getSnapshot(): NotificationStore {
  return store;
}

function setStore(patch: Partial<NotificationStore>): void {
  const transportChanged = patch.transport !== undefined && patch.transport !== store.transport;
  store = { ...store, ...patch };
  if (transportChanged && subscriberCount > 0) {
    startTransportLoop();
  }
  for (const listener of listeners) listener();
}

function stopTransportLoop(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
}

function startTransportLoop(): void {
  stopTransportLoop();
  if (store.transport === 'sse') {
    sseErrorCount = 0;
    const es = new EventSource('/api/account/notifications/stream');
    sseConnection = es;

    es.onmessage = (event: MessageEvent<string>) => {
      sseErrorCount = 0;
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
          showToast?.({
            title: newItem.title,
            message: newItem.body ?? undefined,
            category: newItem.category,
          });
          setStore({ items: [newItem, ...store.items], unreadCount: store.unreadCount + 1 });
        }
      } catch {
        // Malformed payload — ignore.
      }
    };

    es.onerror = () => {
      sseErrorCount += 1;
      if (sseErrorCount >= SSE_ERROR_FALLBACK_THRESHOLD) {
        setStore({ transport: 'polling' });
      }
    };
  } else {
    pollHandle = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
  }
}

async function fetchNotifications(opts?: { silent?: boolean }): Promise<void> {
  try {
    const res = await fetch('/api/account/notifications', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = (await res.json()) as NotificationResponse;

    const isFirstFetch = !initialFetchDone;

    for (const item of data.notifications) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        if (!isFirstFetch && !opts?.silent && item.readAt == null) {
          showToast?.({
            title: item.title,
            message: item.body ?? undefined,
            category: item.category,
          });
        }
      }
    }

    initialFetchDone = true;

    setStore({
      items: data.notifications,
      unreadCount: data.unreadCount,
      transport: data.transport ?? store.transport,
    });
  } catch {
    // Silently ignore transient fetch failures.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    startTransportLoop();
    void fetchNotifications({ silent: true });
  }
  return () => {
    listeners.delete(listener);
    subscriberCount -= 1;
    if (subscriberCount === 0) {
      stopTransportLoop();
    }
  };
}

async function markAllReadShared(): Promise<void> {
  await fetch('/api/account/notifications', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'read-all' }),
  });
  setStore({
    items: store.items.map((n) => ({ ...n, readAt: Math.floor(Date.now() / 1000) })),
    unreadCount: 0,
  });
}

async function markReadShared(id: string): Promise<void> {
  const item = store.items.find((n) => n.id === id);
  if (!item || item.readAt != null) return;
  setStore({
    items: store.items.map((n) =>
      n.id === id ? { ...n, readAt: Math.floor(Date.now() / 1000) } : n,
    ),
    unreadCount: Math.max(0, store.unreadCount - 1),
  });
  await fetch('/api/account/notifications', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'read', id }),
  });
}

async function dismissShared(id: string): Promise<void> {
  await fetch('/api/account/notifications', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dismiss', id }),
  });
  const item = store.items.find((n) => n.id === id);
  setStore({
    items: store.items.filter((n) => n.id !== id),
    unreadCount: item?.readAt == null ? Math.max(0, store.unreadCount - 1) : store.unreadCount,
  });
}

async function clearAllShared(): Promise<void> {
  await Promise.all(
    store.items.map((item) =>
      fetch('/api/account/notifications', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', id: item.id }),
      }),
    ),
  );
  setStore({ items: [], unreadCount: 0 });
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'Yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
}

function categoryColorClass(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('user') || c.includes('invite') || c.includes('join'))
    return styles.iconGreen ?? '';
  if (
    c.includes('security') ||
    c.includes('session') ||
    c.includes('auth') ||
    c.includes('warning')
  )
    return styles.iconAmber ?? '';
  return styles.iconNeutral ?? '';
}

function CategoryIcon({ category }: { category: string }) {
  const c = category.toLowerCase();
  if (c.includes('user') || c.includes('invite') || c.includes('join')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" x2="19" y1="8" y2="14" />
        <line x1="22" x2="16" y1="11" y2="11" />
      </svg>
    );
  }
  if (
    c.includes('security') ||
    c.includes('session') ||
    c.includes('auth') ||
    c.includes('warning')
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  // default: package/layers for plugin/system
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.9a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.81l-3.5-1.6" />
      <path d="m6.08 14.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.9a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.81l-3.5-1.6" />
    </svg>
  );
}

export function NotificationBell({ placement = 'header' }: { placement?: 'sidebar' | 'header' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sidebarPanelBottom, setSidebarPanelBottom] = useState<number>(16);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { items, unreadCount } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Whichever instance rendered most recently "owns" the toast callback used by
  // the shared fetch/SSE loop — all instances share the same ToastProvider
  // context, so it doesn't matter which one's `toast.show` gets called.
  useEffect(() => {
    showToast = toast.show;
  }, [toast]);

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

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${placement === 'sidebar' ? styles.triggerSidebar : ''} ${open ? (placement === 'sidebar' ? styles.triggerSidebarActive : styles.triggerActive) : ''}`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => {
            if (!o) {
              void fetchNotifications({ silent: true });
              if (placement === 'sidebar' && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setSidebarPanelBottom(window.innerHeight - rect.bottom);
              }
            }
            return !o;
          });
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
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
          style={placement === 'sidebar' ? { bottom: sidebarPanelBottom } : undefined}
        >
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            <div className={styles.headerActions}>
              {items.length > 0 && (
                <>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => void markAllReadShared()}
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void clearAllShared()}
                  >
                    Clear all
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <ul className={styles.list} aria-label="Notification list">
            {items.length === 0 && (
              <li className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                    <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                    <path d="M18 8a6 6 0 0 0-9.33-5" />
                    <line x1="1" x2="23" y1="1" y2="23" />
                  </svg>
                </div>
                <span className={styles.emptyText}>No notifications.</span>
              </li>
            )}
            {items.map((item) => (
              <li
                key={item.id}
                className={`${styles.item} ${item.readAt != null ? styles.itemRead : ''}`}
              >
                <div className={`${styles.categoryIcon} ${categoryColorClass(item.category)}`}>
                  <CategoryIcon category={item.category} />
                </div>
                <div className={styles.itemBody}>
                  {item.url ? (
                    <a
                      href={item.url}
                      className={styles.itemTitle}
                      onClick={() => {
                        void markReadShared(item.id);
                        setOpen(false);
                      }}
                    >
                      {item.title}
                    </a>
                  ) : item.readAt == null ? (
                    <button
                      type="button"
                      className={styles.itemTitle}
                      aria-label={`Mark as read: ${item.title}`}
                      onClick={() => void markReadShared(item.id)}
                    >
                      {item.title}
                    </button>
                  ) : (
                    <span className={styles.itemTitle}>{item.title}</span>
                  )}
                  <span className={styles.itemTime}>{timeAgo(item.createdAt)}</span>
                </div>
                <div className={styles.itemEnd}>
                  {item.readAt == null && <span className={styles.unreadDot} aria-label="Unread" />}
                  <button
                    type="button"
                    className={styles.dismissBtn}
                    aria-label={`Dismiss: ${item.title}`}
                    onClick={() => void dismissShared(item.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
