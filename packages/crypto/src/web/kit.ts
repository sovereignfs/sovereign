/**
 * The recovery kit (core-app §5.3, RFC 0005 §1.2): 32 random bytes, written for a person to print and type back.
 *
 * - **The alphabet** is Crockford's base32, `0`–`9` and `A`–`Z` without `I`, `L`, `O` or `U`: nothing that reads as something else.
 *   Typed back, `O` is read as `0` and `I` and `L` as `1`, as Crockford's decoding does, since those are the slips people make.
 * - **The form** is 13 groups of four characters for the 256 bits (four bits to spare, always zero), then a **check group** of four
 *   more: the first 20 bits of SHA-256 over a label and the kit. One wrong character is caught as a mistyped kit, told apart from a
 *   kit that is well formed but not this account's, which only opening the wrap can tell.
 * - **Typing it** ignores case, spaces and hyphens.
 * - **Its key** is HKDF of the kit with `sovereign/1/kit`. It has full strength, so it needs no Argon2id.
 */
import { concat, source, utf8 } from './bytes.js';
import type { WebKey } from './password.js';
import { KEY_BYTES } from './records.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DATA_CHARS = 52; // ceil(256 / 5)
const CHECK_CHARS = 4; // 20 bits
const GROUP = 4;
const CHECK_LABEL = utf8('sovereign/1/kit-check');
const KEY_INFO = utf8('sovereign/1/kit');

/** Bytes to Crockford base32, most significant bit first, the last character padded with zero bits. */
function toBase32(bytes: Uint8Array, chars: number): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += ALPHABET[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (out.length < chars) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/** The first `chars` characters' worth of check over the kit. */
async function check(kit: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', source(concat(CHECK_LABEL, kit))),
  );
  return toBase32(digest.subarray(0, 3), CHECK_CHARS);
}

/** The kit as a person sees it: 14 groups of four, the last the check, joined by hyphens. */
export async function formatKit(kit: Uint8Array): Promise<string> {
  if (kit.length !== KEY_BYTES) throw new TypeError('A recovery kit is 32 bytes.');
  const text = toBase32(kit, DATA_CHARS) + (await check(kit));
  return text.match(new RegExp(`.{${GROUP}}`, 'g'))?.join('-') ?? '';
}

/** What reading a typed kit came to. */
export type ReadKit = { readonly ok: true; readonly kit: Uint8Array } | { readonly ok: false };

const READ_AS: Record<string, string> = { O: '0', I: '1', L: '1' };

/**
 * Reads a kit a person typed. `ok: false` means mistyped: a character outside the alphabet, the wrong length, or a check that does
 * not match. A kit that is well formed and not this account's reads as `ok: true`; opening its wrap is what refuses it.
 */
export async function readKit(typed: string): Promise<ReadKit> {
  const text = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[OIL]/g, (char) => READ_AS[char] ?? char);
  if (text.length !== DATA_CHARS + CHECK_CHARS) return { ok: false };
  const values: number[] = [];
  for (const char of text.slice(0, DATA_CHARS)) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) return { ok: false };
    values.push(value);
  }
  const kit = new Uint8Array(KEY_BYTES);
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (const value of values) {
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      kit[at++] = (buffer >> (bits - 8)) & 0xff;
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  // The four spare bits are zero in every kit made here; anything else was mistyped.
  if (buffer !== 0) return { ok: false };
  if ((await check(kit)) !== text.slice(DATA_CHARS)) return { ok: false };
  return { ok: true, kit };
}

/** The key a kit wraps the account key with: AES-256-GCM, from HKDF, and not exportable. */
export async function kitKey(kit: Uint8Array): Promise<WebKey> {
  if (kit.length !== KEY_BYTES) throw new TypeError('A recovery kit is 32 bytes.');
  const material = await crypto.subtle.importKey('raw', source(kit), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: source(KEY_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
