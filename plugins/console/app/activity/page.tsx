import styles from '../console.module.css';

const SELF_URL = 'http://localhost:3000';

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

async function getActivity(): Promise<ActivityEvent[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/activity`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch activity: ${res.status}`);
  const data = (await res.json()) as { events: ActivityEvent[] };
  return data.events;
}

function actorLabel(event: ActivityEvent): string {
  if (event.actorType === 'system') return 'System';
  if (event.actorType === 'plugin' && event.pluginId) return event.pluginId;
  return event.actorId ? event.actorId.slice(0, 8) : '—';
}

export default async function ActivityPage() {
  const events = await getActivity();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Activity</h2>
      </div>

      {events.length === 0 ? (
        <p className={styles.textMuted}>No activity recorded yet.</p>
      ) : (
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
      )}
    </div>
  );
}
