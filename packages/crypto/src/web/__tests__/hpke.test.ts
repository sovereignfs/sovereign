import { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/core';
import { describe, expect, it } from 'vitest';
import { toBase64Url, utf8 } from '../bytes.js';
import {
  AES_128_GCM,
  generateReceivingKey,
  open,
  openWith,
  publicKeyBytes,
  seal,
  sealWith,
  type Sealed,
} from '../hpke.js';

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

/** An X25519 key pair from raw bytes, as RFC 9180's vectors give them; WebCrypto reads a raw private key only as a JWK. */
async function pairFrom(privateHex: string, publicHex: string) {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'OKP',
      crv: 'X25519',
      d: toBase64Url(fromHex(privateHex)),
      x: toBase64Url(fromHex(publicHex)),
    },
    { name: 'X25519' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'raw',
    fromHex(publicHex),
    { name: 'X25519' },
    true,
    [],
  );
  return { privateKey, publicKey };
}

// RFC 9180 Appendix A.1.1: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM, base mode, the first encryption.
const A1 = {
  info: '4f6465206f6e2061204772656369616e2055726e',
  pkEm: '37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431',
  skEm: '52c4a758a802cd8b936eceea314432798d5baf2d7e9235dc084ab1b9cfa2f736',
  pkRm: '3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d',
  skRm: '4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8',
  enc: '37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431',
  pt: '4265617574792069732074727574682c20747275746820626561757479',
  aad: '436f756e742d30',
  ct: 'f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a',
};

const theirs = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

async function recipient() {
  const pair = await generateReceivingKey();
  return { privateKey: pair.privateKey, publicKey: await publicKeyBytes(pair.publicKey) };
}

describe('HPKE, base mode (RFC 9180)', () => {
  it('meets the printed vector of Appendix A.1.1', async () => {
    const ephemeral = await pairFrom(A1.skEm, A1.pkEm);
    const receiver = await pairFrom(A1.skRm, A1.pkRm);
    const context = { info: fromHex(A1.info), aad: fromHex(A1.aad) };

    const sealed = await sealWith(
      fromHex(A1.pkRm),
      fromHex(A1.pt),
      context,
      AES_128_GCM,
      ephemeral,
    );
    expect(hex(sealed.enc)).toBe(A1.enc);
    expect(hex(sealed.ciphertext)).toBe(A1.ct);

    const opened = await openWith(
      { privateKey: receiver.privateKey, publicKey: fromHex(A1.pkRm) },
      { enc: fromHex(A1.enc), ciphertext: fromHex(A1.ct) },
      context,
      AES_128_GCM,
    );
    expect(hex(opened)).toBe(A1.pt);
  });

  // RFC 9180's printed vectors have no X25519 suite with AES-256-GCM, so suite 1 is held to a second implementation, both ways.
  it('agrees with a second implementation on X25519, HKDF-SHA256 and AES-256-GCM', async () => {
    const info = utf8('sovereign/1/test');
    const aad = utf8('bound');
    const plaintext = crypto.getRandomValues(new Uint8Array(32));

    const mine = await recipient();
    const fromThem = await theirs.seal(
      {
        recipientPublicKey: await crypto.subtle.importKey(
          'raw',
          mine.publicKey,
          { name: 'X25519' },
          true,
          [],
        ),
        info: info.buffer,
      },
      plaintext.buffer,
      aad.buffer,
    );
    const opened = await open(
      mine,
      { enc: new Uint8Array(fromThem.enc), ciphertext: new Uint8Array(fromThem.ct) },
      { info, aad },
    );
    expect(hex(opened)).toBe(hex(plaintext));

    const theirPair = await theirs.kem.generateKeyPair();
    const theirPublic = new Uint8Array(await crypto.subtle.exportKey('raw', theirPair.publicKey));
    const sealed = await seal(theirPublic, plaintext, { info, aad });
    const openedByThem = await theirs.open(
      {
        recipientKey: theirPair,
        enc: sealed.enc.buffer as ArrayBuffer,
        info: info.buffer,
      },
      sealed.ciphertext.buffer as ArrayBuffer,
      aad.buffer,
    );
    expect(hex(new Uint8Array(openedByThem))).toBe(hex(plaintext));
  });

  describe('refuses', () => {
    const context = { info: utf8('for ada'), aad: utf8('document 1') };
    const plaintext = utf8('a document key');
    let receiver: Awaited<ReturnType<typeof recipient>>;
    let sealed: Sealed;

    const attempt = (change: {
      sealed?: Sealed;
      info?: Uint8Array;
      aad?: Uint8Array;
      to?: typeof receiver;
    }) =>
      open(change.to ?? receiver, change.sealed ?? sealed, {
        info: change.info ?? context.info,
        aad: change.aad ?? context.aad,
      });

    it('opens what it sealed, as a baseline', async () => {
      receiver = await recipient();
      sealed = await seal(receiver.publicKey, plaintext, context);
      expect(new TextDecoder().decode(await attempt({}))).toBe('a document key');
    });

    it('another info', async () => {
      await expect(attempt({ info: utf8('for grace') })).rejects.toThrow();
    });

    it('another aad', async () => {
      await expect(attempt({ aad: utf8('document 2') })).rejects.toThrow();
    });

    it('a changed ciphertext', async () => {
      const ciphertext = sealed.ciphertext.slice();
      ciphertext[0] = (ciphertext[0] as number) ^ 1;
      await expect(attempt({ sealed: { ...sealed, ciphertext } })).rejects.toThrow();
    });

    it('a changed encapsulated key', async () => {
      const enc = sealed.enc.slice();
      enc[5] = (enc[5] as number) ^ 1;
      await expect(attempt({ sealed: { ...sealed, enc } })).rejects.toThrow();
    });

    it('another recipient', async () => {
      await expect(attempt({ to: await recipient() })).rejects.toThrow();
    });

    it('keys of the wrong length', async () => {
      await expect(seal(new Uint8Array(31), plaintext, context)).rejects.toThrow(TypeError);
      await expect(attempt({ sealed: { ...sealed, enc: new Uint8Array(33) } })).rejects.toThrow(
        TypeError,
      );
    });
  });

  it('makes a fresh ephemeral key for every seal', async () => {
    const receiver = await recipient();
    const one = await seal(receiver.publicKey, utf8('x'), { info: utf8('i') });
    const two = await seal(receiver.publicKey, utf8('x'), { info: utf8('i') });
    expect(hex(one.enc)).not.toBe(hex(two.enc));
    expect(hex(one.ciphertext)).not.toBe(hex(two.ciphertext));
  });

  it('keeps a receiving key’s private half from being exported', async () => {
    const pair = await generateReceivingKey();
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
  });
});
