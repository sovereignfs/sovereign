import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { brandingDocument, SERVED_API } from '../instance/branding-document';
import { PLAIN_IDENTITY } from '../instance/identity';
import { expectMatchesContract } from './core-api-contract';
import { png } from './image-fixtures';

describe('the branding document', () => {
  it('is plain when nothing is set, and matches the contract', () => {
    const document = brandingDocument(PLAIN_IDENTITY, 'https://core.example.com');
    expect(document).toEqual({
      name: 'Sovereign',
      url: 'https://core.example.com',
      logo: { light: null, dark: null },
      favicon: null,
      api: { versions: ['v1'], capabilities: ['directory'] },
    });
    expectMatchesContract('getInstanceBranding', 200, document);
  });

  it('says what this core serves, which an app reads to tell a missing capability from a failure', () => {
    const { api } = brandingDocument(PLAIN_IDENTITY, 'https://core.example.com');
    expect(api).toEqual(SERVED_API);
    // Every capability named is one the contract describes, so the list cannot promise what is not there.
    expect(api.capabilities).toEqual(['directory']);
  });

  it('gives the pictures as absolute addresses on the instance, versions and all', () => {
    const document = brandingDocument(
      {
        ...PLAIN_IDENTITY,
        name: 'Acme',
        logoLight: '/api/branding/logo-light?v=abc',
        logoDark: '/api/branding/logo-dark?v=def',
        favicon: '/api/branding/favicon?v=123',
      },
      'https://core.example.com',
    );
    expect(document.logo).toEqual({
      light: 'https://core.example.com/api/branding/logo-light?v=abc',
      dark: 'https://core.example.com/api/branding/logo-dark?v=def',
    });
    expect(document.favicon).toBe('https://core.example.com/api/branding/favicon?v=123');
    expectMatchesContract('getInstanceBranding', 200, document);
  });

  it('gives the instance’s own origin as its address, whatever path the configured address had', () => {
    expect(brandingDocument(PLAIN_IDENTITY, 'https://core.example.com/ignored').url).toBe(
      'https://core.example.com',
    );
  });
});

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;
const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let route: typeof import('../../app/.well-known/sovereign-instance/route');
let manager: import('../instance/manage').InstanceManager;

describe('the branding endpoint', () => {
  beforeAll(async () => {
    folder = mkdtempSync(path.join(tmpdir(), 'sv-branding-doc-'));
    vi.stubEnv('SV_URL', ORIGIN);
    vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
    vi.stubEnv('SV_DB_DIALECT', 'sqlite');
    vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
    vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { migrateDatabaseOrExit } = await import('../startup');
    await migrateDatabaseOrExit();
    db = await (await import('../database')).getDatabase();
    route = await import('../../app/.well-known/sovereign-instance/route');
    manager = await (await import('../instance/service')).getInstanceManager();
  });
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.run('delete from instance_images');
    await db.run('delete from instance_settings');
    getSession.mockReset().mockResolvedValue(null);
  });

  const get = (headers: Record<string, string> = {}) =>
    route.GET(new Request(`${ORIGIN}/.well-known/sovereign-instance`, { headers }));
  const owner = { id: 'owner-1', role: 'platform:owner' };

  it('answers with the document the contract describes, with no session', async () => {
    const reply = await get();
    expect(reply.status).toBe(200);
    expect(reply.headers.get('content-type')).toBe('application/json');
    const body = (await reply.json()) as unknown;
    expectMatchesContract('getInstanceBranding', 200, body);
    expect(body).toMatchObject({ name: 'Sovereign', url: ORIGIN });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('shows a change made in the Console at once, with no restart: the name, then a picture', async () => {
    await manager.saveName(owner, 'Acme Co');
    expect(((await (await get()).json()) as { name: string }).name).toBe('Acme Co');

    const picture = await manager.setImage(owner, 'logo-light', png(16, 16));
    await manager.setImage(owner, 'favicon', png(8, 8));
    const body = (await (await get()).json()) as {
      logo: { light: string; dark: string };
      favicon: string;
    };
    expect(body.logo.light).toBe(`${ORIGIN}${picture.path}`);
    // One logo is given for both light and dark pages.
    expect(body.logo.dark).toBe(`${ORIGIN}${picture.path}`);
    expect(body.favicon).toMatch(new RegExp(`^${ORIGIN}/api/branding/favicon\\?v=[0-9a-f]{16}$`));
    expectMatchesContract('getInstanceBranding', 200, body);

    await manager.removeImage(owner, 'logo-light');
    await manager.resetName(owner);
    const after = (await (await get()).json()) as { name: string; logo: { light: unknown } };
    expect(after).toMatchObject({ name: 'Sovereign', logo: { light: null } });
  });

  it('gives a changed picture a new address, so what an app cached is not stale', async () => {
    await manager.setImage(owner, 'favicon', png(8, 8));
    const before = ((await (await get()).json()) as { favicon: string }).favicon;
    await manager.setImage(owner, 'favicon', png(16, 16));
    const after = ((await (await get()).json()) as { favicon: string }).favicon;
    expect(after).not.toBe(before);
  });

  it('is public and readable from any origin, and says it is always to be revalidated', async () => {
    const reply = await get();
    expect(reply.headers.get('access-control-allow-origin')).toBe('*');
    expect(reply.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers a matching ETag with 304 and no body, and a changed answer with a new ETag', async () => {
    const first = await get();
    const etag = first.headers.get('etag') as string;
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    const again = await get({ 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('access-control-allow-origin')).toBe('*');
    await manager.saveName(owner, 'Changed');
    const changed = await get({ 'if-none-match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });
});
