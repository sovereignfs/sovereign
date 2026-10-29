import { getAuth, getAuthSettings } from '../auth';
import { getDatabase } from '../database';
import { listLauncherApps, type LauncherApp } from './launcher';
import { ClientRegistry } from './registry';

export { launcherApps, type LauncherApp } from './launcher';
export {
  ClientRegistry,
  ClientRegistryError,
  type ClientSettings,
  type ClientView,
  type RegisterInput,
  type RegistryActor,
  type UpdateInput,
} from './registry';

let opened: Promise<ClientRegistry> | undefined;

/**
 * Core's client registry, for the life of the process. An instance whose own address is `http` is a
 * development instance, and may register `http` addresses on `localhost` (core-app §3.7.1).
 */
export function getClientRegistry(): Promise<ClientRegistry> {
  opened ??= Promise.all([getAuth(), getDatabase()])
    .then(
      ([auth, database]) =>
        new ClientRegistry(auth, database, {
          development: new URL(getAuthSettings().baseUrl).protocol === 'http:',
        }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}

/** The apps to show in the launcher. The caller has checked `launcher:access`. */
export async function getLauncherApps(): Promise<LauncherApp[]> {
  return listLauncherApps(await getAuth());
}
