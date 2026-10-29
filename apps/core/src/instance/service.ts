import { BrandingStore } from '../branding/store';
import { getConfig } from '../config';
import { getDatabase } from '../database';
import { getSettings } from '../settings';
import { loadIdentity, PLAIN_IDENTITY, type InstanceIdentity } from './identity';
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

/**
 * The instance's name and pictures, for the titles, icons, sign-in pages and emails that show them. Never throws:
 * a page must still render, plainly, when the settings cannot be read.
 */
export async function getInstanceIdentity(): Promise<InstanceIdentity> {
  try {
    const [database, settings] = await Promise.all([getDatabase(), getSettings()]);
    return await loadIdentity(settings, new BrandingStore(database), getConfig().url);
  } catch {
    return PLAIN_IDENTITY;
  }
}
