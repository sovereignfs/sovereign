/**
 * An app with no core (sdk §9.5), its page and its server together: `localVault()` in the page, `vaultRoute` on the server, the vault
 * on a SQLite file. Every request the page makes is recorded, and none carries the password, the passphrase or anything that opens a
 * key; the route takes changes only from the app's own origin, and only for a session.
 */
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate, type Database } from '@sovereignfs/database';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import { memoryBackend } from '@sovereignfs/crypto/web';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localVault } from '../local-vault.js';
import {
  AppVault,
  newSessionSecret,
  VAULT_MIGRATIONS_TABLE,
  vaultMigrations,
  vaultRoute,
} from '../vault.js';

vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-sdk-local-vault.db')}`);

const ORIGIN = 'https://notes.example.org';
const PASSWORD = 'correct horse battery staple';
const PASSPHRASE = 'a passphrase nobody else knows';

let target: TestDatabase;
let db: Database;

beforeAll(async () => {
  target = await createTestDatabase();
  db = await target.open();
  await migrate(db, vaultMigrations(db.family), { table: VAULT_MIGRATIONS_TABLE });
});
afterAll(async () => {
  await db.close().catch(() => undefined);
  await target.cleanup();
});
beforeEach(async () => {
  for (const table of ['sv_key_apps', 'sv_key_wraps', 'sv_key_accounts']) {
    await db.run(`delete from ${table}`);
  }
});

/** The app's server: its session (a `sub` and the secret kept with it), the vault route, and the key-secret route. */
function app(vault: AppVault) {
  const session: { sub?: string; secret?: string } = {};
  const route = vaultRoute(vault, { origin: ORIGIN });
  const sent: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), ORIGIN);
    const request = new Request(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), origin: ORIGIN },
    });
    sent.push(`${request.method} ${url.pathname}${url.search} ${init?.body ?? ''}`);
    if (url.pathname === '/auth/key-secret') {
      return session.sub
        ? Response.json({ sub: session.sub, secret: session.secret })
        : new Response(null, { status: 401 });
    }
    return route(request, session.sub);
  };
  return { session, sent, fetch: fetch as typeof globalThis.fetch };
}

describe('an app with no core', () => {
  it('sets up at its own sign-in, opens the app key in a second browser, and sends no password anywhere', async () => {
    const vault = new AppVault(db);
    const vaultId = await vault.vaultId();
    const server = app(vault);
    const page = localVault({
      clientId: 'notes',
      vaultId,
      fetch: server.fetch,
      backend: memoryBackend(),
    });

    const derived = await page.derive(PASSWORD, 'ada@example.org');
    // The app's sign-in checks `derived.signIn` (its own better-auth, say) and opens a session with a secret kept beside it.
    Object.assign(server.session, { sub: 'user-1', secret: newSessionSecret() });
    expect(await page.afterSignIn(derived.secret)).toBe('set-up');
    const opened = await page.open();
    expect(opened.state).toBe('open');

    const elsewhere = localVault({
      clientId: 'notes',
      vaultId,
      fetch: server.fetch,
      backend: memoryBackend(),
    });
    expect((await elsewhere.open()).state).toBe('locked');
    const again = await elsewhere.derive(PASSWORD, 'ada@example.org');
    expect(await elsewhere.afterSignIn(again.secret)).toBe('unlocked');
    const second = await elsewhere.open();
    if (opened.state !== 'open' || second.state !== 'open') throw new Error('not open');
    const probe = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: probe }, opened.key, probe);
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: probe }, second.key, sealed),
    ).resolves.toBeDefined();

    const traffic = server.sent.join('\n');
    expect(traffic).not.toContain(PASSWORD);
    expect(traffic).not.toContain(derived.signIn);
    expect(traffic).not.toContain(server.session.secret);
  }, 30_000);

  it('unlocks with a passphrase when its sign-in is someone else’s, and sends no passphrase', async () => {
    const vault = new AppVault(db);
    const server = app(vault);
    const page = localVault({
      clientId: 'notes',
      vaultId: await vault.vaultId(),
      fetch: server.fetch,
      backend: memoryBackend(),
    });
    Object.assign(server.session, { sub: 'oidc|42', secret: newSessionSecret() });
    expect(await page.unlockWithPassphrase(PASSPHRASE, 'oidc|42')).toBe('set-up');
    expect((await page.open()).state).toBe('open');
    expect(server.sent.join('\n')).not.toContain(PASSPHRASE);
  }, 30_000);

  it('locks every browser when the session ends', async () => {
    const vault = new AppVault(db);
    const server = app(vault);
    const page = localVault({
      clientId: 'notes',
      vaultId: await vault.vaultId(),
      fetch: server.fetch,
      backend: memoryBackend(),
    });
    Object.assign(server.session, { sub: 'user-2', secret: newSessionSecret() });
    await page.unlockWithPassphrase(PASSPHRASE, 'user-2');
    delete server.session.sub;
    expect((await page.open()).state).toBe('locked');
    Object.assign(server.session, { sub: 'user-2', secret: newSessionSecret() });
    expect((await page.open()).state).toBe('locked');
  }, 30_000);
});

describe('vaultRoute', () => {
  const change = (origin: string | null, body: unknown) =>
    new Request(`${ORIGIN}/auth/vault`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    });
  const KIT = {
    op: 'confirm-kit',
    record: JSON.stringify({ suite: 1, nonce: 'n', ciphertext: 'c' }),
  };

  it('answers no one without a session', async () => {
    const route = vaultRoute(new AppVault(db), { origin: ORIGIN });
    expect((await route(new Request(`${ORIGIN}/auth/vault`), undefined)).status).toBe(401);
  });

  it.each([
    ['another site', 'https://evil.example'],
    ['no origin at all', null],
  ])('refuses a change from %s before reading it', async (_what, origin) => {
    const vault = new AppVault(db);
    const spy = vi.spyOn(vault, 'confirmKit');
    expect(
      (await vaultRoute(vault, { origin: ORIGIN })(change(origin, KIT), 'user-1')).status,
    ).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes the app’s public origin, not the request’s own address, which a proxy may have rewritten', async () => {
    const vault = new AppVault(db);
    const behindProxy = new Request('http://app:3000/auth/vault', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(KIT),
    });
    // Past the origin check: refused only because the person has no keys yet.
    expect((await vaultRoute(vault, { origin: ORIGIN })(behindProxy, 'user-1')).status).toBe(409);
    const asTheProxySeesIt = new Request('http://app:3000/auth/vault', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://app:3000' },
      body: JSON.stringify(KIT),
    });
    expect((await vaultRoute(vault, { origin: ORIGIN })(asTheProxySeesIt, 'user-1')).status).toBe(
      403,
    );
  });

  it('refuses a change the browser calls cross-site, whatever its origin says', async () => {
    const request = change(ORIGIN, KIT);
    request.headers.set('sec-fetch-site', 'cross-site');
    expect((await vaultRoute(new AppVault(db), { origin: ORIGIN })(request, 'user-1')).status).toBe(
      403,
    );
  });

  it('refuses what is not a change, and says why a change was refused', async () => {
    const route = vaultRoute(new AppVault(db), { origin: ORIGIN });
    expect((await route(change(ORIGIN, { op: 'drop-tables' }), 'user-1')).status).toBe(400);
    const notSetUp = await route(change(ORIGIN, KIT), 'user-1');
    expect(notSetUp.status).toBe(409);
    expect(await notSetUp.json()).toEqual({ ok: false, error: 'These keys are not set up.' });
  });
});
