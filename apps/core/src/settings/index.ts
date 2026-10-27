import { getConfig, getFieldCipher } from '../config';
import { getDatabase } from '../database';
import { SettingsStore } from './store';

export { SETTINGS, ALL_SETTINGS } from './definitions';
export { SettingsError, SettingsStore } from './store';
export type { DescribedSetting, ResolvedSetting, SettingSource } from './store';

let opened: Promise<SettingsStore> | undefined;

/**
 * Core's settings, for the life of the process. With no database configured the store reads
 * the environment and the built-in defaults, and refuses to save.
 */
export function getSettings(): Promise<SettingsStore> {
  opened ??= getDatabase()
    .then(
      (database) => new SettingsStore({ database, cipher: getFieldCipher(), config: getConfig() }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
