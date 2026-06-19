import { statSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { getLastMigrationResult, pingDb, resolveDialect, resolveSqlitePath } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getIncompatiblePlugins } from '@/src/plugin-compat';
import { getPlatformVersion } from '@/src/platform-version';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

interface HealthReport {
  platformVersion: string;
  database: {
    dialect: string;
    status: 'ok' | 'error';
    /** SQLite file size in bytes; null for :memory: or Postgres (CON-09). */
    sizeBytes: number | null;
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
  uptimeSeconds: number;
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const resolved = resolveDialect();

  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await pingDb(await getPlatformDb());
  } catch {
    dbStatus = 'error';
  }

  let sizeBytes: number | null = null;
  if (resolved.dialect === 'sqlite') {
    try {
      const path = resolveSqlitePath(resolved.url);
      if (path !== ':memory:') sizeBytes = statSync(path).size;
    } catch {
      sizeBytes = null;
    }
  }

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

  const report: HealthReport = {
    platformVersion: getPlatformVersion(),
    database: { dialect: resolved.dialect, status: dbStatus, sizeBytes },
    auth: { status: authStatus },
    incompatiblePlugins,
    downgradeWarning,
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return NextResponse.json(report);
}
