export interface HealthReport {
  platformVersion: string;
  database: { dialect: string; status: 'ok' | 'error'; sizeBytes: number | null };
  auth: { status: 'ok' | 'unreachable' };
  email: {
    smtpConfigured: boolean;
    lastSendStatus: 'skipped' | 'queued' | 'sent' | 'failed' | null;
    lastSendAt: number | null;
    lastFailureCode: string | null;
    recentFailureCount: number;
  };
  jobs: {
    workerDisabled: boolean;
    queuedCount: number;
    scheduledCount: number;
    runningCount: number;
    stuckCount: number;
    failedLast24h: number;
    recentFailures: Array<{
      id: string;
      pluginId: string;
      type: string;
      lastError: string | null;
      updatedAt: number;
    }>;
  };
  uptimeSeconds: number;
}

const DEFAULT_HEALTH: HealthReport = {
  platformVersion: 'unknown',
  database: { dialect: 'unknown', status: 'error', sizeBytes: null },
  auth: { status: 'unreachable' },
  email: {
    smtpConfigured: false,
    lastSendStatus: null,
    lastSendAt: null,
    lastFailureCode: null,
    recentFailureCount: 0,
  },
  jobs: {
    workerDisabled: false,
    queuedCount: 0,
    scheduledCount: 0,
    runningCount: 0,
    stuckCount: 0,
    failedLast24h: 0,
    recentFailures: [],
  },
  uptimeSeconds: 0,
};

/** Moved from the former standalone Health page — its content now lives on
 *  Console's Overview (workstream: fold Health into Overview). */
export async function getHealth(): Promise<HealthReport> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const selfUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  try {
    const res = await fetch(`${selfUrl}/api/admin/health`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[health] fetch failed: ${res.status}`);
      return DEFAULT_HEALTH;
    }
    return res.json() as Promise<HealthReport>;
  } catch (err) {
    console.error('[health] fetch error:', err instanceof Error ? err.message : err);
    return DEFAULT_HEALTH;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function formatTimestamp(seconds: number | null): string {
  if (!seconds) return 'Never';
  return new Date(seconds * 1000).toLocaleString();
}
