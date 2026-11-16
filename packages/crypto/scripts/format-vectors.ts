/**
 * Writes `src/web/__tests__/format-vectors.json`: one stored example of every record and blob of RFC 0005 §1.2 and §1.3, made from
 * fixed keys. The tests only open them, so a change to any stored format fails a test instead of passing a round trip.
 *
 * Run once per suite: `pnpm --filter @sovereignfs/crypto vectors:formats`. Never regenerate them to make a test pass. A new suite
 * gets vectors of its own beside these, and these keep opening.
 */
import { writeFileSync } from 'node:fs';
import { toBase64Url, utf8 } from '../src/web/bytes.js';
import { encryptBytes, importDocumentKey } from '../src/web/content.js';
import {
  createAccountSigningKey,
  createAppIdentity,
  openAccountSigningKey,
  openAppIdentity,
  publicKeyFrom,
  signAppKeys,
} from '../src/web/identity.js';
import { formatKit, kitKey } from '../src/web/kit.js';
import { accountWrapData, appKeyData, importWrappingKey, wrapSecret } from '../src/web/records.js';
import { sealEscrowWrap, shareDocumentKey } from '../src/web/sharing.js';

const fill = (start: number) => Uint8Array.from({ length: 32 }, (_, i) => (start + i) & 0xff);
const b64 = toBase64Url;

const raw = {
  unlockKey: fill(0x10),
  accountKey: fill(0x30),
  appKey: fill(0x50),
  documentKey: fill(0x70),
  kit: fill(0x90),
};
const sub = 'ada';
const clientId = 'notes';
const target = { documentId: 'doc-1', readerSub: sub };

const unlock = await importWrappingKey(raw.unlockKey);
const account = await importWrappingKey(raw.accountKey);
const app = await importWrappingKey(raw.appKey);

const signing = await createAccountSigningKey(account, sub);
const identity = await createAppIdentity(app, sub, clientId);
const opened = await openAppIdentity(app, identity, sub, clientId);
const signature = await signAppKeys(
  await openAccountSigningKey(account, signing.privateKey, sub),
  sub,
  clientId,
  {
    receive: publicKeyFrom(identity.receive.publicKey),
    sign: publicKeyFrom(identity.sign.publicKey),
  },
);

const escrow = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
  'deriveBits',
])) as unknown as {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};
const escrowPublic = new Uint8Array(await crypto.subtle.exportKey('raw', escrow.publicKey));
const escrowPrivate = new Uint8Array(await crypto.subtle.exportKey('pkcs8', escrow.privateKey));

const content = utf8(
  'A document frozen in its format, to be opened by every later version of this code.',
);

const vectors = {
  note: 'Made once by scripts/format-vectors.ts from fixed keys. Opened by the tests; never regenerated to make one pass.',
  keys: Object.fromEntries(Object.entries(raw).map(([name, bytes]) => [name, b64(bytes)])),
  sub,
  clientId,
  passwordWrap: await wrapSecret(unlock, raw.accountKey, accountWrapData(sub, 'password')),
  kit: {
    text: await formatKit(raw.kit),
    wrap: await wrapSecret(await kitKey(raw.kit), raw.accountKey, accountWrapData(sub, 'kit')),
  },
  appKeyWrap: await wrapSecret(account, raw.appKey, appKeyData(sub, clientId)),
  accountSigning: signing,
  identity,
  appKeysSignature: signature,
  documentKey: {
    target,
    record: await shareDocumentKey({
      documentKey: raw.documentKey,
      target,
      readerReceivingKey: opened.receive.publicKey,
      sharerSigningKey: opened.sign.privateKey,
    }),
  },
  escrow: {
    keyId: 'escrow-1',
    publicKey: b64(escrowPublic),
    privateKeyPkcs8: b64(escrowPrivate),
    record: await sealEscrowWrap({
      accountKey: raw.accountKey,
      sub,
      escrowKeyId: 'escrow-1',
      escrowPublicKey: escrowPublic,
    }),
  },
  content: {
    target: { documentId: 'doc-1', version: 7 },
    plaintext: b64(content),
    blob: b64(
      await encryptBytes(
        await importDocumentKey(raw.documentKey),
        { documentId: 'doc-1', version: 7 },
        content,
      ),
    ),
  },
};

const out = new URL('../src/web/__tests__/format-vectors.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`Wrote ${out.pathname}`);
