import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { getInstalledPlugins } from '@/src/registry';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { AccountMenu } from './_components/AccountMenu';
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
  const isAdmin = role === 'platform:admin';

  // Account slot (SRS PLT-11): the user's avatar image, or a monogram from
  // their name/email when no avatar is set.
  const userImage = h.get('x-sovereign-user-image');
  const userLabel = h.get('x-sovereign-user-name') || h.get('x-sovereign-user-email') || '?';
  const accountAvatar = userImage ? (
    <img src={userImage} alt="" className={styles.avatarImage} />
  ) : (
    <span aria-hidden="true">{monogram(userLabel)}</span>
  );

  // Middle section: one icon per non-chrome plugin. Chrome plugins (Launcher,
  // Console, Account) are reached via the home `/`, ⚙, and avatar links below
  // (SRS PLT-12). Full root-plugin-first ordering lands with the shell
  // three-section work (PLT-11–15).
  const plugins = getInstalledPlugins().filter((plugin) => !CHROME_PLUGIN_IDS.has(plugin.id));

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

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <Link href="/" className={styles.brand} aria-label="Sovereign home">
          <Icon name="house" size="lg" aria-hidden />
        </Link>
        <nav className={styles.plugins} aria-label="Plugins">
          {pluginIcons}
        </nav>
        <div className={styles.chrome}>
          {isAdmin ? (
            <Link href="/console" className={styles.icon} title="Console" aria-label="Console">
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

      <header className={styles.mobileHeader}>
        <Link href="/" className={styles.mobileBrand} aria-label="Sovereign home">
          Sovereign
        </Link>
        <AccountMenu avatar={accountAvatar} triggerClassName={styles.avatar} placement="header" />
      </header>

      <main className={styles.content}>{children}</main>

      <nav className={styles.mobileFooter} aria-label="Plugins">
        {pluginIcons}
        {isAdmin ? (
          <Link href="/console" className={styles.icon} aria-label="Console">
            <Icon name="settings" size="lg" aria-hidden />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
