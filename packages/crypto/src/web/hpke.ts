/**
 * HPKE (RFC 9180), base mode, over WebCrypto: how one person's browser seals a key so that only another person's browser opens it
 * (RFC 0005 §1, "Encrypting a key to a person"). Suite: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM.
 *
 * Only single-shot seal and open are offered. Each seal makes a fresh ephemeral key and uses sequence number 0, so there is no
 * context to keep and no counter to get wrong.
 *
 * No audited HPKE for a browser was found (the README says what was looked at), so this is written here over WebCrypto, from RFC
 * 9180 §4 and §5, and held to its printed vector and to a second implementation in the tests. The recipient's private key stays a
 * WebCrypto key; the Diffie-Hellman output and the secrets made from it are bytes in this code for as long as it runs, and are
 * overwritten before it returns.
 */
import { concat, source, utf8 } from './bytes.js';
import type { WebKey } from './password.js';

/** The AEADs this code can use. Suite 1 of RFC 0005 is AES-256-GCM; AES-128-GCM exists for RFC 9180's printed vector. */
type Aead = { id: number; keyBytes: number };
const AES_256_GCM: Aead = { id: 0x0002, keyBytes: 32 };
export const AES_128_GCM: Aead = { id: 0x0001, keyBytes: 16 };

const KEM_ID = 0x0020; // DHKEM(X25519, HKDF-SHA256)
const KDF_ID = 0x0001; // HKDF-SHA256
const NONCE_BYTES = 12;
const HASH_BYTES = 32;
const X25519_BYTES = 32;

/** What a seal produces: the ephemeral public key (`enc`) and the ciphertext with its tag. */
export interface Sealed {
  readonly enc: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** What both sides bind the ciphertext to: `info` (who and what it is for) and `aad` (anything else authenticated). */
export interface SealContext {
  readonly info: Uint8Array;
  readonly aad?: Uint8Array;
}

const i2osp = (value: number, length: number) => {
  const out = new Uint8Array(length);
  for (let i = length - 1, rest = value; i >= 0; i -= 1, rest = Math.floor(rest / 256))
    out[i] = rest & 0xff;
  return out;
};

const HPKE_V1 = utf8('HPKE-v1');
const kemSuite = concat(utf8('KEM'), i2osp(KEM_ID, 2));
const hpkeSuite = (aead: Aead) =>
  concat(utf8('HPKE'), i2osp(KEM_ID, 2), i2osp(KDF_ID, 2), i2osp(aead.id, 2));

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // An empty HMAC key is the same as a run of zeros (RFC 2104 pads it), and WebCrypto refuses an empty one.
  const material = key.length === 0 ? new Uint8Array(HASH_BYTES) : key;
  const imported = await crypto.subtle.importKey(
    'raw',
    source(material),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, source(data)));
}

/** HKDF-Extract and HKDF-Expand apart (RFC 5869), as HPKE uses them; WebCrypto offers only the two together. */
const extract = (salt: Uint8Array, ikm: Uint8Array) => hmac(salt, ikm);
async function expand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let block = new Uint8Array();
  for (let i = 1, at = 0; at < length; i += 1) {
    block = new Uint8Array(await hmac(prk, concat(block, info, Uint8Array.of(i))));
    out.set(block.subarray(0, length - at), at);
    at += block.length;
  }
  block.fill(0);
  return out;
}

const labeledExtract = (suite: Uint8Array, salt: Uint8Array, label: string, ikm: Uint8Array) =>
  extract(salt, concat(HPKE_V1, suite, utf8(label), ikm));
const labeledExpand = (
  suite: Uint8Array,
  prk: Uint8Array,
  label: string,
  info: Uint8Array,
  length: number,
) => expand(prk, concat(i2osp(length, 2), HPKE_V1, suite, utf8(label), info), length);

/** RFC 9180 §7.1.4: an X25519 output of all zeros (a small-order public key) is refused, here and not left to WebCrypto. */
async function dh(privateKey: WebKey, publicKey: Uint8Array): Promise<Uint8Array> {
  const unusable = () =>
    new Error('The Diffie-Hellman exchange failed: the public key is not usable.');
  let output: Uint8Array;
  try {
    const peer = await crypto.subtle.importKey(
      'raw',
      source(publicKey),
      { name: 'X25519' },
      true,
      [],
    );
    output = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'X25519', public: peer },
        privateKey,
        X25519_BYTES * 8,
      ),
    );
  } catch {
    throw unusable();
  }
  if (output.every((byte) => byte === 0)) throw unusable();
  return output;
}

/** RFC 9180 §4.1: the shared secret from the Diffie-Hellman output and both public keys. */
async function extractAndExpand(dhOutput: Uint8Array, kemContext: Uint8Array): Promise<Uint8Array> {
  const prk = await labeledExtract(kemSuite, new Uint8Array(), 'eae_prk', dhOutput);
  const secret = await labeledExpand(kemSuite, prk, 'shared_secret', kemContext, HASH_BYTES);
  prk.fill(0);
  return secret;
}

/** RFC 9180 §5.1, base mode: the AEAD key and nonce for sequence number 0. */
async function keySchedule(sharedSecret: Uint8Array, info: Uint8Array, aead: Aead) {
  const suite = hpkeSuite(aead);
  const empty = new Uint8Array();
  const pskIdHash = await labeledExtract(suite, empty, 'psk_id_hash', empty);
  const infoHash = await labeledExtract(suite, empty, 'info_hash', info);
  const context = concat(Uint8Array.of(0), pskIdHash, infoHash);
  const secret = await labeledExtract(suite, sharedSecret, 'secret', empty);
  const key = await labeledExpand(suite, secret, 'key', context, aead.keyBytes);
  const nonce = await labeledExpand(suite, secret, 'base_nonce', context, NONCE_BYTES);
  secret.fill(0);
  const aeadKey = await crypto.subtle.importKey('raw', source(key), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  key.fill(0);
  return { aeadKey, nonce };
}

/** The raw 32 bytes of an X25519 public key. */
export async function publicKeyBytes(publicKey: WebKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
}

/** An X25519 key pair. */
export interface KeyPair {
  readonly publicKey: WebKey;
  readonly privateKey: WebKey;
}

/** A new X25519 key pair; the private half cannot be exported. Node's types do not narrow `generateKey` for X25519. */
const newX25519 = async (): Promise<KeyPair> =>
  (await crypto.subtle.generateKey({ name: 'X25519' }, false, [
    'deriveBits',
  ])) as unknown as KeyPair;

/** A new X25519 key pair to receive with. The private half cannot be exported. */
export const generateReceivingKey = newX25519;

/** @internal Seal with a chosen AEAD and ephemeral key: for RFC 9180's printed vector. Use `seal`. */
export async function sealWith(
  recipient: Uint8Array,
  plaintext: Uint8Array,
  context: SealContext,
  aead: Aead,
  ephemeral?: KeyPair,
): Promise<Sealed> {
  if (recipient.length !== X25519_BYTES) throw new TypeError('An X25519 public key is 32 bytes.');
  const pair = ephemeral ?? (await newX25519());
  const enc = await publicKeyBytes(pair.publicKey);
  const shared = await dh(pair.privateKey, recipient);
  const sharedSecret = await extractAndExpand(shared, concat(enc, recipient));
  shared.fill(0);
  const { aeadKey, nonce } = await keySchedule(sharedSecret, context.info, aead);
  sharedSecret.fill(0);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: source(nonce),
        additionalData: source(context.aad ?? new Uint8Array()),
      },
      aeadKey,
      source(plaintext),
    ),
  );
  return { enc, ciphertext };
}

/** @internal Open with a chosen AEAD: for RFC 9180's printed vector. Use `open`. */
export async function openWith(
  recipient: { privateKey: WebKey; publicKey: Uint8Array },
  sealed: Sealed,
  context: SealContext,
  aead: Aead,
): Promise<Uint8Array> {
  if (sealed.enc.length !== X25519_BYTES) throw new TypeError('An encapsulated key is 32 bytes.');
  const shared = await dh(recipient.privateKey, sealed.enc);
  const sharedSecret = await extractAndExpand(shared, concat(sealed.enc, recipient.publicKey));
  shared.fill(0);
  const { aeadKey, nonce } = await keySchedule(sharedSecret, context.info, aead);
  sharedSecret.fill(0);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: source(nonce),
        additionalData: source(context.aad ?? new Uint8Array()),
      },
      aeadKey,
      source(sealed.ciphertext),
    ),
  );
}

/** Seals `plaintext` so that only the holder of `recipient`'s private key opens it, bound to `context`. */
export const seal = (recipient: Uint8Array, plaintext: Uint8Array, context: SealContext) =>
  sealWith(recipient, plaintext, context, AES_256_GCM);

/**
 * Opens what `seal` made. Throws when anything differs: the key, the ciphertext, `info` or `aad`. The recipient's public key is
 * needed as well as its private key, which WebCrypto cannot derive from a key that cannot be exported.
 */
export const open = (
  recipient: { privateKey: WebKey; publicKey: Uint8Array },
  sealed: Sealed,
  context: SealContext,
) => openWith(recipient, sealed, context, AES_256_GCM);
