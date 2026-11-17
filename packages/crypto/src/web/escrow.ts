/**
 * The escrow public key as people handle it (core-app §5.8): one line, `sv-escrow-1.<id>.<public key>`, which `sv key escrow` prints
 * and the owner pastes into the Console. The id is the first 8 bytes of the key's SHA-256, so it names the key and changes with it;
 * each escrow way in is bound to it.
 */
import { fromBase64Url, source, toBase64Url } from './bytes.js';

const PREFIX = 'sv-escrow-1';

export interface EscrowKey {
  readonly id: string;
  readonly publicKey: Uint8Array;
}

/** The id of an escrow public key: base64url of the first 8 bytes of its SHA-256. */
export async function escrowKeyId(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source(publicKey)));
  return toBase64Url(digest.slice(0, 8));
}

/** The one line for an escrow public key. */
export async function formatEscrowKey(publicKey: Uint8Array): Promise<string> {
  if (publicKey.length !== 32) throw new TypeError('An escrow public key is 32 bytes.');
  return `${PREFIX}.${await escrowKeyId(publicKey)}.${toBase64Url(publicKey)}`;
}

/** Reads the one line back, or `undefined` when it is not one, or its id does not match its key. */
export async function parseEscrowKey(text: string): Promise<EscrowKey | undefined> {
  const [prefix, id, key, ...rest] = text.trim().split('.');
  if (prefix !== PREFIX || !id || !key || rest.length > 0) return undefined;
  const publicKey = fromBase64Url(key);
  if (publicKey?.length !== 32 || (await escrowKeyId(publicKey)) !== id) return undefined;
  return { id, publicKey };
}

/** The same check, without WebCrypto, for a server validating what was pasted: the shape only. */
export const looksLikeEscrowKey = (text: string): boolean =>
  /^sv-escrow-1\.[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{43}$/.test(text.trim());
