/**
 * One unambiguous encoding for everything RFC 0005 authenticates without encrypting: associated data, HPKE `info`, and what a
 * signature covers. Each field is its length, four bytes big-endian, then its bytes. A person's `sub`, an app's client id and a
 * document's id vary in length, so without the lengths a byte could move from one field into the next and the result read the
 * same: `("ab", "c")` and `("a", "bc")` must never be the same input.
 *
 * The first field is always a label naming what the bytes are for (`sovereign/1/app-key`, …), so a value made for one purpose is
 * never accepted for another.
 */
import { concat, utf8 } from './bytes.js';

/** A field: text (written as UTF-8) or bytes. */
export type Field = string | Uint8Array;

const MAX_FIELD = 0xffffffff;

/** The fields, each length-prefixed, in order. */
export function encodeFields(label: string, ...fields: readonly Field[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const field of [label, ...fields]) {
    const bytes = typeof field === 'string' ? utf8(field) : field;
    if (bytes.length > MAX_FIELD)
      throw new RangeError('A field is longer than four bytes can count.');
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    parts.push(length, bytes);
  }
  return concat(...parts);
}

/** The labels RFC 0005 §1.2 binds each record to. One place, so no two purposes can share one by accident. */
export const LABEL = {
  accountWrap: 'sovereign/1/account-wrap',
  escrowWrap: 'sovereign/1/escrow-wrap',
  accountSigning: 'sovereign/1/account-signing',
  appKey: 'sovereign/1/app-key',
  identity: 'sovereign/1/identity',
  appKeysSignature: 'sovereign/1/app-keys',
  documentKey: 'sovereign/1/document-key',
  documentKeySignature: 'sovereign/1/document-key-signature',
} as const;
