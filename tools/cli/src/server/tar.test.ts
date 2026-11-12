import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { isKnownPath } from '../suite/files.js';
import {
  ChunkReader,
  extract,
  extractStream,
  joinRestore,
  makeArchive,
  readArchive,
  takeRestoreFrame,
} from './tar.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-tar-'));
  dirs.push(dir);
  return dir;
};
const any = () => true;

describe('reading an archive', () => {
  it('reads files, and writes them under the place it is given and nowhere else', async () => {
    const entries = readArchive(
      makeArchive({ 'suite.yml': 'a: 1\n', 'overrides/compose/core.yml': 'x\n' }),
      any,
    );
    expect(entries.map((e) => e.name)).toEqual(['suite.yml', 'overrides/compose/core.yml']);
    const dir = temp();
    await extract(entries, dir);
    expect(readFileSync(path.join(dir, 'overrides/compose/core.yml'), 'utf8')).toBe('x\n');
  });

  it('reads what git archive writes, including a long name and the commit header', () => {
    const repo = temp();
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'T',
          GIT_AUTHOR_EMAIL: 't@sovereign.local',
          GIT_COMMITTER_NAME: 'T',
          GIT_COMMITTER_EMAIL: 't@sovereign.local',
        },
      });
    git('init', '--initial-branch=main');
    writeFileSync(path.join(repo, 'suite.yml'), 'a: 1\n');
    const deep = path.join(repo, 'overrides', 'compose', 'x'.repeat(60), 'y'.repeat(60));
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, 'core.yml'), 'long\n');
    git('add', '.');
    git('commit', '-m', 'x');
    const archive = git('archive', '--format=tar', 'HEAD', '--', 'suite.yml', 'overrides');
    const entries = readArchive(archive, isKnownPath);
    expect(entries.map((e) => e.name).sort()).toEqual([
      `overrides/compose/${'x'.repeat(60)}/${'y'.repeat(60)}/core.yml`,
      'suite.yml',
    ]);
    expect(entries.find((e) => e.name === 'suite.yml')?.data.toString()).toBe('a: 1\n');
  });

  it('refuses a name that climbs out, an absolute one, and a file that is not an instance file', () => {
    for (const name of ['../escape', '/etc/passwd', 'a/../../b', 'a//b']) {
      expect(() => readArchive(makeArchive({ [name]: 'x' }), any), name).toThrow(Refused);
    }
    expect(() => readArchive(makeArchive({ 'script.sh': 'x' }), isKnownPath)).toThrow(
      /not an instance file/,
    );
  });

  it('refuses a link, whole, before anything is read from it', () => {
    const archive = makeArchive({ 'suite.yml': 'x' });
    archive[156] = 0x32; // a symbolic link
    expect(() => readArchive(archive, any)).toThrow(/not a file/);
  });

  it('refuses an archive that is cut short or too large', () => {
    const archive = makeArchive({ 'suite.yml': 'x'.repeat(2000) });
    expect(() => readArchive(archive.subarray(0, 700), any)).toThrow(/ends before/);
    expect(() => readArchive(Buffer.alloc(33 * 1024 * 1024), any)).toThrow(/larger/);
  });
});

describe('extracting a stream', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const place = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-stream-'));
    dirs.push(dir);
    return dir;
  };
  /** The bytes cut into chunks of `size`, as a network would deliver them. */
  async function* chunks(bytes: Buffer, size: number): AsyncIterable<Uint8Array> {
    for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
  }

  it('writes each file as it arrives, whatever the size of the chunks it comes in', async () => {
    const archive = makeArchive({
      'databases/core.sql': 'select 1;',
      'files/notes.tar': 'x'.repeat(5000),
      'secrets/a': 'b',
    });
    for (const size of [1, 7, 512, 513, 100_000]) {
      const dir = place();
      const done = await extractStream(new ChunkReader(chunks(archive, size)), dir, {
        allowed: any,
      });
      expect(done.names).toEqual(['databases/core.sql', 'files/notes.tar', 'secrets/a']);
      expect(readFileSync(path.join(dir, 'files/notes.tar'), 'utf8')).toBe('x'.repeat(5000));
      expect(readFileSync(path.join(dir, 'secrets/a'), 'utf8')).toBe('b');
    }
  });

  it('refuses what the whole-archive reader refuses: a name that climbs, one not allowed, and a link', async () => {
    const climbs = makeArchive({ '../x': 'y' });
    await expect(
      extractStream(new ChunkReader(chunks(climbs, 512)), place(), { allowed: any }),
    ).rejects.toThrow(/not allowed/);
    const other = makeArchive({ 'etc/passwd': 'y' });
    await expect(
      extractStream(new ChunkReader(chunks(other, 512)), place(), {
        allowed: (name) => name.startsWith('files/'),
      }),
    ).rejects.toThrow(/not an instance file/);
    const link = Buffer.from(makeArchive({ 'files/a.tar': '' }));
    link.write('2', 156);
    await expect(
      extractStream(new ChunkReader(chunks(link, 512)), place(), { allowed: any }),
    ).rejects.toThrow(/not a file/);
  });

  it('throws away what it is told to skip, and leaves no part of a file that ends early', async () => {
    const dir = place();
    const done = await extractStream(
      new ChunkReader(chunks(makeArchive({ 'state.json': '{}', a: 'b' }), 100)),
      dir,
      { allowed: any, skip: (name) => name === 'state.json' },
    );
    expect(done.names).toEqual(['a']);
    expect(existsSync(path.join(dir, 'state.json'))).toBe(false);

    const cut = makeArchive({ 'files/a.tar': 'z'.repeat(4000) }).subarray(0, 1500);
    const into = place();
    await expect(
      extractStream(new ChunkReader(chunks(cut, 300)), into, { allowed: any }),
    ).rejects.toThrow(/ends before/);
    expect(existsSync(path.join(into, 'files/a.tar'))).toBe(false);
  });

  it('asks the guard now and then, so a restore that would fill the disk can stop', async () => {
    const big = makeArchive({ 'files/a.tar': 'q'.repeat(200_000) });
    const seen: number[] = [];
    await extractStream(new ChunkReader(chunks(big, 4096)), place(), {
      allowed: any,
      guardEvery: 50_000,
      guard: async (written) => void seen.push(written),
    });
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    const stop = new Error('no room');
    await expect(
      extractStream(new ChunkReader(chunks(big, 4096)), place(), {
        allowed: any,
        guardEvery: 50_000,
        guard: () => Promise.reject(stop),
      }),
    ).rejects.toBe(stop);
  });

  it('takes the deployment’s files first and leaves the rest of the stream for the backup', async () => {
    const reader = new ChunkReader(
      chunks(
        joinRestore(makeArchive({ 'suite.yml': 'a' }), makeArchive({ 'databases.sql': 'b' })),
        333,
      ),
    );
    const { deployment } = await takeRestoreFrame(reader);
    expect(readArchive(deployment, any).map((e) => e.name)).toEqual(['suite.yml']);
    const done = await extractStream(reader, place(), { allowed: any });
    expect(done.names).toEqual(['databases.sql']);
    await expect(takeRestoreFrame(new ChunkReader(chunks(Buffer.alloc(4), 2)))).rejects.toThrow(
      /cut short/,
    );
  });
});
