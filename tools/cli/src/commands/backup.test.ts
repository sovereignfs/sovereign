import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Encrypter, generateX25519Identity, identityToRecipient } from 'age-encryption';
import { readOperatorKey } from '../secrets/keys.js';
import type { Remote } from '../server/remote.js';
import { makeArchive, readArchive, splitRestore } from '../server/tar.js';
import { isKnownPath } from '../suite/files.js';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';

let world: World;
const dirs: string[] = [];
afterEach(() => {
  world.cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-backup-test-'));
  dirs.push(dir);
  return dir;
};
const ready = async () => {
  world = makeWorld();
  await setUpWorld(world, '--deploy', 'ssh');
  await sv(world, 'push');
};

/** A backup as the server would make one: a tar of the databases, encrypted to a recipient. */
async function backupFile(
  recipient: string,
  dir: string,
  files: Record<string, string> = { './databases.sql': 'SELECT 1;' },
) {
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const encrypted = await encrypter.encrypt(makeArchive(files));
  const file = path.join(dir, 'backup.tar.age');
  writeFileSync(file, encrypted);
  return file;
}
const drain = async (stream: NodeJS.ReadableStream | undefined) => {
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

describe('sv backup', () => {
  it('asks the server for one, keeps what comes in a file of its own, and says the server cannot read it', async () => {
    await ready();
    const asked: string[][] = [];
    const remote: Remote = async (_t, words, options) => {
      asked.push([...words]);
      writeFileSync(options?.stdoutTo as string, 'age-encryption.org/v1\n-> X25519 abc\n');
      return { code: 0, stdout: '', stderr: '' };
    };
    world.ctx.remote = remote;
    const dir = temp();
    const done = await sv(world, 'backup', '--to', dir);
    expect(done.code).toBe(0);
    expect(asked).toEqual([['/usr/local/sbin/sovereign-receive', 'backup']]);
    const file = done.text.match(/Saved (\S+)/)?.[1] as string;
    expect(path.dirname(file)).toBe(dir);
    expect(file).toMatch(/sovereign-203\.0\.113\.7-.*\.tar\.age$/);
    expect(done.text).toContain('The server cannot read it');
  });

  it('writes to the path it is given, refuses one that exists, and keeps nothing when what arrives is not a backup', async () => {
    await ready();
    world.ctx.remote = async (_t, _w, options) => {
      writeFileSync(options?.stdoutTo as string, 'not a backup');
      return { code: 0, stdout: '', stderr: '' };
    };
    const target = path.join(temp(), 'mine.tar.age');
    const bad = await sv(world, 'backup', '--to', target);
    expect(bad.code).toBe(1);
    expect(bad.text).toContain('is not a backup');
    expect(existsSync(target)).toBe(false);
    writeFileSync(target, 'x');
    const exists = await sv(world, 'backup', '--to', target);
    expect(exists.code).toBe(2);
  });

  it('ends as the server says, and keeps nothing when it failed', async () => {
    await ready();
    const target = path.join(temp(), 'b.tar.age');
    world.ctx.remote = async () => ({
      code: 3,
      stdout: '',
      stderr: 'Another deployment is running.',
    });
    const done = await sv(world, 'backup', '--to', target);
    expect(done.code).toBe(3);
    expect(existsSync(target)).toBe(false);
  });
});

describe('sv restore', () => {
  it('decrypts the backup here, and sends the deployment’s files and then the backup in the clear over the connection', async () => {
    await ready();
    const key = (await readOperatorKey(world.ctx.keyFile)) as { recipient: string };
    const file = await backupFile(key.recipient, temp());
    let words: string[] = [];
    let body = Buffer.alloc(0);
    world.ctx.remote = async (_t, w, options) => {
      words = [...w];
      body = await drain(options?.inputStream);
      return { code: 0, stdout: '', stderr: '' };
    };
    const done = await sv(world, 'restore', file, '--yes');
    expect(done.code).toBe(0);
    const commit = world.git('rev-parse', 'HEAD').trim();
    expect(words).toEqual(['/usr/local/sbin/sovereign-receive', 'restore', commit]);
    const { deployment, backup } = splitRestore(body);
    expect(
      readArchive(deployment, isKnownPath)
        .map((e) => e.name)
        .sort(),
    ).toEqual(['suite.lock', 'suite.yml']);
    expect(
      readArchive(backup, () => true, { stripDot: true }).map((e) => [e.name, e.data.toString()]),
    ).toEqual([['databases.sql', 'SELECT 1;']]);
    expect(done.text).toContain('signed out');
  });

  it('needs a yes, naming what it replaces, and sends nothing without it', async () => {
    await ready();
    const key = (await readOperatorKey(world.ctx.keyFile)) as { recipient: string };
    const file = await backupFile(key.recipient, temp());
    let called = false;
    world.ctx.remote = async () => ((called = true), { code: 0, stdout: '', stderr: '' });
    const done = await sv(world, 'restore', file);
    expect(done.code).toBe(2);
    expect(done.text).toContain('replaces what 203.0.113.7 holds');
    expect(done.text).toContain('--yes');
    expect(called).toBe(false);
  });

  it('refuses a backup that was encrypted to other keys, a missing file, and work that is not pushed', async () => {
    await ready();
    world.ctx.remote = async () => ({ code: 0, stdout: '', stderr: '' });
    const stranger = await identityToRecipient(await generateX25519Identity());
    const wrong = await sv(world, 'restore', await backupFile(stranger, temp()), '--yes');
    expect(wrong.code).toBe(2);
    expect(wrong.text).toContain('encrypted to other keys');
    expect((await sv(world, 'restore', path.join(temp(), 'ghost.age'), '--yes')).code).toBe(2);
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      `${readFileSync(path.join(world.root, 'suite.yml'), 'utf8')}\n# edited\n`,
    );
    const key = (await readOperatorKey(world.ctx.keyFile)) as { recipient: string };
    const dirty = await sv(world, 'restore', await backupFile(key.recipient, temp()), '--yes');
    expect(dirty.code).toBe(2);
    expect(dirty.text).toContain('not committed');
  });
});

describe('sv rollback', () => {
  it('says what a rollback does not undo, needs a yes, and then asks the server to do it', async () => {
    await ready();
    const asked: string[][] = [];
    world.ctx.remote = async (_t, words, options) => {
      asked.push([...words]);
      options?.onStdout?.('Going back to aaaaaaaaaaaa.\n');
      return { code: 0, stdout: '', stderr: '' };
    };
    const refused = await sv(world, 'rollback');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('does not undo its migrations');
    expect(asked).toEqual([]);
    const done = await sv(world, 'rollback', '--yes');
    expect(done.code).toBe(0);
    expect(asked).toEqual([['/usr/local/sbin/sovereign-receive', 'rollback']]);
    expect(done.text).toContain('Going back to');
  });

  it('shows the server’s refusal when core would go backward', async () => {
    await ready();
    world.ctx.remote = async () => ({
      code: 2,
      stdout: '',
      stderr: 'Core 0.71.0 cannot go back to 0.70.0: its migrations only go forward.',
    });
    const done = await sv(world, 'rollback', '--yes');
    expect(done.code).toBe(2);
    expect(done.text).toContain('only go forward');
  });
});
