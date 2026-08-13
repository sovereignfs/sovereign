import { NextResponse } from 'next/server';
import {
  getEmailDeliveryDiagnostics,
  getJobHealthSummary,
  getLastMigrationResult,
  pingDb,
  resolveDialect,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { isDevModeConfigured } from '@/src/dev-mode';
import { getPlatformDb } from '@/src/db';
import { jobWorkerDisabled } from '@/src/jobs';
import { getBroker } from '@/src/notification-broker';
import { getIncompatiblePlugins } from '@/src/plugin-compat';
import { getPlatformVersion } from '@/src/platform-version';
import { getInstalledPlugins } from '@/src/registry';
import { isSmtpConfigured } from '@/src/platform-email';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

interface HealthReport {
  platformVersion: string;
  database: {
    dialect: string;
    status: 'ok' | 'error';
    /**
     * Always null — SQLite is sqld-backed (a separate server), so there is no
     * local file to measure. Kept in the report shape for CON-09 compatibility.
     */
    sizeBytes: number | null;
    /** Last applied migration version, or null before first migration run. */
    migrationVersion: string | null;
  };
  auth: { status: 'ok' | 'unreachable' };
  /** Plugins disabled at boot due to platform-version incompatibility (RFC 0024). */
  incompatiblePlugins: Array<{ id: string; reason: string }>;
  /**
   * Set when the running binary is older than the version that last wrote to
   * the database — a downgrade was detected. Operators should restore a backup
   * or upgrade to at least the indicated version.
   */
  downgradeWarning: { detectedVersion: string; runningVersion: string } | null;
  /** Summary of the installed plugin registry. */
  plugins: {
    installed: number;
    adminOnly: number;
  };
  /** Operator diagnostics: current log level and dev-mode configuration. */
  diagnostics: {
    logLevel: string;
    devModeEnabled: boolean;
  };
  /** Notification delivery transport and broker connection state (RFC 0034). */
  notifications: {
    transport: 'polling' | 'sse' | 'redis';
    brokerConnected: boolean;
  };
  email: {
    smtpConfigured: boolean;
    lastSendStatus: 'skipped' | 'queued' | 'sent' | 'failed' | null;
    lastSendAt: number | null;
    lastFailureCode: string | null;
    recentFailureCount: number;
  };
  /** Background job queue health (RFC 0046) — stuck/failed visibility for operators. */
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

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const resolved = resolveDialect();

  let dbStatus: 'ok' | 'error' = 'ok';
  const pdb = await getPlatformDb();
  try {
    await pingDb(pdb);
  } catch {
    dbStatus = 'error';
  }

  const sizeBytes: number | null = null;

  let authStatus: 'ok' | 'unreachable' = 'unreachable';
  try {
    const res = await fetch(`${AUTH_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) authStatus = 'ok';
  } catch {
    authStatus = 'unreachable';
  }

  const incompatiblePlugins = [...getIncompatiblePlugins().entries()].map(([id, reason]) => ({
    id,
    reason,
  }));

  const migrationResult = getLastMigrationResult();
  const downgradeWarning =
    migrationResult?.downgradeDetected && migrationResult.previousVersion
      ? {
          detectedVersion: migrationResult.previousVersion,
          runningVersion: migrationResult.currentVersion,
        }
      : null;

  const installedPlugins = getInstalledPlugins();
  const emailDiagnostics = await getEmailDeliveryDiagnostics(pdb, await isSmtpConfigured());
  const jobHealth = await getJobHealthSummary(pdb);

  const rawTransport = process.env.NOTIFICATION_TRANSPORT ?? 'sse';
  const notifTransport: 'polling' | 'sse' | 'redis' =
    rawTransport === 'polling' || rawTransport === 'redis' ? rawTransport : 'sse';
  const broker = getBroker();
  // RedisBroker exposes a `connected` getter; InProcessBroker is always connected.
  const brokerConnected = broker
    ? 'connected' in broker &&
      typeof (broker as unknown as { connected: boolean }).connected === 'boolean'
      ? (broker as unknown as { connected: boolean }).connected
      : true
    : false;

  const report: HealthReport = {
    platformVersion: getPlatformVersion(),
    database: {
      dialect: resolved.dialect,
      status: dbStatus,
      sizeBytes,
      migrationVersion: migrationResult?.currentVersion ?? null,
    },
    auth: { status: authStatus },
    incompatiblePlugins,
    downgradeWarning,
    plugins: {
      installed: installedPlugins.length,
      adminOnly: installedPlugins.filter((p) => p.adminOnly).length,
    },
    diagnostics: {
      logLevel: (process.env.LOG_LEVEL ?? 'warn').toLowerCase(),
      devModeEnabled: isDevModeConfigured(),
    },
    notifications: {
      transport: notifTransport,
      brokerConnected,
    },
    email: emailDiagnostics,
    jobs: {
      workerDisabled: jobWorkerDisabled(),
      ...jobHealth,
    },
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return NextResponse.json(report);
}
