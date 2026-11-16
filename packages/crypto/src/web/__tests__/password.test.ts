import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argon2id as nobleArgon2id } from '@noble/hashes/argon2.js';
import { describe, expect, it } from 'vitest';
import { argon2id, MINIMUM_COST } from '../argon2.js';
import { fromBase64Url, toBase64Url, utf8 } from '../bytes.js';
import {
  derivePassword,
  deriveUnlockKey,
  normaliseAddress,
  PASSWORD_DERIVATION,
  passwordSalt,
} from '../password.js';
import { isSignInValue, signInValueVersion } from '../../sign-in-value.js';
import vectors from './password-vectors.json' with { type: 'json' };

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const bytes = (text: string) => {
  const value = fromBase64Url(text);
  if (!value) throw new Error(`not base64url: ${text}`);
  return value;
};
const id = (seed: number) => Uint8Array.from({ length: 32 }, (_, i) => (seed + i) & 0xff);
const quick = { version: 9, memoryBytes: 1024 * 1024, passes: 1 };

describe('the password derivation (RFC 0005 §1.1)', () => {
  it('starts at 64 MiB and 3 passes, and never below the minimum', () => {
    expect(PASSWORD_DERIVATION).toEqual({ version: 1, memoryBytes: 64 * 1024 * 1024, passes: 3 });
    expect(PASSWORD_DERIVATION.memoryBytes).toBeGreaterThanOrEqual(MINIMUM_COST.memoryBytes);
    expect(PASSWORD_DERIVATION.passes).toBeGreaterThanOrEqual(MINIMUM_COST.passes);
  });

  // The vectors were made by noble-hashes alone (scripts/password-vectors.ts), so this compares two implementations.
  it.each(vectors.map((vector) => [vector.name, vector] as const))(
    'matches a second implementation: %s',
    async (_, { input, output }) => {
      const instanceId = bytes(input.instanceId);
      expect(hex(await passwordSalt(instanceId, input.address))).toBe(output.salt);

      const salt = Buffer.from(output.salt, 'hex');
      const secret = await argon2id(utf8(input.password.normalize('NFKC')), salt, input.derivation);
      expect(hex(secret)).toBe(output.secret);

      const derived = await derivePassword({
        password: input.password,
        address: input.address,
        instanceId,
        derivation: input.derivation,
      });
      expect(derived.signIn).toBe(output.signIn);

      // The unlock key cannot be exported, so it is shown to be the right key by what it opens.
      const unlock = await deriveUnlockKey(derived.secret, bytes(input.vaultSalt));
      const expected = await crypto.subtle.importKey(
        'raw',
        Buffer.from(output.unlockKey, 'hex'),
        'AES-GCM',
        false,
        ['decrypt'],
      );
      const iv = new Uint8Array(12);
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, unlock, utf8('opened'));
      const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, expected, sealed);
      expect(new TextDecoder().decode(opened)).toBe('opened');
    },
    20_000,
  );

  // RFC 9106's own Argon2id vector (§5.3) has four lanes, a secret and associated data, none of which libsodium takes. It is
  // checked against noble-hashes, which made the vectors above: RFC 9106, then noble-hashes, then this package.
  it('rests on a second implementation that meets RFC 9106 §5.3', () => {
    const tag = nobleArgon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      t: 3,
      m: 32,
      p: 4,
      dkLen: 32,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
    });
    expect(hex(tag)).toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
  });

  it('agrees with noble-hashes on Argon2id for random passwords and salts', async () => {
    for (let round = 0; round < 8; round += 1) {
      const password = crypto.getRandomValues(new Uint8Array(1 + round * 7));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const cost = { memoryBytes: (64 + round * 32) * 1024, passes: 1 + (round % 3) };
      const ours = await argon2id(password, salt, cost);
      const theirs = nobleArgon2id(password, salt, {
        t: cost.passes,
        m: cost.memoryBytes / 1024,
        p: 1,
        dkLen: 32,
      });
      expect(hex(ours)).toBe(hex(theirs));
    }
  });

  it('keeps the secret and the unlock key as keys that cannot be exported', async () => {
    const derived = await derivePassword({
      password: 'pw',
      address: 'a@b.c',
      instanceId: id(1),
      derivation: quick,
    });
    expect(derived.secret.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', derived.secret)).rejects.toThrow();
    const unlock = await deriveUnlockKey(derived.secret, id(9));
    expect(unlock.extractable).toBe(false);
    expect(unlock.usages.sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('gives unrelated values for another instance, another address or another password', async () => {
    const base = { password: 'same', address: 'a@b.c', instanceId: id(1), derivation: quick };
    const values = await Promise.all(
      [
        base,
        { ...base, instanceId: id(2) },
        { ...base, address: 'a@b.d' },
        { ...base, password: 'Same' },
      ].map(async (input) => (await derivePassword(input)).signIn),
    );
    expect(new Set(values).size).toBe(4);
  });

  it('reads an address trimmed and in lower case, and a password in NFKC', async () => {
    expect(normaliseAddress('  Ada@Example.COM\n')).toBe('ada@example.com');
    const one = await derivePassword({
      password: 'ﬁ',
      address: ' A@B.C ',
      instanceId: id(3),
      derivation: quick,
    });
    const two = await derivePassword({
      password: 'fi',
      address: 'a@b.c',
      instanceId: id(3),
      derivation: quick,
    });
    expect(one.signIn).toBe(two.signIn);
  });

  it('names its version in the sign-in value', async () => {
    const derived = await derivePassword({
      password: 'pw',
      address: 'a@b.c',
      instanceId: id(4),
      derivation: quick,
    });
    expect(derived.signIn.startsWith('svp9.')).toBe(true);
    expect(signInValueVersion(derived.signIn)).toBe(9);
  });

  it('refuses an instance id or a salt of the wrong length, and a cost below 8 KiB', async () => {
    await expect(passwordSalt(new Uint8Array(31), 'a@b.c')).rejects.toThrow(TypeError);
    await expect(argon2id(utf8('p'), new Uint8Array(15), quick)).rejects.toThrow(TypeError);
    await expect(
      argon2id(utf8('p'), new Uint8Array(16), { memoryBytes: 4096, passes: 1 }),
    ).rejects.toThrow(TypeError);
  });
});

describe('the sign-in value (core-app §5.2)', () => {
  const value = `svp1.${toBase64Url(new Uint8Array(32).fill(7))}`;

  it('is svp, a version, a dot and 32 bytes of base64url', () => {
    expect(value).toHaveLength(48);
    expect(isSignInValue(value)).toBe(true);
    expect(signInValueVersion(value)).toBe(1);
  });

  it.each([
    ['a password', 'correct horse battery staple'],
    ['no version', `svp.${value.slice(5)}`],
    ['a version 0', `svp0.${value.slice(5)}`],
    ['a byte short', `svp1.${toBase64Url(new Uint8Array(31))}`],
    ['a byte long', `svp1.${toBase64Url(new Uint8Array(33))}`],
    ['padding', `${value}=`],
    ['standard base64', `svp1.${'+'.repeat(42)}A`],
    ['bits left in the last character', `${value.slice(0, -1)}B`],
    ['a space', ` ${value}`],
    ['not a string', 42],
  ])('refuses %s', (_, candidate) => {
    expect(isSignInValue(candidate)).toBe(false);
  });
});

describe('base64url', () => {
  it('round-trips every length, and refuses what no encoding makes', () => {
    for (let length = 0; length < 40; length += 1) {
      const data = crypto.getRandomValues(new Uint8Array(length));
      const text = toBase64Url(data);
      expect(text).toBe(Buffer.from(data).toString('base64url'));
      expect(hex(bytes(text))).toBe(hex(data));
    }
    for (const bad of ['A', 'AB=', 'A+B', 'AB/C', 'AF']) expect(fromBase64Url(bad)).toBeUndefined();
  });
});

describe('what runs in a browser', () => {
  const dir = path.dirname(fileURLToPath(new URL('../index.ts', import.meta.url)));
  const sources = [
    ...readdirSync(dir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => path.join(dir, file)),
    path.join(dir, '../sign-in-value.ts'),
  ];

  it.each(sources.map((file) => [path.relative(dir, file), file]))(
    '%s uses nothing of Node',
    (_, file) => {
      // Code only: a comment may name what the code avoids.
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(text).not.toMatch(/from ['"]node:|require\(|\bBuffer\b|\bprocess\./);
    },
  );
});
