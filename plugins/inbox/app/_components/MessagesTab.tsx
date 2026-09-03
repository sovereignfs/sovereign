'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, EmptyState, Spinner } from '@sovereignfs/ui';
import styles from '../inbox.module.css';

const PAGE_SIZE = 20;

type MessageFilter = 'inbox' | 'archived' | 'unread';

interface MessageListItem {
  id: string;
  senderType: string;
  senderDisplay: string | null;
  subject: string;
  bodyPreview: string | null;
  createdAt: number;
  readAt: number | null;
}

interface MessagesResponse {
  items: MessageListItem[];
  total: number;
}

function formatTime(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function senderLabel(item: MessageListItem): string {
  if (item.senderDisplay) return item.senderDisplay;
  if (item.senderType === 'admin') return 'Admin';
  if (item.senderType === 'platform') return 'Sovereign';
  return 'App';
}

/** The RFC 0048 Message Inbox list — filter (inbox/archived/unread) + offset pagination, mirroring `plugins/account/app/activity/page.tsx`'s pattern. */
export function MessagesTab() {
  const [items, setItems] = useState<MessageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<MessageFilter>('inbox');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, targetFilter: MessageFilter) => {
    setLoading(true);
    setError(null);
    const offset = (targetPage - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      filter: targetFilter,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    try {
      const res = await fetch(`/api/inbox/messages?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
      const data = (await res.json()) as MessagesResponse;
      setItems(data.items);
      setTotal(data.total);
      setPage(targetPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, filter);
  }, [load, filter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.filterGroup}>
        {(['inbox', 'archived', 'unread'] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {value === 'inbox' ? 'Inbox' : value === 'archived' ? 'Archived' : 'Unread'}
          </Button>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <p style={{ color: 'var(--sv-color-error-text)' }}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="mail"
          heading={filter === 'archived' ? 'No archived messages' : 'No messages'}
          description="Messages from admins and apps will show up here."
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/inbox/messages/${item.id}`} className={styles.row}>
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
                        {item.subject}
                      </span>
                    </span>
                    <span className={styles.rowTime}>{formatTime(item.createdAt)}</span>
                  </div>
                  <p className={styles.rowPreview}>
                    {senderLabel(item)}
                    {item.bodyPreview ? ` — ${item.bodyPreview}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.paginationControls}>
            <button
              type="button"
              onClick={() => void load(page - 1, filter)}
              disabled={page <= 1 || loading}
              className={styles.paginationButton}
            >
              Previous
            </button>
            <span className={styles.paginationInfo}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => void load(page + 1, filter)}
              disabled={page >= totalPages || loading}
              className={styles.paginationButton}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
