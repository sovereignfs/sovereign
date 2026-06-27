import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { getAccountPrefs } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { InstanceProvider } from '@/src/instance-provider';
import { AccountMenu } from './_components/AccountMenu';
import { ClientShell } from './_components/ClientShell';
import { NavIcon } from './_components/NavIcon';
import { MobileNav } from './_components/MobileNav';
import { NotificationBell } from './_components/NotificationBell';
import { OfflineBanner } from './_components/OfflineBanner';
import styles from './shell.module.css';

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const role = h.get('x-sovereign-user-role') ?? 'platform:user';
  const isAdmin = hasCapability(role, 'console:access');

  const userImage = h.get('x-sovereign-user-image') ?? undefined;
  const userName = h.get('x-sovereign-user-name') ?? '';
  const userEmail = h.get('x-sovereign-user-email') ?? '';
  const userLabel = userName || userEmail || '?';
  const accountAvatar = userImage ? (
    <img src={userImage} alt="" className={styles.avatarImage} />
  ) : (
    <span aria-hidden="true">{monogram(userLabel)}</span>
  );

  // Non-chrome plugins for the sidebar middle section and the mobile Drawer.
  const allPlugins = getInstalledPlugins();
  const rawPlugins = allPlugins.filter((plugin) => !CHROME_PLUGIN_IDS.has(plugin.id));
  // The Launcher is a chrome plugin (hidden from its own tiles) but should
  // always appear as the first icon in the sidebar so users can return home.
  const launcher = allPlugins.find((plugin) => plugin.id === 'fs.sovereign.launcher');

  // Apply the authenticated user's saved sidebar ordering and visibility prefs.
  const userId = h.get('x-sovereign-user-id');
  let plugins = rawPlugins;
  if (userId) {
    const prefs = await getAccountPrefs(await getPlatformDb(), userId);
    if (prefs.sidebarPlugins) {
      const idMap = new Map(rawPlugins.map((p) => [p.id, p]));
      // Saved order, excluding hidden entries and uninstalled plugin IDs
      const ordered = prefs.sidebarPlugins
        .filter((e) => !e.hidden && idMap.has(e.id))
        .flatMap((e) => {
          const p = idMap.get(e.id);
          return p ? [p] : [];
        });
      // Newly installed plugins not yet in the saved list go at the end
      const knownIds = new Set(prefs.sidebarPlugins.map((e) => e.id));
      for (const p of rawPlugins) {
        if (!knownIds.has(p.id)) ordered.push(p);
      }
      plugins = ordered;
    }
  }

  const pluginIcons = [...(launcher ? [launcher] : []), ...plugins].map((plugin) => {
    const extraPaths: string[] = [];
    if (plugin.id === 'fs.sovereign.launcher') extraPaths.push('/');
    if (plugin.monetization) extraPaths.push(`/paywall/${encodeURIComponent(plugin.id)}`);
    return (
      <NavIcon
        key={plugin.id}
        href={plugin.routePrefix}
        title={plugin.name}
        alsoActiveOn={extraPaths.length > 0 ? extraPaths : undefined}
      >
        {plugin.icon ? (
          <img
            src={`/plugin-icons/${plugin.id}.svg`}
            alt=""
            aria-hidden
            className={styles.pluginIconImg}
          />
        ) : (
          <span aria-hidden="true">{monogram(plugin.name)}</span>
        )}
      </NavIcon>
    );
  });

  // Serialisable slice passed to client components.
  const pluginList = plugins.map((p) => ({
    id: p.id,
    name: p.name,
    routePrefix: p.routePrefix,
    iconUrl: p.icon ? `/plugin-icons/${p.id}.svg` : undefined,
  }));

  return (
    <InstanceProvider>
      {({ instanceName, instanceLogoUrl }) => (
        <ClientShell>
          <div className={styles.shell}>
            <OfflineBanner />
            <aside className={styles.sidebar} aria-label="Primary navigation">
              <Link href="/" className={styles.brand} aria-label={`${instanceName} home`}>
                {instanceLogoUrl ? (
                  <img src={instanceLogoUrl} alt={instanceName} className={styles.brandLogoImg} />
                ) : (
                  <span aria-hidden="true">{instanceName.charAt(0).toUpperCase()}</span>
                )}
              </Link>
              <hr className={styles.sidebarDivider} />
              <nav className={styles.plugins} aria-label="Plugins">
                {pluginIcons}
              </nav>
              <div className={styles.chrome}>
                <NotificationBell placement="sidebar" />
                {isAdmin ? (
                  <NavIcon href="/console" title="Console">
                    <Icon name="settings" size="lg" aria-hidden />
                  </NavIcon>
                ) : null}
                <AccountMenu
                  avatar={accountAvatar}
                  triggerClassName={styles.avatar}
                  placement="sidebar"
                  userName={userName}
                  userEmail={userEmail}
                  userImage={userImage}
                />
              </div>
            </aside>

            {/* Mobile header: brand · active-plugin title · bell · avatar menu (RFC 0013).
                Console is added to the avatar menu for admins (no sidebar on mobile). */}
            <header className={styles.mobileHeader}>
              <Link href="/" className={styles.mobileBrand} aria-label={`${instanceName} home`}>
                <span className={styles.mobileBrandIcon} aria-hidden="true">
                  {instanceLogoUrl ? (
                    <img src={instanceLogoUrl} alt="" className={styles.brandLogoImg} />
                  ) : (
                    instanceName.charAt(0).toUpperCase()
                  )}
                </span>
                <span className={styles.mobileBrandName}>{instanceName}</span>
              </Link>
              <div className={styles.mobileHeaderRight}>
                <NotificationBell />
                <AccountMenu
                  avatar={accountAvatar}
                  triggerClassName={styles.avatar}
                  placement="header"
                  showConsole={isAdmin}
                  userName={userName}
                  userEmail={userEmail}
                  userImage={userImage}
                />
              </div>
            </header>

            <main className={styles.content}>{children}</main>

            {/* Mobile footer: single "Apps" button opens a Drawer (RFC 0013).
                Replaces the persistent icon strip which clutters small viewports. */}
            <MobileNav
              plugins={pluginList}
              launcherIconUrl={launcher?.icon ? `/plugin-icons/${launcher.id}.svg` : undefined}
            />
          </div>
        </ClientShell>
      )}
    </InstanceProvider>
  );
}
