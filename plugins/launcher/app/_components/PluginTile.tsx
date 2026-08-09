'use client';

import Link from 'next/link';
import { Icon, useOfflineTileState } from '@sovereignfs/ui';
import { isDeviceOnlyTierAvailable } from '@sovereignfs/sdk/device-client';
import { monogram } from './monogram';
import styles from '../launcher.module.css';

export interface PluginTileData {
  id: string;
  name: string;
  description: string;
  routePrefix: string;
  type?: string;
  /** Manifest `development: true` — still under active development, not production-ready. */
  development?: boolean;
  /**
   * Path-relative URL to the plugin's icon (e.g. `/plugin-icons/<id>.svg`).
   * Absent when the plugin ships no icon — the monogram fallback is shown instead.
   * Always rendered as `<img>` — never injected as raw SVG (XSS, RFC 0008 §4).
   */
  iconUrl?: string;
  /** Manifest `offline` tier (research 0012) — drives the tile's connectivity-dimmed/capability-restricted states. */
  offline?: 'offline-first' | 'device-only';
}

/**
 * A single plugin tile: icon, name, description, type/development badges;
 * links to the plugin.
 *
 * Applies the two offline-tier states from research 0012 / epic task 2.33 —
 * connectivity-dimmed (no tier, offline right now) and capability-restricted
 * (`device-only`, unavailable on this surface) — via the shared
 * `useOfflineTileState` hook, so this tile and the shell's own Apps drawer
 * item (`runtime/app/(platform)/_components/MobileNav.tsx`) apply the same
 * logic rather than each re-deriving it. The tile stays a real, navigable
 * `Link` in both states — this is advisory UI; the actual gate for
 * `device-only` content is that the data is undecryptable without device
 * auth (epic task 1.22), not this badge.
 */
export function PluginTile({ plugin }: { plugin: PluginTileData }) {
  const deviceOnlyAvailable = isDeviceOnlyTierAvailable();
  const tileState = useOfflineTileState(plugin.offline, deviceOnlyAvailable);

  return (
    <Link
      href={plugin.routePrefix}
      className={[styles.tile, tileState === 'connectivity-dimmed' ? styles.tileDimmed : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.tileIcon} aria-hidden="true">
        {plugin.iconUrl ? (
          <img src={plugin.iconUrl} alt="" className={styles.tileIconImg} />
        ) : (
          monogram(plugin.name)
        )}
      </span>
      <span className={styles.tileName}>{plugin.name}</span>
      {plugin.description && <span className={styles.tileDesc}>{plugin.description}</span>}
      {(plugin.type || plugin.development || tileState === 'capability-restricted') && (
        <>
          <span className={styles.tileSep} aria-hidden="true" />
          <span className={styles.tileBadgeRow}>
            {plugin.type && <span className={styles.tileBadge}>{plugin.type}</span>}
            {plugin.development && (
              <span
                className={styles.tileDevBadge}
                title="Still in development — not production-ready"
              >
                in development
              </span>
            )}
            {tileState === 'capability-restricted' && (
              <span
                className={styles.tileRestrictedBadge}
                title="Only available on a phone with secure storage set up"
              >
                <Icon name="smartphone" size="sm" aria-hidden />
                Phone only
              </span>
            )}
          </span>
        </>
      )}
    </Link>
  );
}
