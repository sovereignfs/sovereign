import { BrandingStore } from '../branding/store';
import { getDatabase } from '../database';
import { getSettings } from '../settings';
import { InstanceManager } from './manage';

let opened: Promise<InstanceManager> | undefined;

/** What an operator changes about the instance, for the life of the process. */
export function getInstanceManager(): Promise<InstanceManager> {
  opened ??= Promise.all([getDatabase(), getSettings()])
    .then(
      ([database, settings]) =>
        new InstanceManager(database, settings, new BrandingStore(database)),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
