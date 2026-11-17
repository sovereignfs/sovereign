import { describe, expect, it } from 'vitest';
import { fromBase64Url } from '../bytes.js';
import { decryptBytes, importDocumentKey } from '../content.js';
import {
  openAccountSigningKey,
  openAppIdentity,
  publicKeyFrom,
  verifyAppKeys,
  type AppIdentity,
} from '../identity.js';
import { formatKit, kitKey, readKit } from '../kit.js';
import { accountWrapData, appKeyData, importWrappingKey, unwrapSecret } from '../records.js';
import { openDocumentKey, openEscrowWrap } from '../sharing.js';
import frozen from './format-vectors.json' with { type: 'json' };

// Every stored format of suite 1, made once and opened here. A change to any of them fails one of these tests: such a change is a
// new suite, with vectors of its own, and these must go on opening (RFC 0005 §1.2, §1.3).

const bytes = (text: string) => {
  const value = fromBase64Url(text);
  if (!value) throw new Error(`not base64url: ${text}`);
  return value;
};
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');
const keys = Object.fromEntries(
  Object.entries(frozen.keys).map(([name, text]) => [name, bytes(text)]),
) as Record<keyof typeof frozen.keys, Uint8Array>;
const { sub, clientId } = frozen;
// JSON reads `suite` as a number; the records are parsed strictly when they are opened.
const identity = frozen.identity as unknown as AppIdentity;

describe('suite 1, as stored', () => {
  it('opens the account key from its password way in', async () => {
    const opened = await unwrapSecret(
      await importWrappingKey(keys.unlockKey),
      frozen.passwordWrap,
      accountWrapData(sub, 'password'),
    );
    expect(hex(opened)).toBe(hex(keys.accountKey));
  });

  it('writes the kit as it was written, and opens the account key with it', async () => {
    expect(await formatKit(keys.kit)).toBe(frozen.kit.text);
    const read = await readKit(frozen.kit.text);
    expect(read.ok).toBe(true);
    const opened = await unwrapSecret(
      await kitKey(read.ok ? read.kit : new Uint8Array()),
      frozen.kit.wrap,
      accountWrapData(sub, 'kit'),
    );
    expect(hex(opened)).toBe(hex(keys.accountKey));
  });

  it('opens the app key, the account’s signing key, the app’s pairs, and checks their signature', async () => {
    const account = await importWrappingKey(keys.accountKey);
    const appKey = await unwrapSecret(account, frozen.appKeyWrap, appKeyData(sub, clientId));
    expect(hex(appKey)).toBe(hex(keys.appKey));

    await openAccountSigningKey(account, frozen.accountSigning.privateKey, sub);
    const pairs = await openAppIdentity(await importWrappingKey(appKey), identity, sub, clientId);
    expect(
      await verifyAppKeys(
        publicKeyFrom(frozen.accountSigning.publicKey),
        sub,
        clientId,
        { receive: pairs.receive.publicKey, sign: pairs.sign.publicKey },
        frozen.appKeysSignature,
      ),
    ).toBe(true);
  });

  it('opens a shared document key', async () => {
    const pairs = await openAppIdentity(
      await importWrappingKey(keys.appKey),
      identity,
      sub,
      clientId,
    );
    const opened = await openDocumentKey({
      record: frozen.documentKey.record,
      target: frozen.documentKey.target,
      reader: pairs.receive,
      sharerSigningPublicKey: pairs.sign.publicKey,
    });
    expect(hex(opened)).toBe(hex(keys.documentKey));
  });

  it('opens an escrow wrap', async () => {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      bytes(frozen.escrow.privateKeyPkcs8) as Uint8Array<ArrayBuffer>,
      { name: 'X25519' },
      false,
      ['deriveBits'],
    );
    const opened = await openEscrowWrap({
      record: frozen.escrow.record,
      sub,
      escrowKeyId: frozen.escrow.keyId,
      escrow: { privateKey, publicKey: bytes(frozen.escrow.publicKey) },
    });
    expect(hex(opened)).toBe(hex(keys.accountKey));
  });

  it('opens a blob of content', async () => {
    const opened = await decryptBytes(
      await importDocumentKey(keys.documentKey),
      frozen.content.target,
      bytes(frozen.content.blob),
    );
    expect(hex(opened)).toBe(hex(bytes(frozen.content.plaintext)));
  });
});
