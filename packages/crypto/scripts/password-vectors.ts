/**
 * Writes `src/web/__tests__/password-vectors.json`: the password derivation of RFC 0005 §1.1 computed by a second implementation
 * (noble-hashes' SHA-256, Argon2id and HKDF) and none of this package's code, so the tests compare two implementations and not
 * one against itself. Run with `pnpm --filter @sovereignfs/crypto vectors`; the output is checked in.
 */
import { writeFileSync } from 'node:fs';
import { argon2id } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const utf8 = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

interface Case {
  name: string;
  password: string;
  address: string;
  instanceId: Uint8Array;
  derivation: { version: number; memoryBytes: number; passes: number };
  vaultSalt: Uint8Array;
}

const sequence = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, i) => (start + i) & 0xff);
const full = { version: 1, memoryBytes: 19 * 1024 * 1024, passes: 3 };
const quick = { version: 9, memoryBytes: 1024 * 1024, passes: 1 };

const cases: Case[] = [
  {
    name: 'plain, at the cost in use',
    password: 'correct horse battery staple',
    address: 'ada@example.com',
    instanceId: sequence(32, 0),
    derivation: full,
    vaultSalt: sequence(32, 100),
  },
  {
    name: 'an address that is trimmed and lowered, a password that NFKC changes',
    // A ligature, the Ångström sign and decomposed accents: NFKC turns each into its plain form.
    password: '\uFB01nancial \u212B re\u0301sume\u0301',
    address: '  Grace.Hopper@Example.ORG ',
    instanceId: sequence(32, 200),
    derivation: full,
    vaultSalt: sequence(32, 7),
  },
  {
    name: 'a cheap derivation, for checking a browser quickly',
    password: 'p',
    address: 'q@r.s',
    instanceId: sequence(32, 50),
    derivation: quick,
    vaultSalt: sequence(32, 0),
  },
];

const vectors = cases.map((item) => {
  const address = item.address.trim().toLowerCase();
  const salt = sha256(concat(utf8('sovereign/1/password'), item.instanceId, utf8(address))).slice(
    0,
    16,
  );
  const secret = argon2id(utf8(item.password.normalize('NFKC')), salt, {
    t: item.derivation.passes,
    m: item.derivation.memoryBytes / 1024,
    p: 1,
    dkLen: 32,
  });
  const signIn = hkdf(sha256, secret, new Uint8Array(), utf8('sovereign/1/sign-in'), 32);
  const unlock = hkdf(sha256, secret, item.vaultSalt, utf8('sovereign/1/unlock'), 32);
  return {
    name: item.name,
    input: {
      password: item.password,
      address: item.address,
      instanceId: b64url(item.instanceId),
      derivation: item.derivation,
      vaultSalt: b64url(item.vaultSalt),
    },
    output: {
      salt: bytesToHex(salt),
      secret: bytesToHex(secret),
      signIn: `svp${item.derivation.version}.${b64url(signIn)}`,
      unlockKey: bytesToHex(unlock),
    },
  };
});

const target = new URL('../src/web/__tests__/password-vectors.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`Wrote ${vectors.length} vectors to ${target.pathname}`);
