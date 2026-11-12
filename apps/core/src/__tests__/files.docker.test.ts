/**
 * People's files against the real core image, over real HTTP (core-app §4.6): a person signs in and keeps a file of 60 MB, which crosses
 * core's proxy whole (it copies a body into memory and used to keep only 10 MB of it), gets exactly those bytes back, and a part of
 * them by `Range`. The quota refuses with words a person can act on, someone not signed in and a request from another site are
 * turned away, the Files page lists what is kept, and the files are still there when the container is made again over the same volumes,
 * which are mounted as the sqld and PostgreSQL compose setups mount them: the database and the folder of files apart. It builds the
 * image unless `SV_TEST_CORE_IMAGE` names one, and skips itself when Docker is down.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const NAME = 'sv-test-core-files';
const DATA = 'sv-test-core-files-data';
const FILES = 'sv-test-core-files-files';
const runnable =
  docker('version', '--format', '{{.Server.Version}}').status === 0 &&
  docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .every((name) => name !== NAME);

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe.skipIf(!runnable)('people’s files against the real core image', () => {
  let base = '';
  let cookie = '';
  let image = '';
  const kept: { id: string; hash: string; size: number }[] = [];
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(2000),
  ]);

  const start = (port: number) => {
    const ran = docker(
      'run',
      '--detach',
      '--name',
      NAME,
      '--publish',
      `127.0.0.1:${port}:3000`,
      '--volume',
      `${DATA}:/data`,
      '--volume',
      `${FILES}:/data/s3/core`,
      '--env',
      `SV_URL=http://localhost:${port}`,
      '--env',
      `SV_AUTH_SECRET=${'s'.repeat(48)}`,
      '--env',
      'SV_DB_DIALECT=sqlite',
      '--env',
      'SV_SQLITE_URL=file:/data/core.db',
      '--env',
      'SV_ENVIRONMENT=development',
      '--env',
      'SV_AUTH_REQUIRE_EMAIL_VERIFICATION=false',
      '--env',
      'SV_STORAGE_FILE_QUOTA=5',
      image,
    );
    if (ran.status !== 0) throw new Error(ran.stderr);
  };

  async function healthy() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        if ((await fetch(`${base}/api/health`)).status === 200) return;
      } catch {
        // not up yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`core did not come up:\n${docker('logs', NAME).stderr}`);
  }

  async function signIn(): Promise<string> {
    const seeded = docker('exec', NAME, 'sovereign-admin', 'seed', '--local', '--json');
    expect(seeded.status, seeded.stderr).toBe(0);
    const account = (
      JSON.parse(seeded.stdout.trim().split('\n').pop() as string) as {
        accounts: { created: { email: string; password: string }[] };
      }
    ).accounts.created.find((entry) => entry.email.startsWith('user@'));
    const reply = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: account?.email, password: account?.password }),
    });
    expect(reply.status).toBe(200);
    return reply.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ');
  }

  const upload = (body: Uint8Array, name: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/files`, {
      method: 'POST',
      headers: {
        origin: base,
        cookie,
        'x-file-name': encodeURIComponent(name),
        'content-length': String(body.length),
        ...headers,
      },
      body: body as unknown as BodyInit,
    });
  const get = (id: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/files/${id}`, { headers: { cookie, ...headers } });

  beforeAll(async () => {
    image = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
    if (!process.env.SV_TEST_CORE_IMAGE)
      execFileSync('docker', ['build', '--tag', image, root], { stdio: 'inherit' });
    const port = await freePort();
    base = `http://localhost:${port}`;
    start(port);
    await healthy();
    cookie = await signIn();
  }, 20 * 60_000);
  afterAll(() => {
    docker('rm', '--force', NAME);
    docker('volume', 'rm', '--force', DATA, FILES);
  });

  it('keeps a small image, and shows it back as an image', async () => {
    const reply = await upload(PNG, 'holiday photo.png');
    expect(reply.status).toBe(201);
    const record = (await reply.json()) as { id: string; name: string; type: string };
    expect(record).toMatchObject({ name: 'holiday photo.png', type: 'image/png' });
    kept.push({ id: record.id, hash: sha(PNG), size: PNG.length });
    const served = await get(record.id);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(sha(new Uint8Array(await served.arrayBuffer()))).toBe(kept[0]?.hash);
  });

  it('keeps a file of 60 MB whole across the proxy, and gives back exactly those bytes and any part of them', async () => {
    const big = randomBytes(60 * 1024 * 1024);
    const reply = await upload(big, 'archive.bin');
    expect(reply.status, await reply.clone().text()).toBe(201);
    const { id } = (await reply.json()) as { id: string };
    kept.push({ id, hash: sha(big), size: big.length });

    const served = await get(id);
    expect(served.headers.get('content-type')).toBe('application/octet-stream');
    expect(served.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(sha(new Uint8Array(await served.arrayBuffer()))).toBe(sha(big));

    const part = await get(id, { range: 'bytes=1000-1999' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 1000-1999/${big.length}`);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(big.subarray(1000, 2000));
    expect((await get(id, { range: `bytes=${big.length + 5}-` })).status).toBe(416);
  }, 300_000);

  it('lists them with the person’s usage, and the Files page shows them', async () => {
    const listed = (await (await fetch(`${base}/api/files`, { headers: { cookie } })).json()) as {
      files: { id: string }[];
      usage: { bytes: number; files: number; quota: { files: number } };
    };
    expect(listed.files.map((file) => file.id).sort()).toEqual(kept.map((file) => file.id).sort());
    expect(listed.usage).toMatchObject({
      files: 2,
      bytes: kept.reduce((sum, file) => sum + file.size, 0),
      quota: { files: 5 },
    });
    const page = await fetch(`${base}/files`, { headers: { cookie } });
    expect(page.status).toBe(200);
    // React writes a comment between the text it joins (`2<!-- --> of <!-- -->5`).
    const html = (await page.text()).replaceAll('<!-- -->', '');
    expect(html).toContain('holiday photo.png');
    expect(html).toContain('archive.bin');
    expect(html).toContain('2 of 5 files');
  });

  it('turns away someone who is not signed in, and a request from another site that carries the cookie', async () => {
    // Core's proxy sends a request with no session cookie to sign in (a 303), before any route is asked; nothing is read.
    for (const address of ['/api/files', `/api/files/${kept[0]?.id}`]) {
      const refused = await fetch(`${base}${address}`, { redirect: 'manual' });
      expect(refused.status, address).toBe(303);
      expect(refused.headers.get('location'), address).toContain('/sign-in');
    }
    const forged = await upload(PNG, 'x.png', { origin: 'https://evil.example' });
    expect(forged.status).toBe(403);
  });

  it('refuses past the quota in words a person can act on, and keeps nothing of the refused file', async () => {
    for (let n = 0; n < 3; n += 1) expect((await upload(PNG, `p${n}.png`)).status).toBe(201);
    const over = await upload(PNG, 'one-too-many.png');
    expect(over.status).toBe(507);
    expect(await over.json()).toMatchObject({ error: 'over_quota' });
    const after = (await (await fetch(`${base}/api/files`, { headers: { cookie } })).json()) as {
      usage: { files: number };
    };
    expect(after.usage.files).toBe(5);
  });

  it('are still there when the container is made again over the same volumes, as a redeployment does', async () => {
    const port = Number(new URL(base).port);
    docker('rm', '--force', NAME);
    start(port);
    await healthy();
    for (const file of kept) {
      const served = await get(file.id);
      expect(served.status, file.id).toBe(200);
      expect(sha(new Uint8Array(await served.arrayBuffer())), file.id).toBe(file.hash);
    }
    // The folder is the image's user's, in a volume of its own.
    const owner = docker('exec', NAME, 'sh', '-c', 'stat -c %U /data/s3/core; id -un');
    expect(owner.stdout.trim().split('\n')).toEqual(['node', 'node']);
  }, 180_000);

  it('deletes a file and gives its space back, and a deleted file is not found', async () => {
    const big = kept[1] as { id: string; size: number };
    const removed = await fetch(`${base}/api/files/${big.id}`, {
      method: 'DELETE',
      headers: { cookie, origin: base },
    });
    expect(removed.status).toBe(204);
    expect((await get(big.id)).status).toBe(404);
    const listed = (await (await fetch(`${base}/api/files`, { headers: { cookie } })).json()) as {
      usage: { files: number; bytes: number };
    };
    expect(listed.usage.files).toBe(4);
    expect(listed.usage.bytes).toBeLessThan(10 * 1024 * 1024);
  });
});
