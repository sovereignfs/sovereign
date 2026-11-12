import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
const ADA = 'user-ada-0000000001';
const BEN = 'user-ben-0000000002';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
let folder: string;

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let list: typeof import('../../app/api/files/route');
let one: typeof import('../../app/api/files/[id]/route');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-files-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.stubEnv('SV_STORAGE_PATH', path.join(folder, 's3', 'core'));
  vi.stubEnv('SV_STORAGE_SIGNING_KEY', 'k'.repeat(48));
  vi.stubEnv('SV_STORAGE_FILE_QUOTA', '3');
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  list = await import('../../app/api/files/route');
  one = await import('../../app/api/files/[id]/route');
});

afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const as = (id: string | undefined) =>
  getSession.mockReset().mockResolvedValue(id ? { user: { id, role: 'platform:user' } } : null);

beforeEach(async () => {
  rmSync(path.join(folder, 's3'), { recursive: true, force: true });
  await db.run('delete from users');
  for (const [id, email] of [
    [ADA, 'ada@sovereign.local'],
    [BEN, 'ben@sovereign.local'],
  ])
    await db.run(
      "insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, 'P', ?, 1, 'platform:user', 1, 1)",
      [id, email],
    );
  as(ADA);
});

const upload = (body: Uint8Array, headers: Record<string, string> = {}) =>
  list.POST(
    new Request(`${ORIGIN}/api/files`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-length': String(body.length),
        'x-file-name': encodeURIComponent('holiday photo.png'),
        ...headers,
      },
      body,
      duplex: 'half',
    } as RequestInit),
  );
const download = (id: string, query = '') =>
  one.GET(new Request(`${ORIGIN}/api/files/${id}${query}`), { params: Promise.resolve({ id }) });
const remove = (id: string, headers: Record<string, string> = { origin: ORIGIN }) =>
  one.DELETE(new Request(`${ORIGIN}/api/files/${id}`, { method: 'DELETE', headers }), {
    params: Promise.resolve({ id }),
  });

describe('core’s files', () => {
  it('keeps a file for the person, lists it with their usage, and serves it back to them', async () => {
    const reply = await upload(PNG);
    expect(reply.status).toBe(201);
    const record = (await reply.json()) as { id: string; name: string; type: string; url: string };
    expect(record).toMatchObject({ name: 'holiday photo.png', type: 'image/png' });
    expect(record.url).toBe(`/api/files/${record.id}`);
    expect(existsSync(path.join(folder, 's3', 'core', ADA, record.id))).toBe(true);

    const listed = (await (await list.GET()).json()) as {
      files: { id: string }[];
      usage: { bytes: number; files: number; quota: { files: number } };
    };
    expect(listed.files.map((f) => f.id)).toEqual([record.id]);
    expect(listed.usage).toMatchObject({ bytes: PNG.length, files: 1, quota: { files: 3 } });

    const served = await download(record.id);
    expect(served.status).toBe(200);
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(Buffer.from(PNG));
  });

  it('serves no one else’s file, and deletes only the person’s own', async () => {
    const { id } = (await (await upload(PNG)).json()) as { id: string };
    as(BEN);
    expect((await download(id)).status).toBe(404);
    expect((await remove(id)).status).toBe(404);
    as(ADA);
    expect((await remove(id)).status).toBe(204);
    expect((await download(id)).status).toBe(404);
  });

  it('needs a session, and a request from core’s own pages to change anything', async () => {
    as(undefined);
    expect((await list.GET()).status).toBe(401);
    expect((await upload(PNG)).status).toBe(401);
    as(ADA);
    expect((await upload(PNG, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('serves a file through a signed address without a session, until it runs out or is tampered with', async () => {
    const { id } = (await (await upload(PNG)).json()) as { id: string };
    const { getFileStore } = await import('../files');
    const query = getFileStore().signedQuery(ADA, id, 60);
    as(undefined);
    expect((await download(id, `?${query}`)).status).toBe(200);
    query.set('u', BEN);
    expect((await download(id, `?${query}`)).status).toBe(403);
  });

  it('asks for the length, refuses more than 100 MB, and refuses past the quota with a message', async () => {
    const noLength = await list.POST(
      new Request(`${ORIGIN}/api/files`, {
        method: 'POST',
        headers: { origin: ORIGIN },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(PNG);
            controller.close();
          },
        }),
        duplex: 'half',
      } as RequestInit),
    );
    expect(noLength.status).toBe(411);
    const huge = await upload(PNG, { 'content-length': String(101 * 1024 * 1024) });
    expect(huge.status).toBe(413);
    for (let i = 0; i < 3; i += 1) expect((await upload(PNG)).status).toBe(201);
    const over = await upload(PNG);
    expect(over.status).toBe(507);
    expect(((await over.json()) as { error: string }).error).toBe('over_quota');
  });

  it('deletes a person’s files with their account', async () => {
    await upload(PNG);
    const { getAccountManager } = await import('../accounts');
    await (await getAccountManager()).deleteSelf({ id: ADA } as never);
    expect(existsSync(path.join(folder, 's3', 'core', ADA))).toBe(false);
  });
});
