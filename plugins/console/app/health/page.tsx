import styles from '../console.module.css';

const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface HealthReport {
  platformVersion: string;
  database: { dialect: string; status: 'ok' | 'error'; sizeBytes: number | null };
  auth: { status: 'ok' | 'unreachable' };
  uptimeSeconds: number;
}

async function getHealth(): Promise<HealthReport> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/health`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch health: ${res.status}`);
  return res.json() as Promise<HealthReport>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function StatusBadge({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <span className={ok ? styles.badgeActive : styles.badgeDeactivated}>
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default async function HealthPage() {
  const health = await getHealth();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>System health</h2>
      </div>

      <ul className={styles.cards}>
        <li className={styles.healthCard}>
          <span className={styles.cardDesc}>Platform version</span>
          <span className={styles.healthValue}>{health.platformVersion}</span>
        </li>

        <li className={styles.healthCard}>
          <span className={styles.cardDesc}>Database</span>
          <span className={styles.healthValue}>
            {health.database.dialect}{' '}
            <StatusBadge
              ok={health.database.status === 'ok'}
              okLabel="Connected"
              badLabel="Error"
            />
          </span>
          {health.database.sizeBytes !== null && (
            <span className={styles.cardDesc}>
              {formatBytes(health.database.sizeBytes)} on disk
            </span>
          )}
        </li>

        <li className={styles.healthCard}>
          <span className={styles.cardDesc}>Auth server</span>
          <span className={styles.healthValue}>
            <StatusBadge
              ok={health.auth.status === 'ok'}
              okLabel="Reachable"
              badLabel="Unreachable"
            />
          </span>
        </li>

        <li className={styles.healthCard}>
          <span className={styles.cardDesc}>Runtime uptime</span>
          <span className={styles.healthValue}>{formatUptime(health.uptimeSeconds)}</span>
        </li>
      </ul>
    </div>
  );
}
