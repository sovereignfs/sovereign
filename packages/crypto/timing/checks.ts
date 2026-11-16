/**
 * The browser checks of the timing page: the same vectors and round trips the Node tests run, in the browser that opens the page,
 * since Node's WebCrypto passing says nothing about a browser's. They need `crypto.subtle`, so a secure context: the page opened
 * on `localhost`, or over https.
 */
import { fromBase64Url, toBase64Url, utf8 } from '../src/web/bytes.js';
import { decryptBytes, encryptBytes, importDocumentKey } from '../src/web/content.js';
import { AES_128_GCM, openWith, sealWith } from '../src/web/hpke.js';
import {
  createAccountSigningKey,
  createAppIdentity,
  openAccountSigningKey,
  openAppIdentity,
  publicKeyFrom,
  signAppKeys,
  verifyAppKeys,
} from '../src/web/identity.js';
import { formatKit, kitKey, readKit } from '../src/web/kit.js';
import { derivePassword } from '../src/web/password.js';
import {
  accountWrapData,
  importWrappingKey,
  newKey,
  unwrapSecret,
  wrapSecret,
} from '../src/web/records.js';
import { openDocumentKey, shareDocumentKey } from '../src/web/sharing.js';
import passwordVectors from '../src/web/__tests__/password-vectors.json' with { type: 'json' };
import a1 from '../src/web/__tests__/rfc9180-a1.json' with { type: 'json' };

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
const bytes = (text: string) => fromBase64Url(text) ?? new Uint8Array();

async function x25519Pair(privateHex: string, publicHex: string) {
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

/** Each check: a name and what it does, true when it holds. */
export const CHECKS: readonly [string, () => Promise<boolean>][] = [
  [
    'The password derivation meets its vectors',
    async () => {
      for (const { input, output } of passwordVectors) {
        const derived = await derivePassword({
          password: input.password,
          address: input.address,
          instanceId: bytes(input.instanceId),
          derivation: input.derivation,
        });
        if (derived.signIn !== output.signIn) return false;
      }
      return true;
    },
  ],
  [
    'HPKE meets RFC 9180 A.1.1',
    async () => {
      const context = { info: fromHex(a1.info), aad: fromHex(a1.aad) };
      const sealed = await sealWith(
        fromHex(a1.pkRm),
        fromHex(a1.pt),
        context,
        AES_128_GCM,
        await x25519Pair(a1.skEm, a1.pkEm),
      );
      const receiver = await x25519Pair(a1.skRm, a1.pkRm);
      const opened = await openWith(
        { privateKey: receiver.privateKey, publicKey: fromHex(a1.pkRm) },
        sealed,
        context,
        AES_128_GCM,
      );
      return same(sealed.ciphertext, fromHex(a1.ct)) && same(opened, fromHex(a1.pt));
    },
  ],
  [
    'Keys wrap, sign and share, and a moved record is refused',
    async () => {
      const accountKey = await importWrappingKey(newKey());
      const signing = await createAccountSigningKey(accountKey, 'ada');
      const signer = await openAccountSigningKey(accountKey, signing.privateKey, 'ada');
      const appKey = await importWrappingKey(newKey());
      const identity = await openAppIdentity(
        appKey,
        await createAppIdentity(appKey, 'ada', 'notes'),
        'ada',
        'notes',
      );
      const keys = { receive: identity.receive.publicKey, sign: identity.sign.publicKey };
      const signature = await signAppKeys(signer, 'ada', 'notes', keys);
      if (!(await verifyAppKeys(publicKeyFrom(signing.publicKey), 'ada', 'notes', keys, signature)))
        return false;
      if (await verifyAppKeys(publicKeyFrom(signing.publicKey), 'grace', 'notes', keys, signature))
        return false;

      const documentKey = newKey();
      const target = { documentId: 'doc', readerSub: 'ada' };
      const record = await shareDocumentKey({
        documentKey,
        target,
        readerReceivingKey: identity.receive.publicKey,
        sharerSigningKey: identity.sign.privateKey,
      });
      const opened = await openDocumentKey({
        record,
        target,
        reader: identity.receive,
        sharerSigningPublicKey: identity.sign.publicKey,
      });
      const moved = await openDocumentKey({
        record,
        target: { ...target, documentId: 'other' },
        reader: identity.receive,
        sharerSigningPublicKey: identity.sign.publicKey,
      }).then(
        () => true,
        () => false,
      );
      return same(opened, documentKey) && !moved;
    },
  ],
  [
    'The recovery kit is read back, and wraps the account key',
    async () => {
      const kit = newKey();
      const read = await readKit((await formatKit(kit)).toLowerCase());
      if (!read.ok || !same(read.kit, kit)) return false;
      const secret = newKey();
      const place = accountWrapData('ada', 'kit');
      const record = await wrapSecret(await kitKey(kit), secret, place);
      return same(await unwrapSecret(await kitKey(read.kit), record, place), secret);
    },
  ],
  [
    'A document is encrypted in chunks, and another version is refused',
    async () => {
      const key = await importDocumentKey(newKey());
      const value = utf8('a document that crosses no chunk edge, and is whole');
      const blob = await encryptBytes(key, { documentId: 'doc', version: 1 }, value);
      const back = await decryptBytes(key, { documentId: 'doc', version: 1 }, blob);
      const older = await decryptBytes(key, { documentId: 'doc', version: 0 }, blob).then(
        () => true,
        () => false,
      );
      return same(back, value) && !older;
    },
  ],
];
