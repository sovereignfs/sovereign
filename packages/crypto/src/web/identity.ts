/**
 * The keys a person is known by (RFC 0005 §1.2, §3):
 *
 * - **The account's signing key** (Ed25519), one for the account, its private half wrapped by the account key. It signs each app's
 *   public keys, and is what another person's browser remembers about them.
 * - **An app's two key pairs**, made with the app key: X25519 to receive document keys, Ed25519 to sign the ones the person shares.
 *   Their private halves are wrapped by the app key.
 *
 * A private key is made extractable only for the moment it takes to wrap it, and is opened again as a key that cannot be exported.
 */
import { fromBase64Url, source, toBase64Url } from './bytes.js';
import { encodeFields, LABEL } from './fields.js';
import { publicKeyBytes, type KeyPair } from './hpke.js';
import type { WebKey } from './password.js';
import { RecordError, unwrapSecret, wrapSecret, type WrapRecord } from './records.js';

const PUBLIC_BYTES = 32;
const SIGNATURE_BYTES = 64;

type Algorithm = 'X25519' | 'Ed25519';
const usagesOf = (algorithm: Algorithm) =>
  algorithm === 'X25519'
    ? { private: ['deriveBits'] as const, public: [] as const }
    : { private: ['sign'] as const, public: ['verify'] as const };

/** A key pair whose private half is wrapped: what is stored. */
export interface WrappedPair {
  readonly publicKey: string;
  readonly privateKey: WrapRecord;
}

/** Makes a key pair and wraps its private half under `key`, bound to `associatedData`. */
async function makeWrappedPair(
  algorithm: Algorithm,
  key: WebKey,
  associatedData: Uint8Array,
): Promise<WrappedPair> {
  const usages = usagesOf(algorithm);
  const pair = (await crypto.subtle.generateKey({ name: algorithm }, true, [
    ...usages.private,
    ...usages.public,
  ])) as unknown as KeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  try {
    return {
      publicKey: toBase64Url(await publicKeyBytes(pair.publicKey)),
      privateKey: await wrapSecret(key, pkcs8, associatedData),
    };
  } finally {
    pkcs8.fill(0);
  }
}

/** Opens a wrapped private half into a key that cannot be exported. */
async function openPrivate(
  algorithm: Algorithm,
  key: WebKey,
  record: unknown,
  associatedData: Uint8Array,
): Promise<WebKey> {
  const pkcs8 = await unwrapSecret(key, record, associatedData);
  try {
    return await crypto.subtle.importKey('pkcs8', source(pkcs8), { name: algorithm }, false, [
      ...usagesOf(algorithm).private,
    ]);
  } catch (error) {
    if (error instanceof RecordError) throw error;
    throw new RecordError('malformed');
  } finally {
    pkcs8.fill(0);
  }
}

/** A public key from its stored form, refusing anything that is not 32 bytes of base64url. */
export function publicKeyFrom(text: string): Uint8Array {
  const bytes = fromBase64Url(text);
  if (bytes?.length !== PUBLIC_BYTES) throw new RecordError('malformed');
  return bytes;
}

const importPublic = (algorithm: Algorithm, bytes: Uint8Array) =>
  crypto.subtle.importKey('raw', source(bytes), { name: algorithm }, true, [
    ...usagesOf(algorithm).public,
  ]);

// The account's signing key.

const accountSigningData = (sub: string) => encodeFields(LABEL.accountSigning, sub);

/** A new signing key for the account, its private half wrapped by the account key. */
export const createAccountSigningKey = (accountKey: WebKey, sub: string): Promise<WrappedPair> =>
  makeWrappedPair('Ed25519', accountKey, accountSigningData(sub));

/** The account's signing key, opened for signing. */
export const openAccountSigningKey = (
  accountKey: WebKey,
  record: unknown,
  sub: string,
): Promise<WebKey> => openPrivate('Ed25519', accountKey, record, accountSigningData(sub));

// An app's key pairs.

/** What an app's two key pairs are, as stored. */
export interface AppIdentity {
  readonly receive: WrappedPair;
  readonly sign: WrappedPair;
}

const identityData = (sub: string, clientId: string, use: 'receive' | 'sign') =>
  encodeFields(LABEL.identity, sub, clientId, use);

/** Makes an app's two key pairs, their private halves wrapped by the app key. */
export async function createAppIdentity(
  appKey: WebKey,
  sub: string,
  clientId: string,
): Promise<AppIdentity> {
  return {
    receive: await makeWrappedPair('X25519', appKey, identityData(sub, clientId, 'receive')),
    sign: await makeWrappedPair('Ed25519', appKey, identityData(sub, clientId, 'sign')),
  };
}

/** An app's key pairs, opened: the private halves cannot be exported. */
export interface OpenedIdentity {
  readonly receive: { readonly privateKey: WebKey; readonly publicKey: Uint8Array };
  readonly sign: { readonly privateKey: WebKey; readonly publicKey: Uint8Array };
}

/** Opens an app's two key pairs with the app key. */
export async function openAppIdentity(
  appKey: WebKey,
  identity: AppIdentity,
  sub: string,
  clientId: string,
): Promise<OpenedIdentity> {
  return {
    receive: {
      privateKey: await openPrivate(
        'X25519',
        appKey,
        identity.receive.privateKey,
        identityData(sub, clientId, 'receive'),
      ),
      publicKey: publicKeyFrom(identity.receive.publicKey),
    },
    sign: {
      privateKey: await openPrivate(
        'Ed25519',
        appKey,
        identity.sign.privateKey,
        identityData(sub, clientId, 'sign'),
      ),
      publicKey: publicKeyFrom(identity.sign.publicKey),
    },
  };
}

// The account's signature over an app's public keys.

const appKeysMessage = (sub: string, clientId: string, receive: Uint8Array, sign: Uint8Array) =>
  encodeFields(LABEL.appKeysSignature, sub, clientId, receive, sign);

/** The account signs an app's two public keys, with whose and which app they are. */
export async function signAppKeys(
  accountSigningKey: WebKey,
  sub: string,
  clientId: string,
  publicKeys: { receive: Uint8Array; sign: Uint8Array },
): Promise<string> {
  const message = appKeysMessage(sub, clientId, publicKeys.receive, publicKeys.sign);
  return toBase64Url(
    new Uint8Array(await crypto.subtle.sign('Ed25519', accountSigningKey, source(message))),
  );
}

/** Whether `signature` is the account's, over exactly these public keys for this person and app. */
export async function verifyAppKeys(
  accountSigningPublicKey: Uint8Array,
  sub: string,
  clientId: string,
  publicKeys: { receive: Uint8Array; sign: Uint8Array },
  signature: string,
): Promise<boolean> {
  const bytes = fromBase64Url(signature);
  if (bytes?.length !== SIGNATURE_BYTES) return false;
  const key = await importPublic('Ed25519', accountSigningPublicKey);
  const message = appKeysMessage(sub, clientId, publicKeys.receive, publicKeys.sign);
  return crypto.subtle.verify('Ed25519', key, source(bytes), source(message));
}

/** @internal Shared with `sharing.ts`. */
export const importSigningPublic = (bytes: Uint8Array) => importPublic('Ed25519', bytes);
