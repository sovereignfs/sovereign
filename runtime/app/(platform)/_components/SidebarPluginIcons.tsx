'use client';

import type { ReactNode } from 'react';
import { NavIcon } from './NavIcon';
import { useSidebarHydration } from './sidebar-hydration';
import styles from '../shell.module.css';

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

/**
 * The sidebar's non-chrome plugin icons — the Launcher icon itself is always
 * rendered separately by the caller (it's unfiltered by restriction/order,
 * so it's already safe for the offline-route neutral shell). `neutralChildren`
 * is what the server actually rendered (the real list on a normal route, or
 * nothing on an offline route); `hydrate` restores the real list client-side
 * for a live tab on an offline route. See `useSidebarHydration`'s docblock.
 */
export function SidebarPluginIcons({
  hydrate,
  neutralChildren,
}: {
  hydrate: boolean;
  neutralChildren: ReactNode;
}) {
  const hydrated = useSidebarHydration(hydrate);
  if (!hydrated) return <>{neutralChildren}</>;

  return (
    <>
      {hydrated.plugins.map((plugin) => {
        const extraPaths = plugin.hasMonetization
          ? [`/paywall/${encodeURIComponent(plugin.id)}`]
          : undefined;
        return (
          <NavIcon
            key={plugin.id}
            href={plugin.routePrefix}
            title={plugin.name}
            alsoActiveOn={extraPaths}
          >
            {plugin.iconUrl ? (
              <img src={plugin.iconUrl} alt="" aria-hidden className={styles.pluginIconImg} />
            ) : (
              <span aria-hidden="true">{monogram(plugin.name)}</span>
            )}
          </NavIcon>
        );
      })}
    </>
  );
}
