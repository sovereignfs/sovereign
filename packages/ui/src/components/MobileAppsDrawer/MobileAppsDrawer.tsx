import type { ReactNode } from 'react';
import { Drawer } from '../Drawer/Drawer';
import styles from './MobileAppsDrawer.module.css';

export interface MobileAppsDrawerItem {
  /** Stable identity for this tile — used as the React key. */
  key: string;
  icon: ReactNode;
  label: string;
  /** Renders an `<a>` when set; otherwise a `<button>` calling `onClick`. */
  href?: string;
  onClick?: () => void;
}

export interface MobileAppsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the drawer panel — required since there's no
   *  visible title to fall back to (Drawer's grab handle plus swipe-down /
   *  scrim-tap already cover dismissal, so no header row is rendered). */
  'aria-label': string;
  /** The grid tiles — supplied by the consumer (e.g. installed plugins,
   *  a plugin's own sections). MobileAppsDrawer owns only the drawer
   *  chrome/grid layout, never the item list itself. */
  items: MobileAppsDrawerItem[];
}

function DrawerGridTile({ icon, label, href, onClick }: Omit<MobileAppsDrawerItem, 'key'>) {
  const content = (
    <>
      <span className={styles.gridIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.gridName}>{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={styles.gridItem} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={styles.gridItem} onClick={onClick}>
      {content}
    </button>
  );
}

/**
 * The mobile "Apps" drawer: a bottom sheet with a 3-column grid of icon
 * tiles — same tile size (56px, radius 14px) and grid layout as the runtime
 * shell's own Apps drawer (MobileNav's Drawer content), generalized so the
 * tile list comes from the consumer (the shell passes installed plugins; a
 * plugin composing its own MobileFooter launcher passes whatever its own
 * "apps" are, e.g. a section index) rather than being hardcoded to plugins
 * specifically. No header row (title/close button) — Drawer's own grab
 * handle plus swipe-down/scrim-tap dismissal are enough, and a header ate
 * into the limited vertical space a launcher grid needs most.
 */
export function MobileAppsDrawer({ open, onClose, items, ...rest }: MobileAppsDrawerProps) {
  const ariaLabel = rest['aria-label'];

  return (
    <Drawer open={open} onClose={onClose} aria-label={ariaLabel}>
      <nav aria-label={ariaLabel}>
        <ul className={styles.grid}>
          {items.map(({ key, ...item }) => (
            <li key={key}>
              <DrawerGridTile key={key} {...item} />
            </li>
          ))}
        </ul>
      </nav>
    </Drawer>
  );
}
