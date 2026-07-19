import Link from 'next/link';
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
}

/** A single plugin tile: icon, name, description, type/development badges; links to the plugin. */
export function PluginTile({ plugin }: { plugin: PluginTileData }) {
  return (
    <Link href={plugin.routePrefix} className={styles.tile}>
      <span className={styles.tileIcon} aria-hidden="true">
        {plugin.iconUrl ? (
          <img src={plugin.iconUrl} alt="" className={styles.tileIconImg} />
        ) : (
          monogram(plugin.name)
        )}
      </span>
      <span className={styles.tileName}>{plugin.name}</span>
      {plugin.description && <span className={styles.tileDesc}>{plugin.description}</span>}
      {(plugin.type || plugin.development) && (
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
          </span>
        </>
      )}
    </Link>
  );
}
