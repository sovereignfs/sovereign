'use client';

import type { ReactNode } from 'react';
import { MobileHeader } from '@sovereignfs/ui';
import { useActivePluginTitle } from './useActivePluginTitle';

interface PluginEntry {
  routePrefix: string;
  name: string;
}

/**
 * Client boundary around `@sovereignfs/ui`'s `MobileHeader` — needed only
 * because the active-plugin title (RFC 0013 / RFC 0088) is resolved from the
 * pathname via `usePathname()`, which the platform layout's async server
 * component can't call directly. `logo`/`bell`/`avatarMenu` are passed down
 * already-instantiated from the server layout, unchanged (the standard
 * Next.js pattern for handing Client Component elements through a Client
 * Component boundary from a Server Component parent).
 *
 * Deliberately does not accept its own `className`/`data-*` props for the
 * `.mobileHeader` grid-row-and-visibility wrapper — the caller wraps this
 * component in that `<div>` instead (see `(platform)/layout.tsx`), so that
 * wrapper's `display: none`/`flex` toggle never has to compete in the
 * cascade with `MobileHeader`'s own always-`flex` root class.
 */
export function PlatformMobileHeader({
  logo,
  bell,
  avatarMenu,
  plugins,
}: {
  logo: ReactNode;
  bell: ReactNode;
  avatarMenu: ReactNode;
  plugins: PluginEntry[];
}) {
  const title = useActivePluginTitle(plugins);
  return <MobileHeader logo={logo} title={title} bell={bell} avatarMenu={avatarMenu} />;
}
