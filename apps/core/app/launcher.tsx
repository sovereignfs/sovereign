'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Avatar, ButtonLink, CardTile, CardTileGrid, EmptyState, Input } from '@sovereignfs/ui';
import type { LauncherApp } from '../src/clients/launcher';
import styles from './launcher.module.css';

/**
 * The apps a person can open, with search by name. A tile is an ordinary link to the app's launch address in
 * the same tab, so the person can still open it in a new one themselves; the app then signs them in through core,
 * which completes without a prompt when they already have a session. The icon is the app's own, or a drawn
 * one from its name when there is none (or it will not load).
 */
export function Launcher({ apps, canAddApps }: { apps: LauncherApp[]; canAddApps: boolean }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown =
    needle === '' ? apps : apps.filter((app) => app.name.toLowerCase().includes(needle));

  if (apps.length === 0) {
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
      {shown.length === 0 ? (
        <p className={styles.none} role="status">
          No app is called “{query.trim()}”.
        </p>
      ) : (
        <CardTileGrid minTileWidth={220}>
          {shown.map((app) => (
            <a key={app.id} className={styles.tile} href={app.launchUrl}>
              <CardTile
                banner={
                  <Avatar name={app.name} {...(app.icon ? { src: app.icon } : {})} size="lg" />
                }
              >
                <span className={styles.name}>{app.name}</span>
                {app.description ? (
                  <span className={styles.description}>{app.description}</span>
                ) : null}
              </CardTile>
            </a>
          ))}
        </CardTileGrid>
      )}
    </div>
  );
}
