import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DecryptionError, FieldCipher, isDecryptionError } from '../index.js';

const key = () => randomBytes(32).toString('base64');
const CONTEXT = 'settings.smtp_password';

function cipher(...ids: string[]): { cipher: FieldCipher; ring: string } {
  const ring = ids.map((id) => `${id}:${key()}`).join(',');
  return { cipher: FieldCipher.fromKeyRing(ring), ring };
}

function failure(fn: () => unknown): DecryptionError {
  try {
    fn();
  } catch (error) {
    if (isDecryptionError(error)) return error;
    throw error;
  }
  throw new Error('expected a DecryptionError, but nothing was thrown');
}

/** The envelope with one of its colon-separated fields replaced. */
const withField = (envelope: string, index: number, replacement: string) =>
  envelope
    .split(':')
    .map((part, i) => (i === index ? replacement : part))
    .join(':');

describe('round trip', () => {
  it.each([
    'hunter2',
    '',
    'päss wörd 🔐 日本語',
    'x'.repeat(100_000),
    'with:colons:and\nnewlines\0nul',
  ])('returns what went in (%#)', (plaintext) => {
    const { cipher: c } = cipher('k1');
    expect(c.decrypt(c.encrypt(plaintext, CONTEXT), CONTEXT)).toBe(plaintext);
  });

  it('writes an sv1 envelope naming the current key', () => {
    const { cipher: c } = cipher('k1');
    const parts = c.encrypt('x', CONTEXT).split(':');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('sv1');
    expect(parts[1]).toBe('k1');
  });

  it('never contains the plaintext', () => {
    const { cipher: c } = cipher('k1');
    expect(c.encrypt('correct horse battery staple', CONTEXT)).not.toContain('correct');
  });

  it('gives a different envelope every time, from a fresh IV', () => {
    const { cipher: c } = cipher('k1');
    const envelopes = new Set(Array.from({ length: 200 }, () => c.encrypt('same', CONTEXT)));
    expect(envelopes.size).toBe(200);
    const ivs = new Set([...envelopes].map((e) => e.split(':')[2]));
    expect(ivs.size).toBe(200);
  });

  it('is readable by another cipher with the same ring (a restart)', () => {
    const { cipher: first, ring } = cipher('k1');
    const envelope = first.encrypt('persisted', CONTEXT);
    expect(FieldCipher.fromKeyRing(ring).decrypt(envelope, CONTEXT)).toBe('persisted');
  });
});

describe('tampering', () => {
  const { cipher: c } = cipher('k1');
  const envelope = c.encrypt('a value worth protecting', CONTEXT);

  it.each([
    ['the IV', 2],
    ['the ciphertext', 3],
    ['the tag', 4],
  ])('is detected in %s', (_name, index) => {
    const bytes = Buffer.from(envelope.split(':')[index] as string, 'base64url');
    bytes[0] = (bytes[0] as number) ^ 0x01;
    const error = failure(() =>
      c.decrypt(withField(envelope, index, bytes.toString('base64url')), CONTEXT),
    );
    expect(error.reason).toBe('authentication-failed');
  });

  it('is detected when the key id is changed to another key in the ring', () => {
    const ring = `k2:${key()},k1:${key()}`;
    const both = FieldCipher.fromKeyRing(ring);
    const written = both.encrypt('x', CONTEXT); // under k2
    expect(failure(() => both.decrypt(withField(written, 1, 'k1'), CONTEXT)).reason).toBe(
      'authentication-failed',
    );
  });

  it('is detected when the ciphertext is truncated or extended', () => {
    const ciphertext = envelope.split(':')[3] as string;
    expect(
      failure(() => c.decrypt(withField(envelope, 3, ciphertext.slice(0, -4)), CONTEXT)).reason,
    ).toBe('authentication-failed');
    expect(
      failure(() => c.decrypt(withField(envelope, 3, `${ciphertext}AAAA`), CONTEXT)).reason,
    ).toBe('authentication-failed');
  });
});

describe('the wrong key or context', () => {
  it('fails under a different key with the same id', () => {
    const writer = cipher('k1').cipher;
    const reader = cipher('k1').cipher;
    expect(failure(() => reader.decrypt(writer.encrypt('x', CONTEXT), CONTEXT)).reason).toBe(
      'authentication-failed',
    );
  });

  it('fails in another context, so a value copied to another field or row does not open', () => {
    const { cipher: c } = cipher('k1');
    const envelope = c.encrypt('x', 'users.totp_secret:42');
    expect(failure(() => c.decrypt(envelope, 'users.totp_secret:43')).reason).toBe(
      'authentication-failed',
    );
    expect(failure(() => c.decrypt(envelope, 'users.backup_codes:42')).reason).toBe(
      'authentication-failed',
    );
    expect(c.decrypt(envelope, 'users.totp_secret:42')).toBe('x');
  });

  it('refuses an empty or oversized context when encrypting and decrypting', () => {
    const { cipher: c } = cipher('k1');
    expect(() => c.encrypt('x', '')).toThrow(TypeError);
    expect(() => c.encrypt('x', 'c'.repeat(257))).toThrow(TypeError);
    expect(() => c.decrypt(c.encrypt('x', CONTEXT), '')).toThrow(TypeError);
  });

  it('says which key the value names, and that it is gone, when the ring no longer has it', () => {
    const old = cipher('k1').cipher;
    const envelope = old.encrypt('x', CONTEXT);
    const error = failure(() => cipher('k2').cipher.decrypt(envelope, CONTEXT));
    expect(error.reason).toBe('unknown-key');
    expect(error.keyId).toBe('k1');
    expect(error.message).toContain('"k1"');
  });
});

describe('a value that is not an envelope', () => {
  const { cipher: c } = cipher('k1');
  const good = c.encrypt('x', CONTEXT);

  it.each([
    '',
    'plaintext password',
    'sv1',
    'sv1:k1',
    'sv1:k1:AAAA:AAAA',
    'sv1:k1:AAAA:AAAA:AAAA:extra',
    'sv2:k1:AAAAAAAAAAAAAAAA:AAAA:AAAAAAAAAAAAAAAAAAAAAA',
    'sv1::AAAAAAAAAAAAAAAA:AAAA:AAAAAAAAAAAAAAAAAAAAAA',
    'sv1:k1::AAAA:AAAAAAAAAAAAAAAAAAAAAA',
    'sv1:k1:AAAAAAAAAAAAAAAA:AAAA:',
    'sv1:k1:not*base64:AAAA:AAAAAAAAAAAAAAAAAAAAAA',
  ])('is malformed: %j', (value) => {
    expect(failure(() => c.decrypt(value, CONTEXT)).reason).toBe('malformed');
  });

  it('is malformed when the IV or the tag has the wrong length', () => {
    expect(failure(() => c.decrypt(withField(good, 2, 'AAAA'), CONTEXT)).reason).toBe('malformed');
    expect(failure(() => c.decrypt(withField(good, 4, 'AAAA'), CONTEXT)).reason).toBe('malformed');
  });

  it('never repeats the value in the error', () => {
    const error = failure(() => c.decrypt('my-actual-password', CONTEXT));
    expect(error.message).not.toContain('my-actual-password');
  });
});

describe('rotation', () => {
  it('still reads values written under the old key', () => {
    const oldKey = `k1:${key()}`;
    const before = FieldCipher.fromKeyRing(oldKey);
    const envelope = before.encrypt('written before the rotation', CONTEXT);

    const after = FieldCipher.fromKeyRing(`k2:${key()},${oldKey}`);
    expect(after.currentKeyId).toBe('k2');
    expect(after.decrypt(envelope, CONTEXT)).toBe('written before the rotation');
  });

  it('encrypts new values under the new key', () => {
    const after = FieldCipher.fromKeyRing(`k2:${key()},k1:${key()}`);
    expect(after.encrypt('x', CONTEXT).split(':')[1]).toBe('k2');
  });

  it('upgrades a value read under an old key, and only then', () => {
    const oldKey = `k1:${key()}`;
    const envelope = FieldCipher.fromKeyRing(oldKey).encrypt('v', CONTEXT);
    const newKey = `k2:${key()}`;
    const after = FieldCipher.fromKeyRing(`${newKey},${oldKey}`);

    const first = after.open(envelope, CONTEXT);
    expect(first.value).toBe('v');
    expect(first.upgraded).toBeDefined();
    expect(first.upgraded?.split(':')[1]).toBe('k2');

    // The upgraded envelope reads with the new key alone: the old one can be retired.
    expect(FieldCipher.fromKeyRing(newKey).decrypt(first.upgraded as string, CONTEXT)).toBe('v');
    // And reading it again needs no further upgrade.
    expect(after.open(first.upgraded as string, CONTEXT).upgraded).toBeUndefined();
  });

  it('keeps the context when it upgrades', () => {
    const oldKey = `k1:${key()}`;
    const envelope = FieldCipher.fromKeyRing(oldKey).encrypt('v', 'a.b:1');
    const after = FieldCipher.fromKeyRing(`k2:${key()},${oldKey}`);
    const { upgraded } = after.open(envelope, 'a.b:1');
    expect(failure(() => after.decrypt(upgraded as string, 'a.b:2')).reason).toBe(
      'authentication-failed',
    );
  });

  it('tells which values still need upgrading', () => {
    const oldKey = `k1:${key()}`;
    const old = FieldCipher.fromKeyRing(oldKey).encrypt('v', CONTEXT);
    const after = FieldCipher.fromKeyRing(`k2:${key()},${oldKey}`);
    expect(after.isCurrent(old)).toBe(false);
    expect(after.isCurrent(after.encrypt('v', CONTEXT))).toBe(true);
    expect(after.isCurrent('not an envelope')).toBe(false);
  });

  it('cannot read a value once its key is dropped from the ring', () => {
    const oldKey = `k1:${key()}`;
    const envelope = FieldCipher.fromKeyRing(oldKey).encrypt('v', CONTEXT);
    expect(
      failure(() => FieldCipher.fromKeyRing(`k2:${key()}`).decrypt(envelope, CONTEXT)).reason,
    ).toBe('unknown-key');
  });

  it('degrades per value: one unreadable value does not stop the others', () => {
    const { cipher: c } = cipher('k1');
    const gone = FieldCipher.fromKeyRing(`k0:${key()}`).encrypt('lost', CONTEXT);
    const values = [c.encrypt('a', CONTEXT), gone, c.encrypt('c', CONTEXT)];
    const read = values.map((v) => {
      try {
        return c.decrypt(v, CONTEXT);
      } catch (error) {
        if (isDecryptionError(error)) return null;
        throw error;
      }
    });
    expect(read).toEqual(['a', null, 'c']);
  });
});
