'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../account.module.css';

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

function formatAction(event: ActivityEvent): string {
  if (event.summary) return event.summary;
  return event.action;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/activity', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load activity: ${res.status}`);
      const data = (await res.json()) as { events: ActivityEvent[] };
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Activity</h2>
        <p className={styles.help}>Your recent account activity.</p>

        {loading && <p className={styles.help}>Loading&hellip;</p>}
        {error && <p style={{ color: 'var(--sv-color-error-text, red)' }}>{error}</p>}

        {!loading && events.length === 0 && <p className={styles.help}>No activity yet.</p>}

        {events.length > 0 && (
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
        )}
      </section>
    </div>
  );
}
