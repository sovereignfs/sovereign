import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { hasCapability } from '@/src/capabilities';
import { getInstalledPlugins } from '@/src/registry';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { BrandProvider } from '@/src/brand-provider';
import { AccountMenu } from './_components/AccountMenu';
import { ActivePluginTitle } from './_components/ActivePluginTitle';
import { ClientShell } from './_components/ClientShell';
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

  const userImage = h.get('x-sovereign-user-image');
  const userLabel = h.get('x-sovereign-user-name') || h.get('x-sovereign-user-email') || '?';
  const accountAvatar = userImage ? (
    <img src={userImage} alt="" className={styles.avatarImage} />
  ) : (
    <span aria-hidden="true">{monogram(userLabel)}</span>
  );

  // Non-chrome plugins for the sidebar middle section and the mobile Drawer.
  const allPlugins = getInstalledPlugins();
  const plugins = allPlugins.filter((plugin) => !CHROME_PLUGIN_IDS.has(plugin.id));

  const pluginIcons = plugins.map((plugin) => (
    <Link key={plugin.id} href={plugin.routePrefix} className={styles.icon} title={plugin.name}>
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
    </Link>
  ));

  // Serialisable slice passed to client components.
  const pluginList = plugins.map((p) => ({
    id: p.id,
    name: p.name,
    routePrefix: p.routePrefix,
    iconUrl: p.icon ? `/plugin-icons/${p.id}.svg` : undefined,
  }));

  // All plugins (including chrome) so ActivePluginTitle can match any route.
  const allPluginList = allPlugins.map((p) => ({
    routePrefix: p.routePrefix,
    name: p.name,
  }));

  return (
    <BrandProvider>
      {({ brandName, brandLogoUrl }) => (
        <ClientShell>
          <div className={styles.shell}>
            <OfflineBanner />
            <aside className={styles.sidebar} aria-label="Primary navigation">
              <Link href="/" className={styles.brand} aria-label={`${brandName} home`}>
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt={brandName} className={styles.brandLogoImg} />
                ) : (
                  <span aria-hidden="true">{brandName.charAt(0).toUpperCase()}</span>
                )}
              </Link>
              <nav className={styles.plugins} aria-label="Plugins">
                {pluginIcons}
              </nav>
              <div className={styles.chrome}>
                <NotificationBell placement="sidebar" />
                {isAdmin ? (
                  <Link
                    href="/console"
                    className={styles.icon}
                    title="Console"
                    aria-label="Console"
                  >
                    <Icon name="settings" size="lg" aria-hidden />
                  </Link>
                ) : null}
                <AccountMenu
                  avatar={accountAvatar}
                  triggerClassName={styles.avatar}
                  placement="sidebar"
                />
              </div>
            </aside>

            {/* Mobile header: brand · active-plugin title · bell · avatar menu (RFC 0013).
                Console is added to the avatar menu for admins (no sidebar on mobile). */}
            <header className={styles.mobileHeader}>
              <Link href="/" className={styles.mobileBrand} aria-label={`${brandName} home`}>
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt={brandName} className={styles.brandLogoImg} />
                ) : (
                  brandName
                )}
              </Link>
              <ActivePluginTitle plugins={allPluginList} />
              <NotificationBell />
              <AccountMenu
                avatar={accountAvatar}
                triggerClassName={styles.avatar}
                placement="header"
                showConsole={isAdmin}
              />
            </header>

            <main className={styles.content}>{children}</main>

            {/* Mobile footer: single "Apps" button opens a Drawer (RFC 0013).
                Replaces the persistent icon strip which clutters small viewports. */}
            <MobileNav plugins={pluginList} />
          </div>
        </ClientShell>
      )}
    </BrandProvider>
  );
}
