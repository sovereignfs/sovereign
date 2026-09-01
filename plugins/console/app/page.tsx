import { getPlatformDb } from '@/src/db';
import { getExamplesEnabledFlag } from '@/src/plugin-status';
import { buildPluginRows } from './plugins/page';
import { getHealth } from './_lib/health';
import { OverviewClient, type AttentionItem, type OverviewStats } from './OverviewClient';

const RUNTIME_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

interface MemberRow {
  status: 'active' | 'deactivated' | 'invited';
}

interface GroupRow {
  id: string;
}

interface EntitlementRow {
  status: string;
  expiresAt: number | null;
}

async function getUsers(): Promise<MemberRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${AUTH_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return (await res.json()) as MemberRow[];
  } catch {
    return [];
  }
}

async function getGroups(): Promise<GroupRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/groups`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return (await res.json()) as GroupRow[];
  } catch {
    return [];
  }
}

async function getEntitlements(): Promise<EntitlementRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/entitlements`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { entitlements: EntitlementRow[] };
    return body.entitlements;
  } catch {
    return [];
  }
}

export default async function ConsoleHome() {
  const examplesEnabled = await getExamplesEnabledFlag(await getPlatformDb());
  const [users, groups, plugins, entitlements, health] = await Promise.all([
    getUsers(),
    getGroups(),
    buildPluginRows(examplesEnabled),
    getEntitlements(),
    getHealth(),
  ]);

  const nowSeconds = Date.now() / 1000;
  const stats: OverviewStats = {
    users: {
      total: users.length,
      active: users.filter((u) => u.status === 'active').length,
      invited: users.filter((u) => u.status === 'invited').length,
      deactivated: users.filter((u) => u.status === 'deactivated').length,
    },
    groups: { total: groups.length },
    apps: {
      total: plugins.length,
      enabled: plugins.filter((p) => p.status === 'enabled').length,
      disabled: plugins.filter((p) => p.status === 'disabled').length,
      inactive: plugins.filter((p) => p.status === 'inactive').length,
      incompatible: plugins.filter((p) => p.status === 'incompatible').length,
    },
    entitlements: {
      total: entitlements.length,
      active: entitlements.filter(
        (e) => e.status === 'active' && (e.expiresAt == null || e.expiresAt > nowSeconds),
      ).length,
    },
  };

  // Deliberately narrow: only callouts that point *away* from this page.
  // Jobs/email failures also need attention, but their own health card right
  // below already surfaces that (a red status badge) — a second banner
  // linking to the same page it's already on would be a dead-end callout.
  const attention: AttentionItem[] = [];
  if (stats.users.invited > 0) {
    attention.push({
      id: 'pending-invites',
      label: `${stats.users.invited} pending invite${stats.users.invited === 1 ? '' : 's'}`,
      href: '/console/users',
    });
  }
  if (stats.apps.incompatible > 0) {
    attention.push({
      id: 'incompatible-apps',
      label: `${stats.apps.incompatible} incompatible app${stats.apps.incompatible === 1 ? '' : 's'}`,
      href: '/console/plugins',
    });
  }

  return <OverviewClient stats={stats} attention={attention} health={health} />;
}
