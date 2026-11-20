/**
 * Exports against a real database (core-app §4.7): the jobs, one at a time and downloaded once, and an owner's export made end to end.
 * Run by `exports.test.ts` on a SQLite file and by `exports.db.test.ts` on whichever dialect the CI leg started.
 */
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { decryptWith, readExport } from '@sovereignfs/export';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { ExportBusyError, ExportJobs, KEPT_MS } from '../exports/jobs';
import { exportsFolder, makeExport, removeExportFiles } from '../exports/make';
import { addAppParts } from '../exports/apps';
import { ExportWriter } from '@sovereignfs/export';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function exportsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let clock = 1_761_580_000_000;
  let root: string;
  const pg = () => db.family === 'postgres';

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of [
      'export_jobs',
      'two_factors',
      'accounts',
      'notifications',
      'oauth_consents',
      'oauth_clients',
      'users',
    ])
      await db.run(`delete from ${table}`);
    root = await mkdtemp(path.join(tmpdir(), 'sv-exports-'));
    return () => rm(root, { recursive: true, force: true });
  });

  const jobs = () => new ExportJobs(db, () => clock);

  async function person(id: string, email: string) {
    const time = pg() ? new Date(clock) : clock;
    await db.run(
      "insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, 'platform:user', ?, ?)",
      [id, id, email, pg() ? true : 1, time, time],
    );
  }

  describe('jobs', () => {
    it('makes one at a time for the instance and for each person', async () => {
      await jobs().request({ kind: 'instance', sessionId: 's1', archive: 'tar.age' });
      await expect(
        jobs().request({ kind: 'instance', sessionId: 's2', archive: 'tar.age' }),
      ).rejects.toBeInstanceOf(ExportBusyError);
      await jobs().request({ kind: 'person', sub: 'a', sessionId: 's1', archive: 'zip' });
      await jobs().request({ kind: 'person', sub: 'b', sessionId: 's2', archive: 'zip' });
      await expect(
        jobs().request({ kind: 'person', sub: 'a', sessionId: 's3', archive: 'zip' }),
      ).rejects.toBeInstanceOf(ExportBusyError);
    });

    it('is claimed by one maker, and again only once its lease has run out', async () => {
      const { job } = await jobs().request({
        kind: 'instance',
        sessionId: 's1',
        archive: 'tar.age',
      });
      expect((await jobs().claim())?.id).toBe(job.id);
      expect(await jobs().claim()).toBeUndefined();
      clock += 11 * 60 * 1000;
      expect((await jobs().claim())?.id).toBe(job.id);
    });

    it('is handed over once, to the session that asked, for its owner, within the hour', async () => {
      const { job } = await jobs().request({
        kind: 'person',
        sub: 'a',
        sessionId: 's1',
        archive: 'zip',
      });
      await jobs().claim();
      await jobs().finish(job.id, `${job.id}.zip`, 10);
      expect(
        await jobs().take({ id: job.id, kind: 'person', sub: 'a', sessionId: 'other' }),
      ).toBeUndefined();
      expect(
        await jobs().take({ id: job.id, kind: 'person', sub: 'b', sessionId: 's1' }),
      ).toBeUndefined();
      expect(await jobs().take({ id: job.id, kind: 'instance', sessionId: 's1' })).toBeUndefined();
      expect(
        (await jobs().take({ id: job.id, kind: 'person', sub: 'a', sessionId: 's1' }))?.file,
      ).toBe(`${job.id}.zip`);
      expect(
        await jobs().take({ id: job.id, kind: 'person', sub: 'a', sessionId: 's1' }),
      ).toBeUndefined();
      expect(await jobs().purge()).toEqual([`${job.id}.zip`]);
    });

    it('is not handed over after the hour, and is then forgotten with its file', async () => {
      const { job } = await jobs().request({
        kind: 'instance',
        sessionId: 's1',
        archive: 'tar.age',
      });
      await jobs().claim();
      await jobs().finish(job.id, `${job.id}.tar.age`, 10);
      clock += KEPT_MS + 1;
      expect(await jobs().take({ id: job.id, kind: 'instance', sessionId: 's1' })).toBeUndefined();
      expect(await jobs().purge()).toEqual([`${job.id}.tar.age`]);
      expect(await jobs().latest('instance')).toBeUndefined();
    });

    it('records a failure by its kind, and a new request replaces it', async () => {
      const { job } = await jobs().request({
        kind: 'instance',
        sessionId: 's1',
        archive: 'tar.age',
      });
      await jobs().claim();
      await jobs().fail(job.id, 'no_recipients');
      expect((await jobs().latest('instance'))?.failure).toBe('no_recipients');
      await jobs().request({ kind: 'instance', sessionId: 's1', archive: 'tar.age' });
      expect((await jobs().latest('instance'))?.state).toBe('pending');
    });
  });

  describe('a person’s export', () => {
    it('holds them and their files, and nothing of anyone else or of their credentials', async () => {
      await person('u1', 'ada@sovereign.local');
      await person('u2', 'bob@sovereign.local');
      const time = pg() ? new Date(clock) : clock;
      await db.run(
        "insert into accounts (id, account_id, provider_id, user_id, password, created_at, updated_at) values ('a1', 'u1', 'credential', 'u1', 'STORED-PASSWORD-HASH', ?, ?)",
        [time, time],
      );
      for (const [id, user, title] of [
        ['n1', 'u1', 'For Ada'],
        ['n2', 'u2', 'For Bob'],
      ]) {
        await db.run(
          "insert into notifications (id, user_id, client_id, title, category, created_at, expires_at) values (?, ?, 'app', ?, 'info', ?, ?)",
          [id, user, title, clock, clock + 1000],
        );
      }
      await mkdir(path.join(root, 'u1'), { recursive: true });
      await mkdir(path.join(root, 'u2'), { recursive: true });
      await writeFile(path.join(root, 'u1', 'f1'), 'ada’s file');
      await writeFile(path.join(root, 'u2', 'f2'), 'bob’s file');
      await jobs().request({ kind: 'person', sub: 'u1', sessionId: 's1', archive: 'tar' });
      const job = await jobs().claim();
      if (!job) throw new Error('no job');
      const made = await makeExport(job, {
        database: db,
        storageRoot: root,
        instance: { id: 'i1', url: 'https://sovereign.example.org' },
        coreVersion: '0.79.0',
        recipients: async () => [],
        now: () => clock,
      });
      const files = new Map<string, string>();
      const read = await readExport(
        Readable.toWeb(
          createReadStream(path.join(exportsFolder(root), made.file)),
        ) as ReadableStream<Uint8Array>,
        {
          onFile: async ({ path: inside, body }) => {
            const parts: Buffer[] = [];
            for await (const chunk of body) parts.push(Buffer.from(chunk));
            files.set(inside, Buffer.concat(parts).toString('utf8'));
          },
        },
      );
      expect(read.head).toMatchObject({ kind: 'person', sub: 'u1' });
      expect(files.get('core/files/f1')).toBe('ada’s file');
      expect(files.get('core/records/users.jsonl')).toContain('ada@sovereign.local');
      expect(files.get('core/records/notifications.jsonl')).toContain('For Ada');
      expect(files.has('core/records/connected_apps.jsonl')).toBe(true);
      const everything = [...files.values()].join('\n');
      for (const other of ['bob@sovereign.local', 'For Bob', 'bob’s file', 'STORED-PASSWORD-HASH'])
        expect(everything).not.toContain(other);
      expect(
        [...files.keys()].some(
          (name) => name.includes('instance_settings') || name.includes('invites'),
        ),
      ).toBe(false);
    });
  });

  describe('apps’ parts of a person’s export', () => {
    async function client(clientId: string, name: string, exportUri?: string) {
      const time = pg() ? new Date(clock) : clock;
      await db.run(
        'insert into oauth_clients (id, client_id, name, metadata, redirect_uris, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
        [
          clientId,
          clientId,
          name,
          JSON.stringify(exportUri ? { exportUri } : {}),
          pg() ? '{https://x/cb}' : '["https://x/cb"]',
          time,
          time,
        ],
      );
      await db.run(
        'insert into oauth_consents (id, client_id, user_id, scopes, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
        [`c-${clientId}`, clientId, 'u1', pg() ? '{openid}' : '["openid"]', time, time],
      );
    }

    async function appAnswer(sub: string, prefix: string): Promise<Uint8Array> {
      const writer = new ExportWriter({
        head: {
          format: 1,
          kind: 'person',
          producer: { name: prefix, version: '1.0.0' },
          app: prefix,
          sub,
          takenAt: new Date(clock).toISOString(),
        },
      });
      const parts: Uint8Array[] = [];
      const read = (async () => {
        for await (const chunk of writer.readable as unknown as AsyncIterable<Uint8Array>)
          parts.push(chunk);
      })();
      writer.addPart({ name: prefix, status: 'complete', version: '1.0.0' });
      await writer.addRecords(`apps/${prefix}/records/notes.jsonl`, 'notes', [
        { text: `${sub}'s note` },
      ]);
      await writer.finish();
      await read;
      return Buffer.concat(parts);
    }

    it('places what an app answers under its own folder, and lists one that cannot answer as missing', async () => {
      await person('u1', 'ada@sovereign.local');
      await client('notes-id', 'Notes', 'https://notes.example/auth/export');
      await client('tally-id', 'Tally', 'https://tally.example/auth/export');
      await client('old-id', 'Old app');
      const asked: string[] = [];
      const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
        asked.push(String(url));
        expect(String(init?.body)).toContain('export_request_token=signed-');
        expect(init?.redirect).toBe('manual');
        if (String(url).startsWith('https://tally')) return new Response('no', { status: 500 });
        return new Response(Buffer.from(await appAnswer('u1', 'notes')), { status: 200 });
      }) as typeof fetch;
      const writer = new ExportWriter({
        head: {
          format: 1,
          kind: 'person',
          producer: { name: 'core', version: '0.81.0' },
          sub: 'u1',
          takenAt: new Date(clock).toISOString(),
        },
      });
      const parts: Uint8Array[] = [];
      const drained = (async () => {
        for await (const chunk of writer.readable as unknown as AsyncIterable<Uint8Array>)
          parts.push(chunk);
      })();
      await addAppParts(writer, 'u1', {
        database: db,
        sign: async (clientId, sub) => `signed-${clientId}-${sub}`,
        spoolDirectory: root,
        fetch: fakeFetch,
      });
      await writer.finish();
      await drained;
      const files = new Map<string, string>();
      const read = await readExport(Buffer.concat(parts), {
        onFile: async ({ path: inside, body }) => {
          const chunks: Buffer[] = [];
          for await (const chunk of body) chunks.push(Buffer.from(chunk));
          files.set(inside, Buffer.concat(chunks).toString('utf8'));
        },
      });
      expect(asked.sort()).toEqual([
        'https://notes.example/auth/export',
        'https://tally.example/auth/export',
      ]);
      expect(read.contents.parts).toEqual([
        { name: 'notes', status: 'complete', version: '1.0.0' },
        { name: 'old-app', status: 'missing', reason: 'not_supported' },
        { name: 'tally', status: 'missing', reason: 'refused' },
      ]);
      expect(files.get('apps/notes/records/notes.jsonl')).toContain("u1's note");
      expect(read.contents.records).toEqual([
        { path: 'apps/notes/records/notes.jsonl', kind: 'notes', count: 1, endToEnd: false },
      ]);
    });

    it('refuses an answer for another person, or that is not an export, or is too large', async () => {
      await person('u1', 'ada@sovereign.local');
      await client('a-id', 'Alpha', 'https://a.example/x');
      await client('b-id', 'Bravo', 'https://b.example/x');
      await client('c-id', 'Charlie', 'https://c.example/x');
      const fakeFetch = (async (url: string | URL) => {
        if (String(url).startsWith('https://a'))
          return new Response(Buffer.from(await appAnswer('someone-else', 'alpha')), {
            status: 200,
          });
        if (String(url).startsWith('https://b')) return new Response('not a tar', { status: 200 });
        return new Response(new Uint8Array(65536), { status: 200 });
      }) as typeof fetch;
      const writer = new ExportWriter({
        head: {
          format: 1,
          kind: 'person',
          producer: { name: 'core', version: '0.81.0' },
          sub: 'u1',
          takenAt: new Date(clock).toISOString(),
        },
      });
      const drained = (async () => {
        for await (const _chunk of writer.readable as unknown as AsyncIterable<Uint8Array>) {
          // read
        }
      })();
      await addAppParts(writer, 'u1', {
        database: db,
        sign: async () => 't',
        spoolDirectory: root,
        fetch: fakeFetch,
        maxBytes: 32768,
      });
      const contents = await writer.finish();
      await drained;
      expect(contents.parts.map((part) => [part.name, part.reason])).toEqual([
        ['alpha', 'invalid'],
        ['bravo', 'invalid'],
        ['charlie', 'too_large'],
      ]);
      expect(contents.files).toEqual([]);
    });
  });

  describe('the owner’s export', () => {
    it('opens with the owner’s key alone, holds core’s records and files, and no credential', async () => {
      await person('u1', 'ada@sovereign.local');
      const time = pg() ? new Date(clock) : clock;
      await db.run(
        "insert into accounts (id, account_id, provider_id, user_id, password, created_at, updated_at) values ('a1', 'u1', 'credential', 'u1', 'STORED-PASSWORD-HASH', ?, ?)",
        [time, time],
      );
      await db.run(
        "insert into two_factors (id, secret, backup_codes, user_id) values ('t1', 'TOTP-SECRET-VALUE', 'BACKUP-CODES-VALUE', 'u1')",
      );
      await mkdir(path.join(root, 'u1'), { recursive: true });
      await writeFile(path.join(root, 'u1', 'f1'), 'the file');
      await mkdir(path.join(root, '.exports'), { recursive: true });
      await writeFile(path.join(root, '.exports', 'old.zip'), 'not this');
      const identity = await generateX25519Identity();
      const { job } = await jobs().request({
        kind: 'instance',
        sessionId: 's1',
        archive: 'tar.age',
      });
      const claimed = await jobs().claim();
      const made = await makeExport(claimed ?? job, {
        database: db,
        storageRoot: root,
        instance: { id: 'i1', url: 'https://sovereign.example.org' },
        coreVersion: '0.79.0',
        recipients: async () => [await identityToRecipient(identity)],
        now: () => clock,
      });
      const file = path.join(exportsFolder(root), made.file);
      const files = new Map<string, string>();
      const read = await readExport(
        await decryptWith(
          [identity],
          Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
        ),
        {
          onFile: async ({ path: inside, body }) => {
            const parts: Buffer[] = [];
            for await (const chunk of body) parts.push(Buffer.from(chunk));
            files.set(inside, Buffer.concat(parts).toString('utf8'));
          },
        },
      );
      expect(read.head).toMatchObject({ kind: 'instance', instance: { id: 'i1' } });
      expect(files.get('core/files/u1/f1')).toBe('the file');
      expect([...files.keys()].some((name) => name.includes('.exports'))).toBe(false);
      expect(files.get('core/records/users.jsonl')).toContain('ada@sovereign.local');
      const everything = [...files.values()].join('\n');
      for (const secret of ['STORED-PASSWORD-HASH', 'TOTP-SECRET-VALUE', 'BACKUP-CODES-VALUE'])
        expect(everything).not.toContain(secret);
      const other = await generateX25519Identity();
      await expect(
        (async () =>
          readExport(
            await decryptWith(
              [other],
              Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
            ),
          ))(),
      ).rejects.toBeDefined();
      await removeExportFiles(root, [made.file]);
      expect((await readdir(exportsFolder(root))).filter((name) => name !== 'old.zip')).toEqual([]);
    });

    it('is not made without keys, and leaves nothing behind', async () => {
      const { job } = await jobs().request({
        kind: 'instance',
        sessionId: 's1',
        archive: 'tar.age',
      });
      await expect(
        makeExport(job, {
          database: db,
          storageRoot: root,
          instance: { id: 'i1', url: 'https://x' },
          coreVersion: '0.79.0',
          recipients: async () => [],
        }),
      ).rejects.toMatchObject({ kind: 'no_recipients' });
      expect(await readdir(exportsFolder(root))).toEqual([]);
    });
  });
}
