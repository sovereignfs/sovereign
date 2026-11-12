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
import styles from './launcher.module.css';

/** Core's own app for operators, which is not a client in the registry: it opens in the same place, and is listed first. */
const CONSOLE = {
  id: 'console',
  name: 'Console',
  description: 'Run this instance: people, apps and settings',
  href: '/console',
} as const;

/** What kind of app a tile is: core's own ones are platform apps, and every app an operator added is a Sovereign app. */
const KIND = {
  platform: (
    <Badge variant="mono" size="sm" uppercase={false}>
      platform
    </Badge>
  ),
  sovereign: (
    <Badge variant="mono" size="sm" uppercase={false}>
      sovereign
    </Badge>
  ),
} as const;

/**
 * The apps a person can open, with search by name. An operator (`canOpenConsole`) also has the Console, a platform app, as the first
 * tile; every other tile is a Sovereign app. A tile is an ordinary link to the app's launch address in
 * the same tab, so the person can still open it in a new one themselves; the app then signs them in through core,
 * which completes without a prompt when they already have a session. The icon is the app's own, or a drawn
 * one from its name when there is none (or it will not load).
 */
export function Launcher({
  apps,
  canAddApps,
  canOpenConsole = false,
}: {
  apps: LauncherApp[];
  canAddApps: boolean;
  canOpenConsole?: boolean;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (name: string) => needle === '' || name.toLowerCase().includes(needle);
  const shown = apps.filter((app) => matches(app.name));
  const showConsole = canOpenConsole && matches(CONSOLE.name);

  if (apps.length === 0 && !canOpenConsole) {
    return (
      <EmptyState
        icon="layout-grid"
        heading="No apps yet"
        description={
          canAddApps
            ? 'Add the first app and it appears here for everyone who can use the launcher.'
            : 'When someone adds an app to this instance, it appears here. Ask whoever runs it.'
        }
        action={
          canAddApps ? (
            <ButtonLink href="/console/apps/new" renderLink={(props) => <Link {...props} />}>
              Add an app
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className={styles.launcher}>
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
      {shown.length === 0 && !showConsole ? (
        <p className={styles.none} role="status">
          No app is called “{query.trim()}”.
        </p>
      ) : (
        <CardTileGrid minTileWidth={240}>
          {showConsole ? (
            <AppTile
              href={CONSOLE.href}
              name={CONSOLE.name}
              description={CONSOLE.description}
              icon={<Icon name="layout-dashboard" size="lg" aria-hidden={true} />}
              tags={KIND.platform}
            />
          ) : null}
          {shown.map((app) => (
            <AppTile
              key={app.id}
              href={app.launchUrl}
              name={app.name}
              {...(app.description ? { description: app.description } : {})}
              icon={<Avatar name={app.name} {...(app.icon ? { src: app.icon } : {})} size="lg" />}
              tags={KIND.sovereign}
            />
          ))}
        </CardTileGrid>
      )}
      {apps.length === 0 && needle === '' ? (
        <div className={styles.hint}>
          <p className={styles.none}>
            {canAddApps
              ? 'No other apps yet. Add the first one and it appears here for everyone who can use the launcher.'
              : 'When someone adds an app to this instance, it appears here. Ask whoever runs it.'}
          </p>
          {canAddApps ? (
            <ButtonLink href="/console/apps/new" renderLink={(props) => <Link {...props} />}>
              Add an app
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
