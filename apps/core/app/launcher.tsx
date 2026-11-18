'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Avatar,
  AppTile,
  Badge,
  ButtonLink,
  CardTileGrid,
  EmptyState,
  Icon,
  Input,
} from '@sovereignfs/ui';
import type { LauncherApp } from '../src/clients/launcher';
import type { ShortcutIcon as ShortcutIconValue } from '../src/shortcuts/manager';
import { openApp, openShortcut } from './launch';
import { ShortcutIcon } from './shortcuts/shortcut-icon';
import styles from './launcher.module.css';

/** Core's own app for operators, which is not a client in the registry: it opens in the same place, and is listed after the apps. */
const CONSOLE = {
  id: 'console',
  name: 'Console',
  description: 'Run this instance: people, apps and settings',
  href: '/console',
} as const;

const tag = (label: string) => (
  <Badge variant="mono" size="sm" uppercase={false}>
    {label}
  </Badge>
);

/** What kind of thing a tile is: core's own apps are platform apps, an app an operator added is a Sovereign app, and a site is a shortcut. */
const KIND = {
  platform: tag('platform'),
  sovereign: tag('sovereign'),
  shortcut: tag('shortcut'),
  yours: tag('yours'),
} as const;

/** A shortcut as the launcher shows it (core-app §3.8.1): `own` when it is the person's, which only they see. */
export type LauncherShortcut = {
  id: string;
  name: string;
  description: string | undefined;
  url: string;
  /** A native app's own address, tried first from an installed core or a phone; never rendered (`launch.ts`). */
  appUrl?: string | undefined;
  icon: ShortcutIconValue;
  own: boolean;
};

type Tile =
  | { kind: 'app'; id: string; name: string; app: LauncherApp }
  | { kind: 'shortcut'; id: string; name: string; shortcut: LauncherShortcut };

/**
 * The apps and shortcuts a person can open, with search by name: first a dashed "Add" tile (when not searching),
 * then the apps and shortcuts together in name order, then, for an operator (`canOpenConsole`), the Console, a
 * platform app. An app's tile is a link to its launch address, followed in the same tab in a browser; in an installed
 * core a click opens it in a new window instead, which a device that can hands to the installed app (`launch.ts`). The app
 * signs the person in through core, which completes without a prompt when they already have a session. A shortcut is another site, so its
 * tile opens a new tab and tells the site nothing of where it came from. Every icon is drawn in greys, so the grid is
 * one set whatever the pictures' own colours.
 */
export function Launcher({
  apps,
  shortcuts = [],
  canAddApps,
  canOpenConsole = false,
  title,
  subtitle,
}: {
  apps: LauncherApp[];
  shortcuts?: LauncherShortcut[];
  /** An operator who may add apps and shortcuts for everyone: "Add" lets them choose what to add. */
  canAddApps: boolean;
  canOpenConsole?: boolean;
  /** The page's heading and the line beneath it, which sit beside the search. */
  title: string;
  subtitle: string;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (name: string) => needle === '' || name.toLowerCase().includes(needle);
  const tiles: Tile[] = [
    ...apps.map((app) => ({ kind: 'app' as const, id: app.id, name: app.name, app })),
    ...shortcuts.map((shortcut) => ({
      kind: 'shortcut' as const,
      id: shortcut.id,
      name: shortcut.name,
      shortcut,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const shown = tiles.filter((tile) => matches(tile.name));
  const showConsole = canOpenConsole && matches(CONSOLE.name);
  const searchable = tiles.length > 0 || canOpenConsole;
  // Anyone with the launcher may add a shortcut of their own; an operator chooses between that, one for everyone, and an app.
  const addHref = canAddApps ? '/launcher/add' : '/shortcuts/new';
  const addDescription = canAddApps
    ? 'An app, or a shortcut to a site'
    : 'A shortcut to a site you use';
  const hasOwn = shortcuts.some((shortcut) => shortcut.own);

  const heading = (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
      {searchable ? (
        <div className={styles.search}>
          <Input
            type="search"
            aria-label="Search apps"
            placeholder="Search apps"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
    </header>
  );

  if (!searchable) {
    return (
      <div className={styles.launcher}>
        {heading}
        <EmptyState
          icon="layout-grid"
          heading="No apps yet"
          description={
            canAddApps
              ? 'Add the first app or shortcut and it appears here for everyone who can use the launcher.'
              : 'Add a shortcut to a site you use, and it appears here for you. Apps that sign you in are added by whoever runs this instance.'
          }
          action={
            <ButtonLink href={addHref} renderLink={(props) => <Link {...props} />}>
              {canAddApps ? 'Add' : 'Add a shortcut'}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.launcher}>
      {heading}
      {shown.length === 0 && !showConsole ? (
        <p className={styles.none} role="status">
          No app is called “{query.trim()}”.
        </p>
      ) : (
        <CardTileGrid minTileWidth={260}>
          {needle === '' ? (
            <AppTile
              variant="ghost"
              href={addHref}
              name="Add"
              description={addDescription}
              icon={<Icon name="plus" size="lg" aria-hidden={true} />}
            />
          ) : null}
          {shown.map((tile) =>
            tile.kind === 'app' ? (
              <AppTile
                key={`app-${tile.id}`}
                href={tile.app.launchUrl}
                onClick={(event) => openApp(event, tile.app.launchUrl)}
                name={tile.app.name}
                {...(tile.app.description ? { description: tile.app.description } : {})}
                icon={
                  <Avatar
                    name={tile.app.name}
                    {...(tile.app.icon ? { src: tile.app.icon } : {})}
                    size="md"
                  />
                }
                tags={KIND.sovereign}
                monochrome
              />
            ) : (
              <AppTile
                key={`shortcut-${tile.id}`}
                href={tile.shortcut.url}
                onClick={(event) => openShortcut(event, tile.shortcut)}
                external
                name={tile.shortcut.name}
                {...(tile.shortcut.description ? { description: tile.shortcut.description } : {})}
                icon={<ShortcutIcon shortcut={tile.shortcut} />}
                tags={tile.shortcut.own ? KIND.yours : KIND.shortcut}
                monochrome
              />
            ),
          )}
          {showConsole ? (
            <AppTile
              href={CONSOLE.href}
              name={CONSOLE.name}
              description={CONSOLE.description}
              icon={<Icon name="layout-dashboard" size="lg" aria-hidden={true} />}
              tags={KIND.platform}
              monochrome
            />
          ) : null}
        </CardTileGrid>
      )}
      {hasOwn && needle === '' ? (
        <p className={styles.none}>
          <Link href="/shortcuts" className={styles.manage}>
            Manage your shortcuts
          </Link>
        </p>
      ) : null}
    </div>
  );
}
