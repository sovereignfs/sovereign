import type { IconName } from '@sovereignfs/ui';

export interface AccountSectionItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
}

/**
 * The 7 Account sections — one flat, ungrouped list, shared by the desktop
 * rail (`NavList variant="static"`, `layout.tsx`) and the mobile drill-down
 * index (`NavList variant="drilldown"`, `page.tsx`) — one source of truth
 * for both, mirroring `plugins/console/app/_lib/sections.ts`. No grouping
 * (RFC 0085): a single ungrouped group fits Account's flat list.
 */
export const ACCOUNT_SECTIONS: AccountSectionItem[] = [
  { id: 'profile', label: 'Profile', href: '/account/profile', icon: 'user' },
  { id: 'security', label: 'Security', href: '/account/security', icon: 'shield' },
  {
    id: 'preferences',
    label: 'Preferences',
    href: '/account/preferences',
    icon: 'sliders-horizontal',
  },
  { id: 'notifications', label: 'Notifications', href: '/account/notifications', icon: 'bell' },
  { id: 'billing', label: 'Billing', href: '/account/billing', icon: 'credit-card' },
  { id: 'data', label: 'Data', href: '/account/data', icon: 'lock' },
  { id: 'activity', label: 'Activity', href: '/account/activity', icon: 'activity' },
];

/**
 * Longest-href-prefix match against every section — e.g. `/account/security/
 * sessions` (if such a nested route ever exists) still matches "Security".
 * Plain string in, plain result out, mirroring `activeConsoleSectionId`. The
 * bare `/account` index route itself matches no section (`null`) — it isn't
 * one of the 7 items.
 */
export function activeAccountSectionId(pathname: string): string | null {
  let bestId: string | null = null;
  let bestLength = -1;
  for (const item of ACCOUNT_SECTIONS) {
    const isMatch = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (isMatch && item.href.length > bestLength) {
      bestId = item.id;
      bestLength = item.href.length;
    }
  }
  return bestId;
}
