'use client';

import { Icon } from '@sovereignfs/ui';
import { NavIcon } from './NavIcon';
import { useSidebarHydration } from './sidebar-hydration';

/**
 * The sidebar's Console icon, admin-gated. `neutralRender` is whether the
 * server actually rendered it (the real check on a normal route, always
 * `false` on an offline route's neutral shell); `hydrate` restores the real
 * admin status client-side for a live tab on an offline route — see
 * `useSidebarHydration`'s docblock.
 */
export function AdminConsoleIcon({
  hydrate,
  neutralRender,
}: {
  hydrate: boolean;
  neutralRender: boolean;
}) {
  const hydrated = useSidebarHydration(hydrate);
  const isAdmin = hydrated ? hydrated.isAdmin : neutralRender;
  if (!isAdmin) return null;

  return (
    <NavIcon href="/console" title="Console">
      <Icon name="settings" size="lg" aria-hidden />
    </NavIcon>
  );
}
