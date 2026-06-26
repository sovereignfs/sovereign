import Link from 'next/link';
import { Badge } from '@sovereignfs/ui';
import { ActivitySearch } from '../_components/ActivitySearch';
import styles from '../console.module.css';

const PAGE_SIZE = 8;
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

async function getActivity(offset: number, q?: string): Promise<ActivityResponse> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  let url = `${SELF_URL}/api/admin/activity?limit=${PAGE_SIZE}&offset=${offset}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
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
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q = '' } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1'));
  const offset = (page - 1) * PAGE_SIZE;

  const { events, total } = await getActivity(offset, q || undefined);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  return (
    <div>
      <ActivitySearch total={total} initialQ={q} />

      {events.length === 0 ? (
        <div className={styles.tableCard}>
          <p className={styles.emptyTableMsg}>No activity recorded yet.</p>
        </div>
      ) : (
        <>
          <div className={styles.tableCard}>
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
                        <time
                          dateTime={new Date(event.createdAt * 1000).toISOString()}
                          className={styles.activityWhen}
                        >
                          {new Date(event.createdAt * 1000).toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </time>
                      </td>
                      <td className={styles.td}>
                        <code className={styles.activityActor}>{actorLabel(event)}</code>
                      </td>
                      <td className={styles.td}>
                        <code className={styles.activityEvent}>{event.action}</code>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.activitySummary}>{event.summary ?? '—'}</span>
                      </td>
                      <td className={styles.td}>
                        <Badge variant="role">{event.visibility}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.usersPagination}>
            <span className={styles.paginationInfo}>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className={styles.paginationControls}>
              {safePage > 1 ? (
                <Link
                  replace
                  href={`?page=${safePage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className={styles.paginationLink}
                >
                  Previous
                </Link>
              ) : (
                <span className={styles.paginationDisabled}>Previous</span>
              )}
              <span className={styles.paginationInfo}>
                {safePage} / {totalPages}
              </span>
              {safePage < totalPages ? (
                <Link
                  replace
                  href={`?page=${safePage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className={styles.paginationLink}
                >
                  Next
                </Link>
              ) : (
                <span className={styles.paginationDisabled}>Next</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
