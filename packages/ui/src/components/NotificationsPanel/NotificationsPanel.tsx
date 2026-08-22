'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './NotificationsPanel.module.css';

export interface NotificationsPanelItem {
  id: string;
  /** Category icon, already resolved (sized + colored) by the consumer —
   *  this component doesn't own category → color mapping. */
  icon: ReactNode;
  title: string;
  /** Pre-formatted relative time (e.g. "2d ago") — formatting stays
   *  consumer-side so this component needs no Date/clock dependency. */
  timeLabel: string;
  read: boolean;
  /** Renders the title as a link when set. */
  href?: string;
  /** Called when the title is clicked/tapped — typically "mark as read". */
  onOpen?: () => void;
  onDismiss: () => void;
}

export interface NotificationsPanelProps {
  items: NotificationsPanelItem[];
  unreadCount: number;
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
  emptyMessage?: string;
  /** Trigger button's accessible label base — the unread count is appended
   *  automatically, matching the real NotificationBell. Defaults to
   *  "Notifications". */
  'aria-label'?: string;
  align?: 'left' | 'right';
}

function NotificationRow({ item }: { item: NotificationsPanelItem }) {
  const titleContent = item.href ? (
    <a href={item.href} className={styles.itemTitle} onClick={item.onOpen}>
      {item.title}
    </a>
  ) : !item.read ? (
    <button
      type="button"
      className={styles.itemTitle}
      aria-label={`Mark as read: ${item.title}`}
      onClick={item.onOpen}
    >
      {item.title}
    </button>
  ) : (
    <span className={styles.itemTitle}>{item.title}</span>
  );

  return (
    <li className={[styles.item, item.read ? styles.itemRead : ''].filter(Boolean).join(' ')}>
      <div className={styles.categoryIcon}>{item.icon}</div>
      <div className={styles.itemBody}>
        {titleContent}
        <span className={styles.itemTime}>{item.timeLabel}</span>
      </div>
      <div className={styles.itemEnd}>
        {!item.read && <span className={styles.unreadDot} aria-label="Unread" />}
        <button
          type="button"
          className={styles.dismissBtn}
          aria-label={`Dismiss: ${item.title}`}
          onClick={item.onDismiss}
        >
          <Icon name="x" size="sm" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/**
 * NotificationsPanel — the bell trigger + dropdown, generalized from the
 * runtime shell's own `NotificationBell.tsx` visual structure and copy
 * (title / Mark all read / Clear all / close, then a list of category-icon +
 * title + time + unread-dot + dismiss rows, or an empty state).
 *
 * Deliberately **presentational only** — no fetch/SSE/polling, no
 * category → color mapping, no mark-read/dismiss networking. The real
 * `NotificationBell` owns real platform data (`/api/account/notifications`,
 * a shared cross-instance store); this component can't and shouldn't know
 * about that (SDK boundary). The consumer supplies `items` already resolved
 * and wires `onOpen`/`onDismiss`/`onMarkAllRead`/`onClearAll` to whatever
 * its own data layer needs, against a shared panel instead of a
 * `shell: minimal` plugin hand-rebuilding one locally. Built on the shared
 * `Popover` primitive (self-contained open state) rather than the
 * original's hand-rolled outside-click/Escape listener.
 */
export function NotificationsPanel({
  items,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  emptyMessage = 'No notifications.',
  'aria-label': ariaLabel = 'Notifications',
  align = 'right',
}: NotificationsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      align={align}
      width={340}
      aria-label={ariaLabel}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${ariaLabel} (${unreadCount} unread)` : ariaLabel}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={styles.trigger}
        >
          {/* size="lg" (24px), not "md" (20px) — matches the real
              NotificationBell's own inline SVG, which is literally
              width="24" height="24", not the DS Icon scale's "md" step. */}
          <Icon name="bell" size="lg" aria-hidden />
          {unreadCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      }
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>{ariaLabel}</span>
        <div className={styles.headerActions}>
          {items.length > 0 && (
            <>
              {unreadCount > 0 && onMarkAllRead && (
                <button type="button" className={styles.actionBtn} onClick={onMarkAllRead}>
                  Mark all read
                </button>
              )}
              {onClearAll && (
                <button type="button" className={styles.actionBtn} onClick={onClearAll}>
                  Clear all
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={styles.closeBtn}
            aria-label={`Close ${ariaLabel.toLowerCase()}`}
            onClick={() => setOpen(false)}
          >
            <Icon name="x" size="sm" aria-hidden />
          </button>
        </div>
      </div>

      <ul className={styles.list} aria-label={`${ariaLabel} list`}>
        {items.length === 0 ? (
          <li className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Icon name="bell" size="lg" aria-hidden />
            </span>
            <span className={styles.emptyText}>{emptyMessage}</span>
          </li>
        ) : (
          items.map((item) => <NotificationRow key={item.id} item={item} />)
        )}
      </ul>
    </Popover>
  );
}
