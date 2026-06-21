import Link from 'next/link';
import styles from '../console.module.css';

const PAGE_SIZE = 50;
const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface ActivityEvent {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  subjectUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  pluginId: string | null;
  visibility: string;
  summary: string | null;
  createdAt: number;
}

interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
  limit: number;
  offset: number;
}

async function getActivity(offset: number): Promise<ActivityResponse> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/activity?limit=${PAGE_SIZE}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch activity: ${res.status}`);
  return res.json() as Promise<ActivityResponse>;
}

function actorLabel(event: ActivityEvent): string {
  if (event.actorType === 'system') return 'System';
  if (event.actorType === 'plugin' && event.pluginId) return event.pluginId;
  return event.actorId ? event.actorId.slice(0, 8) : '—';
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1'));
  const offset = (page - 1) * PAGE_SIZE;

  const { events, total } = await getActivity(offset);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Activity</h2>
        <span className={styles.textMuted}>{total} events</span>
      </div>

      {events.length === 0 ? (
        <p className={styles.textMuted}>No activity recorded yet.</p>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>When</th>
                  <th className={styles.th}>Actor</th>
                  <th className={styles.th}>Event</th>
                  <th className={styles.th}>Summary</th>
                  <th className={styles.th}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className={styles.tr}>
                    <td className={styles.td}>
                      <time dateTime={new Date(event.createdAt * 1000).toISOString()}>
                        {new Date(event.createdAt * 1000).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </time>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.textMuted}>{actorLabel(event)}</span>
                    </td>
                    <td className={styles.td}>
                      <code style={{ fontSize: 'var(--sv-font-size-sm)' }}>{event.action}</code>
                    </td>
                    <td className={styles.td}>{event.summary ?? '—'}</td>
                    <td className={styles.td}>
                      <span
                        className={
                          event.visibility === 'admin' ? styles.badgeAdmin : styles.badgeUser
                        }
                      >
                        {event.visibility}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 ? (
                <Link href={`?page=${page - 1}`} className={styles.paginationLink}>
                  ← Previous
                </Link>
              ) : (
                <span className={styles.paginationDisabled}>← Previous</span>
              )}
              <span className={styles.paginationInfo}>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`?page=${page + 1}`} className={styles.paginationLink}>
                  Next →
                </Link>
              ) : (
                <span className={styles.paginationDisabled}>Next →</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
