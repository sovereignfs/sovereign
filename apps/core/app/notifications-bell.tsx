'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, NotificationsPanel, type IconName } from '@sovereignfs/ui';

type Item = {
  id: string;
  appName: string;
  title: string;
  body: string | null;
  url: string | null;
  category: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
  readAt: number | null;
};

const ICONS: Record<Item['category'], IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  error: 'alert-triangle',
};

/** How long ago, in the words a person uses. */
export function ago(then: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** A link is followed only if it is a web address: what is stored is trusted no further than that. */
const safeHref = (url: string | null): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const REFRESH_MS = 60_000;

/**
 * Core's bell (core-app §4.1): what apps told the person, newest first, with how many are unread. It asks when the page loads and
 * every minute while the page is visible (there is no push in Phase 2), and again after anything the person does to it. Titles and
 * bodies are text, never markup. Choosing one marks it read and goes to its link in the same tab.
 */
export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const reply = await fetch('/api/notifications', { cache: 'no-store' });
      if (!reply.ok) return;
      const body = (await reply.json()) as { unread: number; notifications: Item[] };
      setItems(body.notifications);
      setUnread(body.unread);
    } catch {
      // Offline or core is restarting: the next ask will do.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const act = useCallback(
    async (action: string, id?: string) => {
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...(id ? { id } : {}) }),
          // The page may be about to go to the notification's link.
          keepalive: true,
        });
      } finally {
        void load();
      }
    },
    [load],
  );

  return (
    <NotificationsPanel
      unreadCount={unread}
      emptyMessage="Nothing new."
      onMarkAllRead={() => void act('read-all')}
      onClearAll={() => void act('dismiss-all')}
      items={items.map((item) => {
        const href = safeHref(item.url);
        return {
          id: item.id,
          icon: <Icon name={ICONS[item.category] ?? 'info'} size="sm" aria-hidden />,
          title: item.body
            ? `${item.appName}: ${item.title}. ${item.body}`
            : `${item.appName}: ${item.title}`,
          timeLabel: ago(item.createdAt),
          read: item.readAt !== null,
          ...(href ? { href } : {}),
          onOpen: () => void act('read', item.id),
          onDismiss: () => void act('dismiss', item.id),
        };
      })}
    />
  );
}
