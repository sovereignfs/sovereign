'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../account.module.css';

const PAGE_SIZE = 50;

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

function formatAction(event: ActivityEvent): string {
  if (event.summary) return event.summary;
  return event.action;
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

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className={styles.sectionTitle}>Activity</h2>
          {total > 0 && (
            <span className={styles.help} style={{ margin: 0 }}>
              {total} events
            </span>
          )}
        </div>
        <p className={styles.help}>Your recent account activity.</p>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text, red)' }}>{error}</p>}

        {!loading && events.length === 0 && <p className={styles.help}>No activity yet.</p>}

        {events.length > 0 && (
          <>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {events.map((event) => (
                <li
                  key={event.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: 'var(--sv-space-3) 0',
                    borderBottom: '1px solid var(--sv-color-border)',
                    gap: 'var(--sv-space-4)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{formatAction(event)}</div>
                    {event.pluginId && (
                      <div
                        style={{
                          fontSize: 'var(--sv-font-size-sm)',
                          color: 'var(--sv-color-text-secondary)',
                        }}
                      >
                        via {event.pluginId}
                      </div>
                    )}
                  </div>
                  <time
                    dateTime={new Date(event.createdAt * 1000).toISOString()}
                    style={{
                      fontSize: 'var(--sv-font-size-sm)',
                      color: 'var(--sv-color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(event.createdAt * 1000).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  onClick={() => void load(page - 1)}
                  disabled={page <= 1 || loading}
                  className={styles.paginationButton}
                >
                  ← Previous
                </button>
                <span className={styles.paginationInfo}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => void load(page + 1)}
                  disabled={page >= totalPages || loading}
                  className={styles.paginationButton}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
