import { Avatar, Icon } from '@sovereignfs/ui';
import type { Shortcut } from '../../src/shortcuts/manager';
import styles from './shortcuts.module.css';

/**
 * A shortcut's icon as a tile or a row draws it: the icon from the set, the uploaded picture (from core itself, never
 * the site), or a letter from the name. Whoever draws it makes it grey.
 */
export function ShortcutIcon({ shortcut }: { shortcut: Pick<Shortcut, 'name' | 'icon'> }) {
  const { icon, name } = shortcut;
  if (icon?.kind === 'symbol') return <Icon name={icon.symbol} size="lg" aria-hidden={true} />;
  if (icon?.kind === 'image') return <img src={icon.path} alt="" className={styles.picture} />;
  return <Avatar name={name} size="md" />;
}
