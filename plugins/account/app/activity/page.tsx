'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../account.module.css';

const PAGE_SIZE = 8;

interface ActivityEvent {
  id: string;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  pluginId: string | null;
  summary: string | null;
  createdAt: number;
}

interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    const offset = (targetPage - 1) * PAGE_SIZE;
    try {
      const res = await fetch(`/api/account/activity?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load activity: ${res.status}`);
      const data = (await res.json()) as ActivityResponse;
      setEvents(data.events);
      setTotal(data.total);
      setPage(targetPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <div className={styles.activityHeader}>
          <p className={styles.sectionSubtitle}>Your recent account activity.</p>
          {total > 0 && <span className={styles.activityCount}>{total} events</span>}
        </div>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text)' }}>{error}</p>}
        {!loading && events.length === 0 && <p className={styles.help}>No activity yet.</p>}

        {events.length > 0 && (
          <>
            <ul className={styles.sessionGroup}>
              {events.map((event) => (
                <li key={event.id} className={styles.activityRow}>
                  <div className={styles.activityInfo}>
                    <span className={styles.activityTitle}>{event.summary ?? event.action}</span>
                    <code className={styles.activityKey}>{event.action}</code>
                  </div>
                  <time
                    dateTime={new Date(event.createdAt * 1000).toISOString()}
                    className={styles.activityTime}
                  >
                    {new Date(event.createdAt * 1000).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                  <span className={styles.activityScope}>{event.actorType}</span>
                </li>
              ))}
            </ul>

            <div className={styles.activityPagination}>
              <span className={styles.paginationInfo}>
                Showing {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  onClick={() => void load(page - 1)}
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
                  onClick={() => void load(page + 1)}
                  disabled={page >= totalPages || loading}
                  className={styles.paginationButton}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
