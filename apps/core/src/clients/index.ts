import { getAuth, getAuthSettings } from '../auth';
import { getDatabase } from '../database';
import { ClientRegistry } from './registry';

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
