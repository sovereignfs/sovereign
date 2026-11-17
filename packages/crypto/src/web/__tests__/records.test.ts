import { describe, expect, it } from 'vitest';
import { toBase64Url, utf8 } from '../bytes.js';
import { encodeFields, LABEL } from '../fields.js';
import { generateReceivingKey, publicKeyBytes } from '../hpke.js';
import type { WebKey } from '../password.js';
import {
  createAccountSigningKey,
  createAppIdentity,
  openAccountSigningKey,
  openAppIdentity,
  publicKeyFrom,
  signAppKeys,
  verifyAppKeys,
} from '../identity.js';
import {
  accountWrapData,
  appKeyData,
  importWrappingKey,
  newKey,
  parseWrapRecord,
  RecordError,
  rewrapKey,
  unwrapKey,
  unwrapSecret,
  wrapSecret,
} from '../records.js';
import { openDocumentKey, openEscrowWrap, sealEscrowWrap, shareDocumentKey } from '../sharing.js';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const keyFrom = () => importWrappingKey(newKey());
const refused = (reason: RecordError['reason']) => expect.objectContaining({ reason });

describe('fields', () => {
  it('cannot be read two ways: a byte moved across a boundary changes the encoding', () => {
    expect(hex(encodeFields('l', 'ab', 'c'))).not.toBe(hex(encodeFields('l', 'a', 'bc')));
    expect(hex(encodeFields('l', 'abc'))).not.toBe(hex(encodeFields('l', 'ab', 'c')));
    expect(hex(encodeFields('l', ''))).not.toBe(hex(encodeFields('l')));
  });

  it('puts the label first, so a value for one purpose never stands for another', () => {
    expect(hex(encodeFields(LABEL.appKey, 's', 'c'))).not.toBe(
      hex(encodeFields(LABEL.identity, 's', 'c')),
    );
    expect(hex(encodeFields('x', utf8('é')))).toBe(hex(encodeFields('x', 'é')));
    expect(hex(encodeFields('ab'))).toBe('000000026162');
  });
});

describe('a wrapped secret', () => {
  it('opens with its key and its place', async () => {
    const key = await keyFrom();
    const secret = newKey();
    const record = await wrapSecret(key, secret, accountWrapData('ada', 'password'));
    expect(record.suite).toBe(1);
    expect(hex(await unwrapSecret(key, record, accountWrapData('ada', 'password')))).toBe(
      hex(secret),
    );
  });

  it.each([
    ['another person', accountWrapData('grace', 'password')],
    ['another way in', accountWrapData('ada', 'kit')],
    ['another passkey', accountWrapData('ada', 'password', 'credential-2')],
    ['a byte moved between fields', encodeFields(LABEL.accountWrap, 'adapass', 'word', '')],
    ['another purpose', appKeyData('ada', 'password')],
  ])('does not open in %s', async (_, place) => {
    const key = await keyFrom();
    const record = await wrapSecret(key, newKey(), accountWrapData('ada', 'password'));
    await expect(unwrapSecret(key, record, place)).rejects.toEqual(
      refused('authentication-failed'),
    );
  });

  it('does not open with another key, or once altered', async () => {
    const key = await keyFrom();
    const place = appKeyData('ada', 'notes');
    const record = await wrapSecret(key, newKey(), place);
    await expect(unwrapSecret(await keyFrom(), record, place)).rejects.toEqual(
      refused('authentication-failed'),
    );
    const altered = { ...record, ciphertext: `${record.ciphertext.slice(0, -2)}AA` };
    await expect(unwrapSecret(key, altered, place)).rejects.toEqual(
      refused('authentication-failed'),
    );
  });

  it.each([
    ['not an object', 'text', 'malformed'],
    ['an extra field', { suite: 1, nonce: 'A', ciphertext: 'A', extra: 1 }, 'malformed'],
    ['a missing field', { suite: 1, nonce: toBase64Url(new Uint8Array(12)) }, 'malformed'],
    [
      'a nonce of the wrong length',
      { suite: 1, nonce: 'AAAA', ciphertext: toBase64Url(new Uint8Array(48)) },
      'malformed',
    ],
    [
      'a ciphertext shorter than a tag',
      { suite: 1, nonce: toBase64Url(new Uint8Array(12)), ciphertext: 'AAAA' },
      'malformed',
    ],
    [
      'another suite',
      {
        suite: 2,
        nonce: toBase64Url(new Uint8Array(12)),
        ciphertext: toBase64Url(new Uint8Array(48)),
      },
      'unknown-suite',
    ],
    [
      'a suite that is not a number',
      {
        suite: '1',
        nonce: toBase64Url(new Uint8Array(12)),
        ciphertext: toBase64Url(new Uint8Array(48)),
      },
      'malformed',
    ],
  ] as const)('is refused when it has %s', (_, value, reason) => {
    expect(() => parseWrapRecord(value)).toThrow(expect.objectContaining({ reason }));
  });

  it('opens straight into a key that cannot be exported, and re-wraps without one', async () => {
    const accountKey = newKey();
    const unlock = await keyFrom();
    const kit = await keyFrom();
    const record = await wrapSecret(unlock, accountKey, accountWrapData('ada', 'password'));

    const opened = await unwrapKey(unlock, record, accountWrapData('ada', 'password'));
    expect(opened.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', opened)).rejects.toThrow();

    const forKit = await rewrapKey(
      { key: unlock, record, associatedData: accountWrapData('ada', 'password') },
      { key: kit, associatedData: accountWrapData('ada', 'kit') },
    );
    expect(hex(await unwrapSecret(kit, forKit, accountWrapData('ada', 'kit')))).toBe(
      hex(accountKey),
    );
  });

  // The honest property, held by a test so that no document says more: a key object cannot be copied out, but whoever can use a
  // key can open what it wraps, a script on the page included.
  it('is opened to its bytes by anyone who can use the key that wraps it', async () => {
    const unlock = await keyFrom();
    expect(unlock.extractable).toBe(false);
    const secret = newKey();
    const record = await wrapSecret(unlock, secret, appKeyData('ada', 'notes'));
    expect(hex(await unwrapSecret(unlock, record, appKeyData('ada', 'notes')))).toBe(hex(secret));
  });
});

describe('the keys a person is known by', () => {
  it('opens an account signing key, and an app’s two pairs, as keys that cannot be exported', async () => {
    const accountKey = await keyFrom();
    const signing = await createAccountSigningKey(accountKey, 'ada');
    const opened = await openAccountSigningKey(accountKey, signing.privateKey, 'ada');
    expect(opened.extractable).toBe(false);

    const appKey = await keyFrom();
    const identity = await createAppIdentity(appKey, 'ada', 'notes');
    const pairs = await openAppIdentity(appKey, identity, 'ada', 'notes');
    expect(pairs.receive.privateKey.extractable).toBe(false);
    expect(pairs.sign.privateKey.extractable).toBe(false);
    expect(pairs.receive.publicKey).toHaveLength(32);
  });

  it('does not open an app’s pairs for another person or another app', async () => {
    const appKey = await keyFrom();
    const identity = await createAppIdentity(appKey, 'ada', 'notes');
    await expect(openAppIdentity(appKey, identity, 'grace', 'notes')).rejects.toEqual(
      refused('authentication-failed'),
    );
    await expect(openAppIdentity(appKey, identity, 'ada', 'files')).rejects.toEqual(
      refused('authentication-failed'),
    );
    await expect(openAccountSigningKey(appKey, identity.sign.privateKey, 'ada')).rejects.toEqual(
      refused('authentication-failed'),
    );
  });

  it('signs an app’s public keys, and the signature holds for nothing else', async () => {
    const accountKey = await keyFrom();
    const signing = await createAccountSigningKey(accountKey, 'ada');
    const signer = await openAccountSigningKey(accountKey, signing.privateKey, 'ada');
    const verifier = publicKeyFrom(signing.publicKey);
    const identity = await createAppIdentity(await keyFrom(), 'ada', 'notes');
    const keys = {
      receive: publicKeyFrom(identity.receive.publicKey),
      sign: publicKeyFrom(identity.sign.publicKey),
    };
    const signature = await signAppKeys(signer, 'ada', 'notes', keys);

    expect(await verifyAppKeys(verifier, 'ada', 'notes', keys, signature)).toBe(true);
    expect(await verifyAppKeys(verifier, 'grace', 'notes', keys, signature)).toBe(false);
    expect(await verifyAppKeys(verifier, 'ada', 'files', keys, signature)).toBe(false);
    expect(
      await verifyAppKeys(
        verifier,
        'ada',
        'notes',
        { receive: keys.sign, sign: keys.receive },
        signature,
      ),
    ).toBe(false);
    const other = await createAccountSigningKey(accountKey, 'ada');
    expect(
      await verifyAppKeys(publicKeyFrom(other.publicKey), 'ada', 'notes', keys, signature),
    ).toBe(false);
    expect(await verifyAppKeys(verifier, 'ada', 'notes', keys, 'AAAA')).toBe(false);
  });

  it('refuses a public key that is not 32 bytes', () => {
    expect(() => publicKeyFrom(toBase64Url(new Uint8Array(31)))).toThrow(RecordError);
    expect(() => publicKeyFrom('not base64url!')).toThrow(RecordError);
  });
});

describe('a shared document key', () => {
  async function people() {
    const appKey = await keyFrom();
    const sharer = await openAppIdentity(
      appKey,
      await createAppIdentity(appKey, 'ada', 'notes'),
      'ada',
      'notes',
    );
    const readerKey = await keyFrom();
    const reader = await openAppIdentity(
      readerKey,
      await createAppIdentity(readerKey, 'grace', 'notes'),
      'grace',
      'notes',
    );
    return { sharer, reader };
  }
  const target = { documentId: 'doc-1', readerSub: 'grace' };

  it('opens for its reader, on its document, from its sharer', async () => {
    const { sharer, reader } = await people();
    const documentKey = newKey();
    const record = await shareDocumentKey({
      documentKey,
      target,
      readerReceivingKey: reader.receive.publicKey,
      sharerSigningKey: sharer.sign.privateKey,
    });
    const opened = await openDocumentKey({
      record,
      target,
      reader: reader.receive,
      sharerSigningPublicKey: sharer.sign.publicKey,
    });
    expect(hex(opened)).toBe(hex(documentKey));
  });

  it('is refused on another document, for another reader, or with another reader’s key', async () => {
    const { sharer, reader } = await people();
    const record = await shareDocumentKey({
      documentKey: newKey(),
      target,
      readerReceivingKey: reader.receive.publicKey,
      sharerSigningKey: sharer.sign.privateKey,
    });
    const attempt = (change: Partial<Parameters<typeof openDocumentKey>[0]>) =>
      openDocumentKey({
        record,
        target,
        reader: reader.receive,
        sharerSigningPublicKey: sharer.sign.publicKey,
        ...change,
      });
    await expect(attempt({ target: { ...target, documentId: 'doc-2' } })).rejects.toEqual(
      refused('authentication-failed'),
    );
    await expect(attempt({ target: { ...target, readerSub: 'ada' } })).rejects.toEqual(
      refused('authentication-failed'),
    );
    await expect(attempt({ reader: sharer.receive })).rejects.toEqual(
      refused('authentication-failed'),
    );
  });

  // A lying server seals a key of its own to the reader and signs it with a key of its own. The reader checks the signature against
  // the signing key it remembers for the sharer, and the record is refused.
  it('is refused when a server puts a key of its own in its place', async () => {
    const { sharer, reader } = await people();
    const serverSigning = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as unknown as { privateKey: WebKey };
    const forged = await shareDocumentKey({
      documentKey: newKey(),
      target,
      readerReceivingKey: reader.receive.publicKey,
      sharerSigningKey: serverSigning.privateKey,
    });
    await expect(
      openDocumentKey({
        record: forged,
        target,
        reader: reader.receive,
        sharerSigningPublicKey: sharer.sign.publicKey,
      }),
    ).rejects.toEqual(refused('authentication-failed'));
  });

  it('is refused when its signature is moved to another sealing', async () => {
    const { sharer, reader } = await people();
    const share = () =>
      shareDocumentKey({
        documentKey: newKey(),
        target,
        readerReceivingKey: reader.receive.publicKey,
        sharerSigningKey: sharer.sign.privateKey,
      });
    const [one, two] = [await share(), await share()];
    await expect(
      openDocumentKey({
        record: { ...one, signature: two.signature },
        target,
        reader: reader.receive,
        sharerSigningPublicKey: sharer.sign.publicKey,
      }),
    ).rejects.toEqual(refused('authentication-failed'));
  });
});

describe('an escrow wrap', () => {
  it('opens with the escrow key for its person, and no other', async () => {
    const pair = await generateReceivingKey();
    const escrow = { privateKey: pair.privateKey, publicKey: await publicKeyBytes(pair.publicKey) };
    const accountKey = newKey();
    const record = await sealEscrowWrap({
      accountKey,
      sub: 'ada',
      escrowKeyId: 'e1',
      escrowPublicKey: escrow.publicKey,
    });
    expect(hex(await openEscrowWrap({ record, sub: 'ada', escrowKeyId: 'e1', escrow }))).toBe(
      hex(accountKey),
    );
    await expect(
      openEscrowWrap({ record, sub: 'grace', escrowKeyId: 'e1', escrow }),
    ).rejects.toEqual(refused('authentication-failed'));
    await expect(openEscrowWrap({ record, sub: 'ada', escrowKeyId: 'e2', escrow })).rejects.toEqual(
      refused('authentication-failed'),
    );
  });
});
