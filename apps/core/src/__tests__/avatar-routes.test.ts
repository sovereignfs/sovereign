import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JPEG_1X1, png } from './image-fixtures';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
const ID = 'user-1234567890';
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let avatarRoute: typeof import('../../app/api/avatars/[userId]/route');
let profileRoute: typeof import('../../app/api/profile/avatar/route');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-avatar-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_AUTH_TRUSTED_ORIGINS', 'https://app.sovereign.local');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  avatarRoute = await import('../../app/api/avatars/[userId]/route');
  profileRoute = await import('../../app/api/profile/avatar/route');
});

afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.run('delete from avatars');
  await db.run('delete from users');
  await db.run(
    "insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, 'Ada', 'ada@sovereign.local', 1, 'platform:user', 1, 1)",
    [ID],
  );
  getSession.mockReset().mockResolvedValue({ user: { id: ID, role: 'platform:user' } });
});

const post = (
  input: Buffer | Uint8Array | ReadableStream | null,
  headers: Record<string, string> = {},
) => {
  const body = Buffer.isBuffer(input) ? new Uint8Array(input) : input;
  return profileRoute.POST(
    new Request(`${ORIGIN}/api/profile/avatar`, {
      method: 'POST',
      headers: { origin: ORIGIN, ...headers },
      body,
      ...(body ? { duplex: 'half' } : {}),
    } as RequestInit),
  );
};
const del = (headers: Record<string, string> = { origin: ORIGIN }) =>
  profileRoute.DELETE(new Request(`${ORIGIN}/api/profile/avatar`, { method: 'DELETE', headers }));
const get = (id: string, headers: Record<string, string> = {}) =>
  avatarRoute.GET(new Request(`${ORIGIN}/api/avatars/${id}`, { headers }), {
    params: Promise.resolve({ userId: id }),
  });
const imageOf = async () =>
  (await db.run('select image from users where id = ?', [ID])).rows[0]?.image;

describe('uploading a picture', () => {
  it('keeps it, names it on the account, and answers with where it is', async () => {
    const reply = await post(png(64, 64));
    expect(reply.status).toBe(200);
    const { image } = (await reply.json()) as { image: string };
    expect(image).toMatch(new RegExp(`^/api/avatars/${ID}\\?v=[0-9a-f]{16}$`));
    expect(await imageOf()).toBe(image);
  });

  it('takes a JPEG as well, and a new picture replaces the old one at a new address', async () => {
    const first = ((await (await post(png(64, 64))).json()) as { image: string }).image;
    const second = ((await (await post(JPEG_1X1)).json()) as { image: string }).image;
    expect(second).not.toBe(first);
    expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(1);
    expect(await imageOf()).toBe(second);
  });

  it('clears the session cache cookie under every name, so the page shows the new picture', async () => {
    const reply = await post(png(32, 32));
    const lines = reply.headers.getSetCookie();
    const cookies = lines.join('\n');
    expect(cookies).toContain('better-auth.session_data=;');
    expect(cookies).toContain('__Secure-better-auth.session_data=;');
    expect(cookies).toContain('__Host-better-auth.session_data=;');
    expect(cookies).toMatch(/Max-Age=0/i);
    // A browser ignores the removal of a prefixed cookie unless it meets the prefix: Secure, and for __Host- no Domain.
    for (const line of lines.filter((l) => l.startsWith('__'))) {
      expect(line, line).toMatch(/;\s*Secure/i);
    }
    expect(lines.find((l) => l.startsWith('__Host-')) ?? '').not.toMatch(/Domain=/i);
    expect(reply.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['nothing', Buffer.alloc(0), 400, 'empty'],
    [
      'an SVG, which can carry script',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      400,
      'svg',
    ],
    ['a text file called a picture', Buffer.from('not a picture'), 400, 'unsupported'],
    ['a GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1'), 400, 'unsupported'],
    ['a picture cut short', png(64, 64).subarray(0, 20), 400, 'corrupt'],
    ['a picture of absurd size', png(5000, 8), 400, 'too-big'],
  ])('refuses %s, and keeps nothing', async (_name, bytes, status, code) => {
    const reply = await post(new Uint8Array(bytes));
    expect(reply.status).toBe(status);
    expect((await reply.json()) as { error: string }).toMatchObject({ error: code });
    expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(0);
    expect(await imageOf()).toBeNull();
  });

  it('believes the bytes, not what the request says they are', async () => {
    const reply = await post(new Uint8Array(Buffer.from('<svg/>')), {
      'content-type': 'image/png',
    });
    expect(reply.status).toBe(400);
    const real = await post(new Uint8Array(png(16, 16)), { 'content-type': 'text/plain' });
    expect(real.status).toBe(200);
  });

  it('refuses more than 1 MB, by the length it declares before reading any of it', async () => {
    const reply = await post(new Uint8Array(png(8, 8)), {
      'content-length': String(2 * 1024 * 1024),
    });
    expect(reply.status).toBe(413);
  });

  it('refuses more than 1 MB that was not declared, as soon as it is known', async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 256 * 1024;
        controller.enqueue(new Uint8Array(256 * 1024));
        if (sent >= 64 * 1024 * 1024) controller.close();
      },
    });
    const reply = await post(stream);
    expect(reply.status).toBe(413);
    expect(sent).toBeLessThan(8 * 1024 * 1024);
  });

  it('is for the person it checked, never for one named in the request', async () => {
    await db.run(
      "insert into users (id, name, email, email_verified, role, created_at, updated_at) values ('someone-else-99', 'Eve', 'eve@sovereign.local', 1, 'platform:user', 1, 1)",
    );
    await post(png(16, 16), { 'x-user-id': 'someone-else-99' });
    expect((await db.run('select user_id from avatars')).rows.map((row) => row.user_id)).toEqual([
      ID,
    ]);
  });

  describe('is refused', () => {
    it.each([
      ['with no Origin', {}],
      ['from another site', { origin: 'https://evil.example' }],
      ['from a site that only looks like core', { origin: 'http://localhost:3000.evil.example' }],
    ])('when it comes %s', async (_name, headers) => {
      const reply = await profileRoute.POST(
        new Request(`${ORIGIN}/api/profile/avatar`, {
          method: 'POST',
          headers,
          body: new Uint8Array(png(8, 8)),
        }),
      );
      expect(reply.status).toBe(403);
      expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(0);
    });

    it('from an origin the operator trusts, it is accepted', async () => {
      expect(
        (await post(new Uint8Array(png(8, 8)), { origin: 'https://app.sovereign.local' })).status,
      ).toBe(200);
    });

    it('with nobody signed in', async () => {
      getSession.mockResolvedValue(null);
      const reply = await post(new Uint8Array(png(8, 8)));
      expect(reply.status).toBe(401);
      expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(0);
    });

    it('for a role that does not hold profile:manage', async () => {
      getSession.mockResolvedValue({ user: { id: ID, role: 'platform:superuser' } });
      expect((await post(new Uint8Array(png(8, 8)))).status).toBe(403);
    });
  });
});

describe('removing a picture', () => {
  it('deletes it and clears the account’s image', async () => {
    await post(png(16, 16));
    const reply = await del();
    expect(reply.status).toBe(200);
    expect(await imageOf()).toBeNull();
    expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(0);
  });

  it('is fine when there was none', async () => {
    expect((await del()).status).toBe(200);
  });

  it('is refused from another site, and for nobody signed in', async () => {
    await post(png(16, 16));
    expect((await del({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await del({})).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
    expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(1);
  });
});

describe('serving a picture', () => {
  it('serves the stored bytes as the kind they are, with nosniff, an ETag and a long cache', async () => {
    const bytes = png(40, 40);
    await post(new Uint8Array(bytes));
    const reply = await get(ID);
    expect(reply.status).toBe(200);
    expect(Buffer.from(await reply.arrayBuffer()).equals(bytes)).toBe(true);
    expect(reply.headers.get('content-type')).toBe('image/png');
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
    expect(reply.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(reply.headers.get('etag')).toMatch(/^"[0-9a-f]{16}"$/);
    expect(reply.headers.get('content-length')).toBe(String(bytes.length));
    expect(reply.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('is public: it needs no session', async () => {
    await post(png(16, 16));
    getSession.mockResolvedValue(null);
    expect((await get(ID)).status).toBe(200);
  });

  it('answers a revalidation with 304 and no body', async () => {
    await post(png(16, 16));
    const etag = (await get(ID)).headers.get('etag') ?? '';
    const reply = await get(ID, { 'if-none-match': etag });
    expect(reply.status).toBe(304);
    expect(await reply.text()).toBe('');
  });

  it('changes its ETag when the picture changes', async () => {
    await post(png(16, 16));
    const before = (await get(ID)).headers.get('etag');
    await post(new Uint8Array(JPEG_1X1));
    expect((await get(ID)).headers.get('etag')).not.toBe(before);
  });

  it.each(['nobody-here-1234', 'short', '../../etc/passwd', 'a'.repeat(200), 'has space 12345'])(
    'has nothing at %j',
    async (id) => {
      expect((await get(id)).status).toBe(404);
    },
  );

  it('is not shown for a deactivated account', async () => {
    await post(png(16, 16));
    await db.run('update users set deactivated_at = 1 where id = ?', [ID]);
    expect((await get(ID)).status).toBe(404);
  });

  it('goes with the account', async () => {
    await post(png(16, 16));
    await db.run('delete from users where id = ?', [ID]);
    expect((await db.run('select count(*) as n from avatars')).rows[0]?.n).toBe(0);
  });
});
