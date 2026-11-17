import { derivePassword, fromBase64Url } from '@sovereignfs/crypto/web';
import type { Database } from '@sovereignfs/database';
import { ensureInstanceId } from '../instance/instance-id';

/**
 * The sign-in value for a password, made on the server the way a browser makes it (core-app §5.2), for what makes accounts here:
 * the seed and `sovereign-admin`. The instance id is read from the database, made if there is none.
 */
export async function serverSignInValue(
  database: Database,
  password: string,
  address: string,
): Promise<string> {
  const instanceId = fromBase64Url(await ensureInstanceId(database));
  if (!instanceId) throw new Error('The instance id is not base64url.');
  return (await derivePassword({ password, address, instanceId })).signIn;
}
