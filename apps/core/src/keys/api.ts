import type { Database } from '@sovereignfs/database';
import { ApiError } from '../api/errors';
import { countCall } from '../api/rate-limit';
import { authenticate, type Principal } from '../api/token';
import { getDatabase } from '../database';
import { getTokenDeps } from '../directory/service';

/**
 * The Core API's two key calls (core-app §5.7, RFC 0005 §3.1): a person's public keys for an app, and the caller's own with their
 * private halves wrapped by the app key. Public keys and wrapped keys only: nothing here lets a server read a document.
 */

export const KEYS_SCOPE = 'keys';

/** As many calls as the Directory allows: sharing looks people's keys up as often as it looks people up. */
const LIMITS = { perClient: 600, perAccount: 120, windowMs: 60_000 };

/** The check each key call makes first: a good token with the `keys` scope, then the call counted for the app and the person. */
export async function keysGuard(request: Request): Promise<Principal> {
  const principal = await authenticate(await getTokenDeps(), request, KEYS_SCOPE);
  const database = await getDatabase();
  for (const [key, limit] of [
    [`api:keys:client:${principal.clientId}`, LIMITS.perClient],
    [`api:keys:account:${principal.userId}`, LIMITS.perAccount],
  ] as const) {
    const counted = await countCall(database, key, limit, LIMITS.windowMs);
    if (!counted.allowed) {
      throw new ApiError(429, 'rate_limited', 'Too many calls. Wait, then try again.', {
        'retry-after': String(counted.retryAfter),
      });
    }
  }
  return principal;
}

type WrapRecord = { suite: 1; nonce: string; ciphertext: string };
type Identity = {
  receive: { publicKey: string; privateKey: WrapRecord };
  sign: { publicKey: string; privateKey: WrapRecord };
};

export interface PersonKeys {
  sub: string;
  receivingKey: string;
  signingKey: string;
  signature: string;
  accountSigningKey: string;
}

export type MyKeys = PersonKeys & { wrapped: { receive: WrapRecord; sign: WrapRecord } };

const notOpened = () =>
  new ApiError(
    404,
    'not_found',
    'That person has not opened this app, so they have no keys for it.',
  );

/** A wrap record as the contract has it, and nothing else of what was stored. */
const record = (value: WrapRecord): WrapRecord => ({
  suite: 1,
  nonce: String(value.nonce),
  ciphertext: String(value.ciphertext),
});

async function keysOf(
  database: Database,
  sub: string,
  clientId: string,
): Promise<{ person: PersonKeys; identity: Identity } | undefined> {
  const row = (
    await database.run(
      `select a.identity, a.signature, k.signing_public from key_apps a
         join key_accounts k on k.user_id = a.user_id
         join users u on u.id = a.user_id
       where a.user_id = ? and a.client_id = ? and u.deactivated_at is null`,
      [sub, clientId],
    )
  ).rows[0];
  if (!row) return undefined;
  const identity = JSON.parse(String(row.identity)) as Identity;
  return {
    identity,
    person: {
      sub,
      receivingKey: identity.receive.publicKey,
      signingKey: identity.sign.publicKey,
      signature: String(row.signature),
      accountSigningKey: String(row.signing_public),
    },
  };
}

/** Another person's public keys for the caller's app, or `404`: no such person, deactivated, or not opened the app. */
export async function personKeys(
  database: Database,
  sub: string,
  clientId: string,
): Promise<PersonKeys> {
  const found = await keysOf(database, sub, clientId);
  if (!found) throw notOpened();
  return found.person;
}

/** The caller's own keys for their app, with the private halves wrapped by the app key, or `404` before they have opened it. */
export async function myKeys(database: Database, sub: string, clientId: string): Promise<MyKeys> {
  const found = await keysOf(database, sub, clientId);
  if (!found) throw notOpened();
  return {
    ...found.person,
    wrapped: {
      receive: record(found.identity.receive.privateKey),
      sign: record(found.identity.sign.privateKey),
    },
  };
}
