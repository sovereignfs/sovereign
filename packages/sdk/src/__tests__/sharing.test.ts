import {
  createAccountSigningKey,
  createAppIdentity,
  importWrappingKey,
  memoryBackend,
  newKey,
  openAccountSigningKey,
  publicKeyFrom,
  signAppKeys,
} from '@sovereignfs/crypto/web';
import { describe, expect, it } from 'vitest';
import { appKeys, type MyKeys, type PersonKeys } from '../keys';

/** A person's keys for the app, as core keeps them and the Core API gives them. */
async function personFor(sub: string, clientId = 'notes') {
  const accountKey = await importWrappingKey(newKey());
  const signing = await createAccountSigningKey(accountKey, sub);
  const appKey = await importWrappingKey(newKey());
  const identity = await createAppIdentity(appKey, sub, clientId);
  const signature = await signAppKeys(
    await openAccountSigningKey(accountKey, signing.privateKey, sub),
    sub,
    clientId,
    {
      receive: publicKeyFrom(identity.receive.publicKey),
      sign: publicKeyFrom(identity.sign.publicKey),
    },
  );
  const keys: PersonKeys = {
    sub,
    receivingKey: identity.receive.publicKey,
    signingKey: identity.sign.publicKey,
    signature,
    accountSigningKey: signing.publicKey,
  };
  const me: MyKeys = {
    ...keys,
    wrapped: { receive: identity.receive.privateKey, sign: identity.sign.privateKey },
  };
  return { keys, me, appKey };
}

const browser = () =>
  appKeys({
    core: 'https://id.example',
    clientId: 'notes',
    returnTo: 'https://notes.example/keys',
    backend: memoryBackend(),
  });

describe('sharing between people (sdk §9.4, RFC 0005 §3.1)', () => {
  it('shares a document key that the reader opens, and nobody else', async () => {
    const ada = await personFor('ada');
    const grace = await personFor('grace');
    const linus = await personFor('linus');
    const adaPage = browser();
    const gracePage = browser();

    const adaIdentity = await adaPage.identity(ada.appKey, ada.me);
    const toGrace = await adaPage.checkPerson(grace.keys);
    if (!adaIdentity.ok || !toGrace.ok) throw new Error('refused');
    const documentKey = adaPage.newDocumentKey();
    const record = await adaPage.share({
      documentKey,
      documentId: 'doc-1',
      to: toGrace.person,
      identity: adaIdentity.identity,
    });

    const graceIdentity = await gracePage.identity(grace.appKey, grace.me);
    const fromAda = await gracePage.checkPerson(ada.keys);
    if (!graceIdentity.ok || !fromAda.ok) throw new Error('refused');
    expect(
      await gracePage.openShared({
        record,
        documentId: 'doc-1',
        me: grace.keys,
        from: fromAda.person,
        identity: graceIdentity.identity,
      }),
    ).toEqual(documentKey);

    // Another reader, or the same record moved to another document, opens nothing.
    const linusPage = browser();
    const linusIdentity = await linusPage.identity(linus.appKey, linus.me);
    const linusFromAda = await linusPage.checkPerson(ada.keys);
    if (!linusIdentity.ok || !linusFromAda.ok) throw new Error('refused');
    await expect(
      linusPage.openShared({
        record,
        documentId: 'doc-1',
        me: linus.keys,
        from: linusFromAda.person,
        identity: linusIdentity.identity,
      }),
    ).rejects.toThrow();
    await expect(
      gracePage.openShared({
        record,
        documentId: 'doc-2',
        me: grace.keys,
        from: fromAda.person,
        identity: graceIdentity.identity,
      }),
    ).rejects.toThrow();
  });

  it('refuses a public key the server changed: the account’s signature does not cover it', async () => {
    const grace = await personFor('grace');
    const swapped = await personFor('mallory');
    const page = browser();
    expect(
      await page.checkPerson({ ...grace.keys, receivingKey: swapped.keys.receivingKey }),
    ).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('refuses keys signed by a new account signing key until the person says to go on', async () => {
    const grace = await personFor('grace');
    const page = browser();
    expect((await page.checkPerson(grace.keys)).ok).toBe(true);
    // The server swaps all of it, signature included, with keys of its own for the same person.
    const forged = await personFor('grace');
    expect(await page.checkPerson(forged.keys)).toEqual({ ok: false, reason: 'changed' });
    await page.trustChanged(forged.keys);
    expect((await page.checkPerson(forged.keys)).ok).toBe(true);
    expect(await page.checkPerson(grace.keys)).toEqual({ ok: false, reason: 'changed' });
  });

  it('refuses the person’s own keys when the server swapped them', async () => {
    const ada = await personFor('ada');
    const page = browser();
    expect((await page.identity(ada.appKey, ada.me)).ok).toBe(true);
    const forged = await personFor('ada');
    expect(await page.identity(forged.appKey, forged.me)).toEqual({ ok: false, reason: 'changed' });
  });

  it('gives a removed reader nothing of what is written after: a new document key at the next write', async () => {
    const ada = await personFor('ada');
    const grace = await personFor('grace');
    const page = browser();
    const identity = await page.identity(ada.appKey, ada.me);
    const toGrace = await page.checkPerson(grace.keys);
    if (!identity.ok || !toGrace.ok) throw new Error('refused');
    const before = page.newDocumentKey();
    const after = page.newDocumentKey();
    expect(after).not.toEqual(before);
    const kept = await page.share({
      documentKey: before,
      documentId: 'doc',
      to: toGrace.person,
      identity: identity.identity,
    });
    const gracePage = browser();
    const graceIdentity = await gracePage.identity(grace.appKey, grace.me);
    const fromAda = await gracePage.checkPerson(ada.keys);
    if (!graceIdentity.ok || !fromAda.ok) throw new Error('refused');
    // What Grace was given opens the old key only; the new one was never sealed to her.
    expect(
      await gracePage.openShared({
        record: kept,
        documentId: 'doc',
        me: grace.keys,
        from: fromAda.person,
        identity: graceIdentity.identity,
      }),
    ).toEqual(before);
  });
});
