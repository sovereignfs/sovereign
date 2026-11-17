import { getAuthSettings } from '../auth';
import { getDatabase } from '../database';
import { ShortcutManager } from './manager';

export {
  MAX_OWN_SHORTCUTS,
  MAX_SHORTCUT_ICON_BYTES,
  ShortcutError,
  ShortcutManager,
  shortcutIconPath,
  type Shortcut,
  type ShortcutActor,
  type ShortcutIcon,
  type ShortcutInput,
  type ShortcutScope,
} from './manager';
export { SHORTCUT_SYMBOLS, isShortcutSymbol, type ShortcutSymbol } from './symbols';

let opened: Promise<ShortcutManager> | undefined;

/**
 * The launcher's shortcuts, for the life of the process. Like an app's launch address, a shortcut's may be `http`
 * on `localhost` only on a development instance, one whose own address is `http` (core-app §3.8.1).
 */
export function getShortcutManager(): Promise<ShortcutManager> {
  opened ??= getDatabase()
    .then(
      (database) =>
        new ShortcutManager(database, {
          development: new URL(getAuthSettings().baseUrl).protocol === 'http:',
        }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
