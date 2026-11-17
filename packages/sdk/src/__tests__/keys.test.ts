import {
  memoryBackend,
  sealRelease,
  toBase64Url,
  type KeyStoreBackend,
} from '@sovereignfs/crypto/web';
import { describe, expect, it } from 'vitest';
import { appKeys } from '../keys';

const CORE = 'https://id.example';
const RETURN = 'https://notes.example/keys';
const APP_KEY = new Uint8Array(32).fill(6);
const SECRET = toBase64Url(new Uint8Array(32).fill(1));

async function accountSigner() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  };
}

/** An app's page: its address bar, its server's key secret, its storage and clock. */
function page(options: { sub?: string; backend?: KeyStoreBackend; signedIn?: boolean } = {}) {
  const bar = { hash: '', pathname: '/notes/42', search: '?tab=1', assigned: '' };
  const replaced: string[] = [];
  const clock = { now: 1_800_000_000_000 };
  const session = { sub: options.sub ?? 'ada', signedIn: options.signedIn ?? true };
  const backend = options.backend ?? memoryBackend();
  const keys = appKeys({
    core: CORE,
    clientId: 'notes',
    returnTo: RETURN,
    backend,
    now: () => clock.now,
    fetch: async () =>
      session.signedIn
        ? new Response(JSON.stringify({ sub: session.sub, secret: SECRET }), { status: 200 })
        : new Response('{}', { status: 401 }),
    location: {
      get hash() {
        return bar.hash;
      },
      pathname: bar.pathname,
      search: bar.search,
      assign: (url: string | URL) => {
        bar.assigned = String(url);
      },
    },
    history: {
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        replaced.push(String(url));
        bar.hash = '';
      },
    },
  });
  return { keys, bar, replaced, clock, session, backend };
}

/** What core's page would answer to the request the app's page made. */
async function coreAnswers(
  assigned: string,
  overrides: {
    sub?: string;
    clientId?: string;
    returnTo?: string;
    signer?: Awaited<ReturnType<typeof accountSigner>>;
    now?: number;
  } = {},
) {
  const url = new URL(assigned);
  const signer = overrides.signer ?? (await accountSigner());
  const answer = await sealRelease({
    target: {
      clientId: overrides.clientId ?? url.searchParams.get('client_id') ?? '',
      returnTo: overrides.returnTo ?? url.searchParams.get('return_to') ?? '',
      state: url.searchParams.get('state') ?? '',
    },
    request: url.searchParams.get('request') ?? '',
    appKey: APP_KEY,
    sub: overrides.sub ?? 'ada',
    signingKey: signer.privateKey,
    signingPublic: signer.publicKey,
    now: overrides.now ?? 1_800_000_000_000,
  });
  const fragment = new URLSearchParams({
    sv_key: answer.key,
    sv_sig: answer.sig,
    state: url.searchParams.get('state') ?? '',
  });
  return { hash: `#${fragment.toString()}`, signer };
}

async function rawKey(key: CryptoKey): Promise<Uint8Array> {
  // The kept key cannot be exported, so it is compared by what it does: it opens what the expected key sealed.
  const iv = new Uint8Array(12);
  const expected = await crypto.subtle.importKey('raw', APP_KEY, 'AES-GCM', false, ['encrypt']);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    expected,
    new Uint8Array([7]),
  );
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed));
}

describe('the app key in an app’s pages (sdk §9.2)', () => {
  it('is locked until released, then open for the session, and goes back where the person was', async () => {
    const app = page();
    expect(await app.keys.open()).toEqual({ state: 'locked' });
    await app.keys.unlock();
    const asked = new URL(app.bar.assigned);
    expect(`${asked.origin}${asked.pathname}`).toBe(`${CORE}/keys/release`);
    expect(asked.searchParams.get('client_id')).toBe('notes');
    expect(asked.searchParams.get('return_to')).toBe(RETURN);

    app.bar.hash = (await coreAnswers(app.bar.assigned)).hash;
    expect(await app.keys.receive()).toEqual({ ok: true, returnPath: '/notes/42?tab=1' });
    // The fragment is out of the address.
    expect(app.replaced).toEqual(['/notes/42?tab=1']);
    const opened = await app.keys.open();
    expect(opened.state).toBe('open');
    if (opened.state === 'open') expect(await rawKey(opened.key)).toEqual(new Uint8Array([7]));
  });

  it('forgets the key when the session has ended', async () => {
    const app = page();
    await app.keys.unlock();
    app.bar.hash = (await coreAnswers(app.bar.assigned)).hash;
    await app.keys.receive();
    app.session.signedIn = false;
    expect(await app.keys.open()).toEqual({ state: 'locked' });
    app.session.signedIn = true;
    expect(await app.keys.open()).toEqual({ state: 'locked' });
  });

  it('refuses an answer replayed: the request is used once', async () => {
    const app = page();
    await app.keys.unlock();
    const { hash } = await coreAnswers(app.bar.assigned);
    app.bar.hash = hash;
    expect((await app.keys.receive()).ok).toBe(true);
    app.bar.hash = hash;
    expect(await app.keys.receive()).toEqual({ ok: false, reason: 'no-request' });
  });

  it('refuses an answer on a page that did not ask', async () => {
    const asker = page();
    await asker.keys.unlock();
    const other = page();
    other.bar.hash = (await coreAnswers(asker.bar.assigned)).hash;
    expect(await other.keys.receive()).toEqual({ ok: false, reason: 'no-request' });
    expect(await other.keys.open()).toEqual({ state: 'locked' });
  });

  it('refuses an answer for another app or return address', async () => {
    for (const changed of [{ clientId: 'mail' }, { returnTo: 'https://mail.example/keys' }]) {
      const app = page();
      await app.keys.unlock();
      app.bar.hash = (await coreAnswers(app.bar.assigned, changed)).hash;
      expect(await app.keys.receive()).toEqual({ ok: false, reason: 'unopenable' });
    }
  });

  it('refuses an answer for another person than the app’s session', async () => {
    const app = page();
    await app.keys.unlock();
    app.bar.hash = (await coreAnswers(app.bar.assigned, { sub: 'grace' })).hash;
    expect(await app.keys.receive()).toEqual({ ok: false, reason: 'other-person' });
  });

  it('refuses an answer older than two minutes', async () => {
    const app = page();
    await app.keys.unlock();
    app.bar.hash = (await coreAnswers(app.bar.assigned)).hash;
    app.clock.now += 2 * 60 * 1000 + 1;
    expect(await app.keys.receive()).toEqual({ ok: false, reason: 'too-old' });
  });

  it('refuses an answer signed by another key than the person’s first, once one is remembered', async () => {
    const backend = memoryBackend();
    const first = page({ backend });
    await first.keys.unlock();
    const { hash, signer } = await coreAnswers(first.bar.assigned);
    first.bar.hash = hash;
    expect((await first.keys.receive()).ok).toBe(true);

    const later = page({ backend });
    await later.keys.unlock();
    later.bar.hash = (
      await coreAnswers(later.bar.assigned, { signer: await accountSigner() })
    ).hash;
    expect(await later.keys.receive()).toEqual({ ok: false, reason: 'signature' });
    // The remembered key still works.
    await later.keys.unlock();
    later.bar.hash = (await coreAnswers(later.bar.assigned, { signer })).hash;
    expect((await later.keys.receive()).ok).toBe(true);
  });

  it('says so when there is no answer, or no session to keep it with', async () => {
    const app = page();
    expect(await app.keys.receive()).toEqual({ ok: false, reason: 'no-answer' });
    await app.keys.unlock();
    app.bar.hash = (await coreAnswers(app.bar.assigned)).hash;
    app.session.signedIn = false;
    expect(await app.keys.receive()).toEqual({ ok: false, reason: 'no-session' });
  });
});
