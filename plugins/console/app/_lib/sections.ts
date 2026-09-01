import type { IconName } from '@sovereignfs/ui';

export interface ConsoleSectionItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
}

export interface ConsoleSectionGroup {
  id: string;
  /** Omit for the pinned, ungrouped "Overview" entry. */
  label?: string;
  items: ConsoleSectionItem[];
}

/**
 * The 10 Console sections, grouped for both the desktop sidebar
 * (`NavList variant="static"`) and the mobile drill-down index
 * (`NavList variant="drilldown"`) — one source of truth for both. Health was
 * folded into Overview (`page.tsx`) rather than kept as its own section.
 */
export const CONSOLE_SECTIONS: ConsoleSectionGroup[] = [
  {
    id: 'overview',
    items: [{ id: 'overview', label: 'Overview', href: '/console', icon: 'layout-dashboard' }],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'users', label: 'Users', href: '/console/users', icon: 'users' },
      { id: 'groups', label: 'Groups', href: '/console/groups', icon: 'layers' },
    ],
  },
  {
    id: 'apps',
    label: 'Apps',
    items: [
      { id: 'plugins', label: 'Apps', href: '/console/plugins', icon: 'layout-grid' },
      { id: 'entitlements', label: 'Entitlements', href: '/console/entitlements', icon: 'shield' },
      {
        id: 'oauth-clients',
        label: 'External clients',
        href: '/console/oauth-clients',
        icon: 'link',
      },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    items: [
      { id: 'settings', label: 'Settings', href: '/console/settings', icon: 'settings' },
      { id: 'identity', label: 'Identity', href: '/console/identity', icon: 'paint-bucket' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    items: [{ id: 'activity', label: 'Activity', href: '/console/activity', icon: 'history' }],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [{ id: 'broadcast', label: 'Broadcast', href: '/console/broadcast', icon: 'send' }],
  },
];

/**
 * Longest-href-prefix match against every section item across all groups —
 * e.g. `/console/users` matches both "Overview" (`/console`, a prefix) and
 * "Users" (`/console/users`, exact); the longest match wins so exactly one
 * row highlights. Plain string in, plain result out (no `next/navigation`
 * import here) — the caller supplies `usePathname()`'s result, matching
 * `NavList`'s own framework-agnostic contract.
 */
export function activeConsoleSectionId(pathname: string): string | null {
  let bestId: string | null = null;
  let bestLength = -1;
  for (const group of CONSOLE_SECTIONS) {
    for (const item of group.items) {
      const isMatch = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (isMatch && item.href.length > bestLength) {
        bestId = item.id;
        bestLength = item.href.length;
      }
    }
  }
  return bestId;
}
