'use client';

import Link from 'next/link';
import { Badge, Icon, NavList, ResponsiveSurface } from '@sovereignfs/ui';
import { CONSOLE_SECTIONS } from './_lib/sections';
import { formatBytes, formatTimestamp, formatUptime, type HealthReport } from './_lib/health';
import { ExternalClientsStat } from './ExternalClientsStat';
import styles from './console.module.css';

export interface OverviewStats {
  users: { total: number; active: number; invited: number; deactivated: number };
  groups: { total: number };
  apps: {
    total: number;
    enabled: number;
    disabled: number;
    inactive: number;
    incompatible: number;
  };
  entitlements: { total: number; active: number };
}

export interface AttentionItem {
  id: string;
  label: string;
  href: string;
}

interface OverviewClientProps {
  stats: OverviewStats;
  attention: AttentionItem[];
  health: HealthReport;
}

function HealthStatusBadge({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <Badge variant="status" size="xs" status={ok ? 'active' : 'failed'}>
      {ok ? okLabel : badLabel}
    </Badge>
  );
}

function AttentionList({ attention }: { attention: AttentionItem[] }) {
  if (attention.length === 0) return null;
  return (
    <ul className={styles.attentionList}>
      {attention.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className={styles.attentionItem}>
            <Icon name="alert-triangle" size="sm" aria-hidden />
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HealthCards({ health }: { health: HealthReport }) {
  return (
    <ul className={styles.cards}>
      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Platform version</span>
        <span className={styles.healthValue}>{health.platformVersion}</span>
      </li>

      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Database</span>
        <span className={styles.healthValue}>
          {health.database.dialect}
          <HealthStatusBadge
            ok={health.database.status === 'ok'}
            okLabel="Connected"
            badLabel="Error"
          />
        </span>
        {health.database.sizeBytes !== null && (
          <span className={styles.cardDesc}>{formatBytes(health.database.sizeBytes)} on disk</span>
        )}
      </li>

      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Auth server</span>
        <span className={styles.healthValue}>
          <HealthStatusBadge
            ok={health.auth.status === 'ok'}
            okLabel="Reachable"
            badLabel="Unreachable"
          />
        </span>
      </li>

      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Email delivery</span>
        <span className={styles.healthValue}>
          <HealthStatusBadge
            ok={health.email.smtpConfigured}
            okLabel="SMTP configured"
            badLabel="SMTP missing"
          />
        </span>
        <span className={styles.cardDesc}>
          Last send: {health.email.lastSendStatus ?? 'none'} ·{' '}
          {formatTimestamp(health.email.lastSendAt)}
        </span>
        {health.email.lastFailureCode && (
          <span className={styles.cardDesc}>
            Last failure: {health.email.lastFailureCode} · {health.email.recentFailureCount} in 24h
          </span>
        )}
      </li>

      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Background jobs</span>
        <span className={styles.healthValue}>
          <HealthStatusBadge
            ok={!health.jobs.workerDisabled && health.jobs.stuckCount === 0}
            okLabel="Running"
            badLabel={health.jobs.workerDisabled ? 'Worker disabled' : 'Stuck jobs'}
          />
        </span>
        <span className={styles.cardDesc}>
          {health.jobs.queuedCount} queued · {health.jobs.scheduledCount} scheduled ·{' '}
          {health.jobs.runningCount} running
        </span>
        {(health.jobs.stuckCount > 0 || health.jobs.failedLast24h > 0) && (
          <span className={styles.cardDesc}>
            {health.jobs.stuckCount} stuck · {health.jobs.failedLast24h} failed in 24h
          </span>
        )}
      </li>

      <li className={styles.healthCard}>
        <span className={styles.cardDesc}>Runtime uptime</span>
        <span className={styles.healthValue}>{formatUptime(health.uptimeSeconds)}</span>
      </li>
    </ul>
  );
}

function DesktopDashboard({ stats, attention, health }: OverviewClientProps) {
  return (
    <div>
      {attention.length > 0 && (
        <div className={styles.overviewSection}>
          <AttentionList attention={attention} />
        </div>
      )}

      <div className={styles.overviewSection}>
        <h3 className={styles.overviewSectionTitle}>At a glance</h3>
        <div className={styles.statGrid}>
          <Link href="/console/users" className={styles.statCard}>
            <span className={styles.statValue}>{stats.users.total}</span>
            <span className={styles.statLabel}>Users</span>
            <span className={styles.statMeta}>
              {stats.users.active} active · {stats.users.invited} invited
            </span>
          </Link>
          <Link href="/console/groups" className={styles.statCard}>
            <span className={styles.statValue}>{stats.groups.total}</span>
            <span className={styles.statLabel}>Groups</span>
          </Link>
          <Link href="/console/plugins" className={styles.statCard}>
            <span className={styles.statValue}>{stats.apps.total}</span>
            <span className={styles.statLabel}>Apps</span>
            <span className={styles.statMeta}>
              {stats.apps.enabled} enabled · {stats.apps.inactive} inactive
            </span>
          </Link>
          <ExternalClientsStat />
          <Link href="/console/entitlements" className={styles.statCard}>
            <span className={styles.statValue}>{stats.entitlements.active}</span>
            <span className={styles.statLabel}>Active entitlements</span>
          </Link>
        </div>
      </div>

      <div className={styles.overviewSection}>
        <h3 className={styles.overviewSectionTitle}>System health</h3>
        <HealthCards health={health} />
      </div>
    </div>
  );
}

/** Mobile has no persistent sidebar — the bare `/console` route is the
 *  drill-down index itself (see `layout.tsx`'s doc comment). A condensed
 *  summary (attention callouts + stat chips) sits above it so folding Health
 *  into Overview doesn't leave mobile with zero at-a-glance status. */
function MobileIndex({ stats, attention }: OverviewClientProps) {
  return (
    <div className={styles.mobileOverviewStack}>
      {attention.length > 0 && <AttentionList attention={attention} />}

      <div className={styles.mobileStatRow}>
        <Link href="/console/users" className={styles.mobileStatChip}>
          <span className={styles.mobileStatValue}>{stats.users.total}</span>
          <span className={styles.mobileStatLabel}>Users</span>
        </Link>
        <Link href="/console/groups" className={styles.mobileStatChip}>
          <span className={styles.mobileStatValue}>{stats.groups.total}</span>
          <span className={styles.mobileStatLabel}>Groups</span>
        </Link>
        <Link href="/console/plugins" className={styles.mobileStatChip}>
          <span className={styles.mobileStatValue}>{stats.apps.total}</span>
          <span className={styles.mobileStatLabel}>Apps</span>
        </Link>
        <Link href="/console/entitlements" className={styles.mobileStatChip}>
          <span className={styles.mobileStatValue}>{stats.entitlements.active}</span>
          <span className={styles.mobileStatLabel}>Entitlements</span>
        </Link>
      </div>

      <NavList
        groups={CONSOLE_SECTIONS}
        variant="drilldown"
        aria-label="Console sections"
        renderLink={(item, linkProps) => (
          <Link
            href={item.href}
            className={linkProps.className}
            aria-current={linkProps['aria-current']}
          >
            {linkProps.children}
          </Link>
        )}
      />
    </div>
  );
}

export function OverviewClient(props: OverviewClientProps) {
  return (
    <ResponsiveSurface web={<DesktopDashboard {...props} />} mobile={<MobileIndex {...props} />} />
  );
}
