/**
 * Keys sealed to a person with HPKE (RFC 0005 §1.2):
 *
 * - **A document key**, sealed to a reader's receiving key for one document, and signed by the person who shared it, so that a
 *   reader can tell who it came from and a server cannot put a key of its own in its place.
 * - **An escrow wrap**, the account key sealed to the instance's escrow public key (core-app §5.8).
 */
import { fromBase64Url, source, toBase64Url } from './bytes.js';
import { encodeFields, LABEL } from './fields.js';
import { open, seal, type Sealed } from './hpke.js';
import { importSigningPublic } from './identity.js';
import type { WebKey } from './password.js';
import { KEY_BYTES, RecordError, SUITE } from './records.js';

const ENC_BYTES = 32;
const SIGNATURE_BYTES = 64;
const SEALED_KEY_BYTES = KEY_BYTES + 16;

/** A key sealed to someone, as it is stored. */
export interface SealedRecord {
  readonly suite: typeof SUITE;
  readonly enc: string;
  readonly ciphertext: string;
}

/** A document key sealed to a reader and signed by the person who shared it. */
export interface SharedKeyRecord extends SealedRecord {
  readonly signature: string;
}

const encode = (sealed: Sealed): SealedRecord => ({
  suite: SUITE,
  enc: toBase64Url(sealed.enc),
  ciphertext: toBase64Url(sealed.ciphertext),
});

function decode(value: unknown, keys: string): Sealed & { signature?: Uint8Array } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RecordError('malformed');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== keys) throw new RecordError('malformed');
  if (record.suite !== SUITE) {
    throw new RecordError(typeof record.suite === 'number' ? 'unknown-suite' : 'malformed');
  }
  const read = (field: string) =>
    typeof record[field] === 'string' ? fromBase64Url(record[field] as string) : undefined;
  const enc = read('enc');
  const ciphertext = read('ciphertext');
  const signature = keys.includes('signature') ? read('signature') : undefined;
  if (enc?.length !== ENC_BYTES || ciphertext?.length !== SEALED_KEY_BYTES) {
    throw new RecordError('malformed');
  }
  if (keys.includes('signature') && signature?.length !== SIGNATURE_BYTES) {
    throw new RecordError('malformed');
  }
  return { enc, ciphertext, ...(signature ? { signature } : {}) };
}

async function openKey(
  recipient: { privateKey: WebKey; publicKey: Uint8Array },
  sealed: Sealed,
  info: Uint8Array,
): Promise<Uint8Array> {
  try {
    return await open(recipient, sealed, { info });
  } catch (error) {
    if (error instanceof TypeError) throw new RecordError('malformed');
    throw new RecordError('authentication-failed');
  }
}

// Document keys.

/** What a document key is bound to: the document and the reader. */
export interface DocumentKeyTarget {
  readonly documentId: string;
  readonly readerSub: string;
}

const documentKeyInfo = (target: DocumentKeyTarget) =>
  encodeFields(LABEL.documentKey, target.documentId, target.readerSub);

const documentKeyMessage = (target: DocumentKeyTarget, sealed: Sealed) =>
  encodeFields(
    LABEL.documentKeySignature,
    target.documentId,
    target.readerSub,
    sealed.enc,
    sealed.ciphertext,
  );

/** Seals a document key to a reader for one document, signed with the sharer's signing key for this app. */
export async function shareDocumentKey(input: {
  readonly documentKey: Uint8Array;
  readonly target: DocumentKeyTarget;
  readonly readerReceivingKey: Uint8Array;
  readonly sharerSigningKey: WebKey;
}): Promise<SharedKeyRecord> {
  if (input.documentKey.length !== KEY_BYTES) throw new TypeError('A document key is 32 bytes.');
  const sealed = await seal(input.readerReceivingKey, input.documentKey, {
    info: documentKeyInfo(input.target),
  });
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'Ed25519',
      input.sharerSigningKey,
      source(documentKeyMessage(input.target, sealed)),
    ),
  );
  return { ...encode(sealed), signature: toBase64Url(signature) };
}

/**
 * Opens a document key: checks the sharer's signature first, then opens it with the reader's receiving key. The caller overwrites
 * the bytes once it has made the content key from them.
 */
export async function openDocumentKey(input: {
  readonly record: unknown;
  readonly target: DocumentKeyTarget;
  readonly reader: { readonly privateKey: WebKey; readonly publicKey: Uint8Array };
  readonly sharerSigningPublicKey: Uint8Array;
}): Promise<Uint8Array> {
  const sealed = decode(input.record, 'ciphertext,enc,signature,suite');
  const verified = await crypto.subtle.verify(
    'Ed25519',
    await importSigningPublic(input.sharerSigningPublicKey),
    source(sealed.signature as Uint8Array),
    source(documentKeyMessage(input.target, sealed)),
  );
  if (!verified) throw new RecordError('authentication-failed');
  return openKey(input.reader, sealed, documentKeyInfo(input.target));
}

// Escrow.

const escrowInfo = (sub: string, escrowKeyId: string) =>
  encodeFields(LABEL.escrowWrap, sub, escrowKeyId);

/** Seals the account key's bytes to the instance's escrow public key (core-app §5.8). */
export async function sealEscrowWrap(input: {
  readonly accountKey: Uint8Array;
  readonly sub: string;
  readonly escrowKeyId: string;
  readonly escrowPublicKey: Uint8Array;
}): Promise<SealedRecord> {
  if (input.accountKey.length !== KEY_BYTES) throw new TypeError('An account key is 32 bytes.');
  return encode(
    await seal(input.escrowPublicKey, input.accountKey, {
      info: escrowInfo(input.sub, input.escrowKeyId),
    }),
  );
}

/** Opens an escrow wrap with the escrow private key, offline (`sv key escrow open`). */
export function openEscrowWrap(input: {
  readonly record: unknown;
  readonly sub: string;
  readonly escrowKeyId: string;
  readonly escrow: { readonly privateKey: WebKey; readonly publicKey: Uint8Array };
}): Promise<Uint8Array> {
  return openKey(
    input.escrow,
    decode(input.record, 'ciphertext,enc,suite'),
    escrowInfo(input.sub, input.escrowKeyId),
  );
}
