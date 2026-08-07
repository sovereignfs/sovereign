import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { SovereignManifest } from '@sovereignfs/manifest';
import { getAccountPrefs } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import {
  getInstalledPlugins,
  getMobileChromeConfig,
  getOfflineRoutePrefixes,
} from '@/src/registry';
import { applySidebarOrder, selectSidebarPlugins } from '@/src/launcher-plugins';
import { InstanceProvider } from '@/src/instance-provider';
import { AccountMenu } from './_components/AccountMenu';
import { AdminConsoleIcon } from './_components/AdminConsoleIcon';
import { ClientShell } from './_components/ClientShell';
import { NavIcon } from './_components/NavIcon';
import { MobileNav } from './_components/MobileNav';
import { NotificationBell } from './_components/NotificationBell';
import { OfflineBanner } from './_components/OfflineBanner';
import { PlatformMobileHeader } from './_components/PlatformMobileHeader';
import { SidebarPluginIcons } from './_components/SidebarPluginIcons';
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

  // Manifest-declared offline routes (RFC 0072) are precached by the service
  // worker and later replayed with *no server round-trip at all* — whatever
  // this layout renders alongside them is frozen into that cached document
  // and can be shown to a different user than whoever's visit happened to
  // populate the cache. Every per-user value below (name, avatar, admin
  // status, the personalized/restricted/reordered plugin list, even the user
  // id threaded to `ClientShell`) is a real per-user SSR leak into a
  // document meant to be a "user-neutral shell" — the offline route's own
  // page can correctly render nothing per-user while still shipping inside a
  // shell that isn't. So this flag suppresses all of it in favor of one
  // fixed, identical-for-everyone shell (only the Launcher icon, already
  // unfiltered by restriction/order today, is kept).
  const isOfflineRoute = h.get('x-sovereign-offline-route') === '1';

  // Per-plugin mobile header/footer visibility (shellConfig.mobileHeader /
  // shellConfig.mobileFooter, RFC 0075). The desktop sidebar is never
  // affected — these two flags only ever gate the two mobile-only elements
  // below. Omitted server-side (not CSS-hidden) so a plugin that hides one
  // never pays for its hydration/DOM cost.
  const showMobileHeader = h.get('x-sovereign-mobile-header') !== '0';
  const showMobileFooter = h.get('x-sovereign-mobile-footer') !== '0';

  const role = h.get('x-sovereign-user-role') ?? 'platform:user';
  const isAdmin = !isOfflineRoute && hasCapability(role, 'console:access');
  const userId = h.get('x-sovereign-user-id');

  const userImage = isOfflineRoute ? undefined : (h.get('x-sovereign-user-image') ?? undefined);
  const userName = isOfflineRoute ? '' : (h.get('x-sovereign-user-name') ?? '');
  const userEmail = isOfflineRoute ? '' : (h.get('x-sovereign-user-email') ?? '');
  const userLabel = userName || userEmail || '?';
  const accountAvatar = userImage ? (
    <img src={userImage} alt="" className={styles.avatarImage} />
  ) : (
    <span aria-hidden="true">{isOfflineRoute ? '' : monogram(userLabel)}</span>
  );

  const allPlugins = getInstalledPlugins();
  // Passed to ClientShell so it can force a refresh when a client-side
  // navigation crosses into or out of an offline route — see that
  // component's docblock for why this shared layout otherwise leaks the
  // degraded offline shell into unrelated subsequent navigations.
  const offlineRoutePrefixes = getOfflineRoutePrefixes(allPlugins);
  // Passed to ClientShell for the same reason — a client-side navigation
  // between two plugins with different shellConfig.mobileHeader/mobileFooter
  // needs to force a refresh so this shared layout re-reads the per-route
  // headers above instead of reusing the previous route's rendered chrome
  // (RFC 0075).
  const mobileChromeConfig = getMobileChromeConfig(allPlugins);
  // The Launcher is a chrome plugin (hidden from its own tiles) but should
  // always appear as the first icon in the sidebar so users can return home.
  // It's already unfiltered by per-user restriction/order, so it's the one
  // plugin icon safe to keep for an offline route's neutral shell.
  const launcher = allPlugins.find((plugin) => plugin.id === 'fs.sovereign.launcher');

  // Non-chrome, enabled, access-policy-allowed (RFC 0065) plugins for the
  // sidebar middle section and the mobile Drawer. Disabled plugins (including
  // example plugins hidden by the SOVEREIGN_EXAMPLES_ENABLED default) and
  // access-policy-restricted plugins are excluded so the sidebar never shows
  // an icon whose route the middleware 404s. Skipped entirely for an offline
  // route — see the neutral-shell comment above.
  let plugins: SovereignManifest[] = [];
  if (!isOfflineRoute) {
    const pdb = await getPlatformDb();
    const disabledIds = new Set(await getDisabledPluginIds(pdb));
    const restrictedIds = new Set(
      userId
        ? await getRestrictedPluginIds(
            pdb,
            userId,
            role,
            allPlugins.map((p) => p.id),
          )
        : [],
    );
    const rawPlugins = selectSidebarPlugins(allPlugins, disabledIds, restrictedIds);
    // Apply the authenticated user's saved sidebar ordering and visibility prefs.
    plugins = rawPlugins;
    if (userId) {
      const prefs = await getAccountPrefs(pdb, userId);
      plugins = applySidebarOrder(rawPlugins, prefs.sidebarPlugins, { dropHidden: true });
    }
  }

  // The Launcher icon itself, rendered unconditionally — see the comment on
  // `launcher` above for why it's exempt from the offline-route neutral shell.
  const launcherIcon = launcher ? (
    <NavIcon
      key={launcher.id}
      href={launcher.routePrefix}
      title={launcher.name}
      alsoActiveOn={['/']}
    >
      {launcher.icon ? (
        <img
          src={`/plugin-icons/${launcher.id}.svg`}
          alt=""
          aria-hidden
          className={styles.pluginIconImg}
        />
      ) : (
        <span aria-hidden="true">{monogram(launcher.name)}</span>
      )}
    </NavIcon>
  ) : null;

  // The rest of the sidebar's plugin icons — real and complete on a normal
  // route, empty on an offline route's SSR (see the neutral-shell comment
  // above). `SidebarPluginIcons` restores the real list client-side for a
  // live tab on an offline route; on every other route it just renders this
  // list as-is, unchanged from before.
  const middlePluginIcons = plugins.map((plugin) => {
    const extraPaths = plugin.monetization
      ? [`/paywall/${encodeURIComponent(plugin.id)}`]
      : undefined;
    return (
      <NavIcon
        key={plugin.id}
        href={plugin.routePrefix}
        title={plugin.name}
        alsoActiveOn={extraPaths}
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
        <ClientShell
          userId={isOfflineRoute ? null : userId}
          offlineRoutePrefixes={offlineRoutePrefixes}
          mobileChromeConfig={mobileChromeConfig}
        >
          <div
            className={styles.shell}
            data-mobile-header-hidden={showMobileHeader ? undefined : ''}
            data-mobile-footer-hidden={showMobileFooter ? undefined : ''}
          >
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
                {launcherIcon}
                <SidebarPluginIcons hydrate={isOfflineRoute} neutralChildren={middlePluginIcons} />
              </nav>
              <div className={styles.chrome}>
                <NotificationBell placement="sidebar" />
                <AdminConsoleIcon hydrate={isOfflineRoute} neutralRender={isAdmin} />
                <AccountMenu
                  avatar={accountAvatar}
                  avatarImageClassName={styles.avatarImage}
                  triggerClassName={styles.avatar}
                  placement="sidebar"
                  userName={userName}
                  userEmail={userEmail}
                  userImage={userImage}
                  hydrateUser={isOfflineRoute}
                />
              </div>
            </aside>

            {/* Mobile header: brand · active-plugin title · bell · avatar menu (RFC 0013),
                rendered through @sovereignfs/ui's MobileHeader (RFC 0088) via the
                PlatformMobileHeader client wrapper, which resolves the title.
                Console is a tile in the Apps drawer for admins (no sidebar on mobile).
                Omitted entirely (not CSS-hidden) when the current plugin's
                shellConfig.mobileHeader is false (RFC 0075). */}
            {showMobileHeader && (
              <div className={styles.mobileHeader} data-mobile-header>
                <PlatformMobileHeader
                  logo={
                    <Link
                      href="/"
                      className={styles.mobileBrand}
                      aria-label={`${instanceName} home`}
                    >
                      <span className={styles.mobileBrandIcon} aria-hidden="true">
                        {instanceLogoUrl ? (
                          <img src={instanceLogoUrl} alt="" className={styles.brandLogoImg} />
                        ) : (
                          instanceName.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className={styles.mobileBrandName}>{instanceName}</span>
                    </Link>
                  }
                  bell={<NotificationBell />}
                  avatarMenu={
                    <AccountMenu
                      avatar={accountAvatar}
                      avatarImageClassName={styles.avatarImage}
                      triggerClassName={styles.avatar}
                      placement="header"
                      userName={userName}
                      userEmail={userEmail}
                      userImage={userImage}
                      hydrateUser={isOfflineRoute}
                    />
                  }
                  plugins={pluginList}
                />
              </div>
            )}

            <main id="main-scroll" className={styles.content}>
              {children}
            </main>

            {/* Mobile footer: single "Apps" button opens a Drawer (RFC 0013).
                Replaces the persistent icon strip which clutters small viewports.
                Omitted entirely (not CSS-hidden) when the current plugin's
                shellConfig.mobileFooter is false (RFC 0075). */}
            {showMobileFooter && (
              <MobileNav
                plugins={pluginList}
                launcherIconUrl={launcher?.icon ? `/plugin-icons/${launcher.id}.svg` : undefined}
                isAdmin={isAdmin}
                hydrate={isOfflineRoute}
              />
            )}
          </div>
        </ClientShell>
      )}
    </InstanceProvider>
  );
}
