import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { png } from './image-fixtures';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let consoleRoute: typeof import('../../app/api/console/branding/[kind]/route');
let publicRoute: typeof import('../../app/api/branding/[kind]/route');

const OWNER = { user: { id: 'owner-1', role: 'platform:owner' } };
const ADMIN = { user: { id: 'admin-1', role: 'platform:admin' } };
const PERSON = { user: { id: 'person-1', role: 'platform:user' } };

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-branding-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  consoleRoute = await import('../../app/api/console/branding/[kind]/route');
  publicRoute = await import('../../app/api/branding/[kind]/route');
});

afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.run('delete from instance_images');
  await db.run('delete from capability_overrides');
  getSession.mockReset().mockResolvedValue(ADMIN);
  (await import('../roles/matrix')).invalidateCapabilityMatrix();
});

const context = (kind: string) => ({ params: Promise.resolve({ kind }) });
const post = (kind: string, input: Buffer | null, headers: Record<string, string> = {}) =>
  consoleRoute.POST(
    new Request(`${ORIGIN}/api/console/branding/${kind}`, {
      method: 'POST',
      headers: { origin: ORIGIN, ...headers },
      body: input ? new Uint8Array(input) : null,
    }),
    context(kind),
  );
const del = (kind: string, headers: Record<string, string> = { origin: ORIGIN }) =>
  consoleRoute.DELETE(
    new Request(`${ORIGIN}/api/console/branding/${kind}`, { method: 'DELETE', headers }),
    context(kind),
  );
const get = (kind: string, headers: Record<string, string> = {}) =>
  publicRoute.GET(new Request(`${ORIGIN}/api/branding/${kind}`, { headers }), context(kind));
const stored = async () =>
  Number((await db.run('select count(*) as n from instance_images')).rows[0]?.n);

describe('setting a picture', () => {
  it('keeps it and answers with where it is served', async () => {
    const reply = await post('logo-light', png(32, 32));
    expect(reply.status).toBe(200);
    const { image } = (await reply.json()) as { image: string };
    expect(image).toMatch(/^\/api\/branding\/logo-light\?v=[0-9a-f]{16}$/);
    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(await stored()).toBe(1);
  });

  it('serves an SVG back with its script and handlers gone', async () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4" onload="x()"><script>x()</script><rect width="4" height="4"/></svg>';
    expect((await post('favicon', Buffer.from(dirty))).status).toBe(200);
    const reply = await get('favicon');
    expect(reply.headers.get('content-type')).toBe('image/svg+xml');
    const text = await reply.text();
    expect(text).toContain('<rect');
    expect(text).not.toMatch(/script|onload|x\(\)/i);
  });

  it.each([
    ['nothing', Buffer.alloc(0), 400, 'empty'],
    ['a text file called a picture', Buffer.from('not a picture'), 400, 'unsupported'],
    [
      'an SVG that is not a picture',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><x'),
      400,
      'bad-svg',
    ],
    ['a picture cut short', png(64, 64).subarray(0, 20), 400, 'corrupt'],
  ])('refuses %s, and keeps nothing', async (_name, bytes, status, code) => {
    const reply = await post('logo-dark', bytes);
    expect(reply.status).toBe(status);
    expect((await reply.json()) as { error: string }).toMatchObject({ error: code });
    expect(await stored()).toBe(0);
  });

  it('refuses more than 1 MB by the length it declares', async () => {
    const reply = await post('logo-dark', png(8, 8), {
      'content-length': String(2 * 1024 * 1024),
    });
    expect(reply.status).toBe(413);
    expect(await stored()).toBe(0);
  });

  it('knows only the three pictures', async () => {
    for (const kind of ['banner', '..%2Fetc', 'Logo-Light', '']) {
      expect((await post(kind, png(8, 8))).status).toBe(404);
    }
    expect(await stored()).toBe(0);
  });

  describe('is refused', () => {
    it.each([
      ['with no Origin', {}],
      ['from another site', { origin: 'https://evil.example' }],
      ['from a site that only looks like core', { origin: 'http://localhost:3000.evil.example' }],
    ])('when it comes %s', async (_name, headers) => {
      const reply = await consoleRoute.POST(
        new Request(`${ORIGIN}/api/console/branding/favicon`, {
          method: 'POST',
          headers,
          body: new Uint8Array(png(8, 8)),
        }),
        context('favicon'),
      );
      expect(reply.status).toBe(403);
      expect(await stored()).toBe(0);
    });

    it('with nobody signed in', async () => {
      getSession.mockResolvedValue(null);
      expect((await post('favicon', png(8, 8))).status).toBe(401);
      expect(await stored()).toBe(0);
    });

    it('for an ordinary person', async () => {
      getSession.mockResolvedValue(PERSON);
      expect((await post('favicon', png(8, 8))).status).toBe(403);
      expect(await stored()).toBe(0);
    });

    it('for an admin once the owner has taken instance:configure from admins', async () => {
      expect((await post('favicon', png(8, 8))).status).toBe(200);
      const { changeCapabilities } = await import('../roles/configure');
      const { invalidateCapabilityMatrix } = await import('../roles/matrix');
      await changeCapabilities(db, { id: 'owner-1', role: 'platform:owner' }, [
        { role: 'platform:admin', capability: 'instance:configure', granted: false },
      ]);
      invalidateCapabilityMatrix();
      expect((await post('logo-light', png(8, 8))).status).toBe(403);
      expect(await stored()).toBe(1);
    });
  });

  it('lets the owner set one', async () => {
    getSession.mockResolvedValue(OWNER);
    expect((await post('logo-dark', png(8, 8))).status).toBe(200);
  });
});

describe('removing a picture', () => {
  it('deletes it, and is fine when there was none', async () => {
    await post('favicon', png(8, 8));
    const reply = await del('favicon');
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ image: null });
    expect(await stored()).toBe(0);
    expect((await del('favicon')).status).toBe(200);
  });

  it('is refused from another site, for nobody signed in, and for an ordinary person', async () => {
    await post('favicon', png(8, 8));
    expect((await del('favicon', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await del('favicon', {})).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await del('favicon')).status).toBe(401);
    getSession.mockResolvedValue(PERSON);
    expect((await del('favicon')).status).toBe(403);
    expect(await stored()).toBe(1);
  });

  it('knows only the three pictures', async () => {
    expect((await del('banner')).status).toBe(404);
  });
});

describe('serving a picture', () => {
  it('serves the stored bytes as the kind they are, with nosniff, an ETag and a long cache', async () => {
    const bytes = png(40, 40);
    await post('logo-light', bytes);
    getSession.mockResolvedValue(null);
    const reply = await get('logo-light');
    expect(reply.status).toBe(200);
    expect(Buffer.from(await reply.arrayBuffer()).equals(bytes)).toBe(true);
    expect(reply.headers.get('content-type')).toBe('image/png');
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
    expect(reply.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(reply.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(reply.headers.get('etag')).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it('needs no session: it is for pages, emails and apps that have none', async () => {
    await post('favicon', png(8, 8));
    getSession.mockReset().mockResolvedValue(null);
    expect((await get('favicon')).status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('answers a matching ETag with 304 and no body', async () => {
    await post('favicon', png(8, 8));
    const etag = (await get('favicon')).headers.get('etag') as string;
    const reply = await get('favicon', { 'if-none-match': etag });
    expect(reply.status).toBe(304);
    expect(await reply.text()).toBe('');
  });

  it('serves a new picture under a new ETag', async () => {
    await post('favicon', png(8, 8));
    const before = (await get('favicon')).headers.get('etag');
    await post('favicon', png(16, 16));
    expect((await get('favicon')).headers.get('etag')).not.toBe(before);
  });

  it('is not found when nothing was set, and not cached as such', async () => {
    const reply = await get('logo-dark');
    expect(reply.status).toBe(404);
    expect(reply.headers.get('cache-control')).toBe('no-store');
  });

  it('is not found for anything but the three pictures', async () => {
    for (const kind of ['banner', '../etc/passwd', 'avatars']) {
      expect((await get(kind)).status).toBe(404);
    }
  });
});
