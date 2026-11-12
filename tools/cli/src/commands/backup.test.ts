import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

/** A server that answers `backup` with an archive encrypted to `recipient`, holding `files`, and records what it was asked. */
async function backingUp(
  recipient: string,
  files: Record<string, string> = {
    'backup.json': JSON.stringify({ format: 1, scope: { all: true }, takenAt: 'x', apps: {} }),
    'databases/core.sql': '-- core',
  },
) {
  const asked: string[][] = [];
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const encrypted = await encrypter.encrypt(makeArchive(files));
  const remote: Remote = async (_t, words, options) => {
    asked.push([...words]);
    writeFileSync(options?.stdoutTo as string, encrypted);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { asked, remote };
}
const operatorRecipient = async () =>
  ((await readOperatorKey(world.ctx.keyFile)) as { recipient: string }).recipient;

describe('sv backup', () => {
  it('asks the server for one, keeps what comes in a file of its own, and says the server cannot read it', async () => {
    await ready();
    const { asked, remote } = await backingUp(await operatorRecipient());
    world.ctx.remote = remote;
    const dir = temp();
    const done = await sv(world, 'backup', '--to', dir);
    expect(done.code).toBe(0);
    expect(asked).toEqual([['/usr/local/sbin/sovereign-receive', 'backup']]);
    const file = done.text.match(/Saved (\S+)/)?.[1] as string;
    expect(path.dirname(file)).toBe(dir);
    expect(file).toMatch(/sovereign-203\.0\.113\.7-.*-all\.tar\.age$/);
    expect(done.text).toContain('The server cannot read it');
  });

  it('keeps it in .backups/ when given no path, and adds that folder to .gitignore once', async () => {
    await ready();
    world.ctx.remote = (await backingUp(await operatorRecipient())).remote;
    const first = await sv(world, 'backup');
    expect(first.code).toBe(0);
    const file = first.text.match(/Saved (\S+)/)?.[1] as string;
    expect(path.dirname(file)).toBe(path.join(world.root, '.backups'));
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(first.text).toContain('Added .backups/ to .gitignore');
    expect(first.text).toContain('offline');
    const second = await sv(world, 'backup');
    expect(second.code).toBe(0);
    expect(second.text).not.toContain('Added .backups/');
    expect(second.text).not.toContain('offline');
    const ignored = readFileSync(path.join(world.root, '.gitignore'), 'utf8');
    expect(ignored.match(/^\.backups\/$/gm)).toHaveLength(1);
    expect(world.git('status', '--porcelain', '--ignored', '.backups')).toContain('!! .backups/');
  });

  it('asks for core or apps by name, and refuses --all beside them', async () => {
    await ready();
    const { asked, remote } = await backingUp(await operatorRecipient());
    world.ctx.remote = remote;
    const done = await sv(world, 'backup', '--core', '--app', 'notes', 'tasks');
    expect(done.code).toBe(0);
    expect(asked).toEqual([
      ['/usr/local/sbin/sovereign-receive', 'backup', 'core', 'app', 'notes', 'app', 'tasks'],
    ]);
    expect(done.text).toMatch(/-core\+app-notes\+app-tasks\.tar\.age/);
    const both = await sv(world, 'backup', '--all', '--core');
    expect(both.code).toBe(2);
    expect((await sv(world, 'backup', '--app', 'Bad_Name')).code).toBe(2);
  });

  it('with --unencrypted asks first, then decrypts here into .backups/unsafe/, keeping nothing encrypted beside it', async () => {
    await ready();
    world.ctx.remote = (await backingUp(await operatorRecipient())).remote;
    const refused = await sv(world, 'backup', '--unencrypted');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('in the clear');
    const done = await sv(world, 'backup', '--unencrypted', '--yes');
    expect(done.code).toBe(0);
    const file = done.text.match(/Saved (\S+)/)?.[1] as string;
    expect(path.dirname(file)).toBe(path.join(world.root, '.backups', 'unsafe'));
    expect(file).toMatch(/\.tar$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readArchive(readFileSync(file), () => true).map((e) => e.name)).toEqual([
      'backup.json',
      'databases/core.sql',
    ]);
    expect(readdirSync(path.dirname(file))).toEqual([path.basename(file)]);
  });

  it('refuses, keeping nothing, a backup your key cannot open, and asks nothing of the server without a key', async () => {
    await ready();
    const stranger = await identityToRecipient(await generateX25519Identity());
    world.ctx.remote = (await backingUp(stranger)).remote;
    const target = path.join(temp(), 'b.tar.age');
    const done = await sv(world, 'backup', '--to', target);
    expect(done.code).toBe(2);
    expect(done.text).toContain('sv secret rekey');
    expect(existsSync(target)).toBe(false);
    rmSync(world.ctx.keyFile);
    let called = false;
    world.ctx.remote = async () => ((called = true), { code: 0, stdout: '', stderr: '' });
    expect((await sv(world, 'backup', '--to', target)).code).toBe(2);
    expect(called).toBe(false);
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
    world.ctx.remote = (await backingUp(await operatorRecipient())).remote;
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

describe('sv backup and restore with people’s files', () => {
  const manifest = (extra: object) =>
    JSON.stringify({ format: 2, scope: { all: true }, takenAt: 'x', apps: {}, ...extra });

  it('says which folders of people’s files the backup holds, and where the ones it does not hold are', async () => {
    await ready();
    world.ctx.remote = (
      await backingUp(await operatorRecipient(), {
        'backup.json': manifest({ files: ['core', 'notes'], elsewhere: { wiki: 'a bucket' } }),
        'databases/core.sql': '--',
      })
    ).remote;
    const done = await sv(world, 'backup');
    expect(done.code).toBe(0);
    expect(done.text).toContain('files people uploaded to: core, notes');
    expect(done.text).toContain('wiki’s files are kept in a bucket');
  });

  it('asks before replacing people’s files, and sends the backup whole, files and all', async () => {
    await ready();
    const file = await backupFile(await operatorRecipient(), temp(), {
      'backup.json': manifest({ files: ['core'] }),
      'databases/core.sql': '--',
      'files/core.tar': 'a tar',
    });
    let body = Buffer.alloc(0);
    world.ctx.remote = async (_t, _w, options) => {
      body = await drain(options?.inputStream);
      return { code: 0, stdout: '', stderr: '' };
    };
    const asked = await sv(world, 'restore', file);
    expect(asked.code).toBe(2);
    expect(asked.text).toContain('the files people uploaded');
    expect((await sv(world, 'restore', file, '--yes')).code).toBe(0);
    expect(readArchive(splitRestore(body).backup, () => true).map((e) => e.name)).toContain(
      'files/core.tar',
    );
  });

  it('does not mention files for a backup that holds none', async () => {
    await ready();
    const file = await backupFile(await operatorRecipient(), temp());
    world.ctx.remote = async () => ({ code: 0, stdout: '', stderr: '' });
    expect((await sv(world, 'restore', file)).text).not.toContain('files people uploaded');
  });
});

describe('sv restore by scope', () => {
  const manifest = (scope: object) => JSON.stringify({ format: 1, scope, takenAt: 'x', apps: {} });

  it('restores a plain tar as it is, and an app alone without signing anyone out', async () => {
    await ready();
    const file = path.join(temp(), 'notes.tar');
    writeFileSync(
      file,
      makeArchive({
        'backup.json': manifest({ all: false, core: false, apps: ['notes'] }),
        'databases/app_notes.sql': '-- notes',
      }),
    );
    let words: string[] = [];
    let body = Buffer.alloc(0);
    world.ctx.remote = async (_t, w, options) => {
      words = [...w];
      body = await drain(options?.inputStream);
      return { code: 0, stdout: '', stderr: '' };
    };
    const asked = await sv(world, 'restore', file);
    expect(asked.code).toBe(2);
    expect(asked.text).toContain('Core and the other apps are left as they are');
    const done = await sv(world, 'restore', file, '--yes');
    expect(done.code).toBe(0);
    expect(words.slice(3)).toEqual([]);
    expect(readArchive(splitRestore(body).backup, () => true).map((e) => e.name)).toEqual([
      'backup.json',
      'databases/app_notes.sql',
    ]);
    expect(done.text).toContain('Core and the other apps were not touched');
    expect(done.text).not.toContain('signed out');
  });

  it('asks the server for one part of a whole backup, and refuses a part the backup does not hold', async () => {
    await ready();
    const file = await backupFile(await operatorRecipient(), temp(), {
      'backup.json': manifest({ all: true }),
      'databases/core.sql': '--',
    });
    let words: string[] = [];
    world.ctx.remote = async (_t, w, options) => {
      words = [...w];
      await drain(options?.inputStream);
      return { code: 0, stdout: '', stderr: '' };
    };
    const done = await sv(world, 'restore', file, '--core', '--yes');
    expect(done.code).toBe(0);
    expect(words.slice(3)).toEqual(['core']);
    expect(done.text).toContain('signed out');

    const appOnly = await backupFile(await operatorRecipient(), temp(), {
      'backup.json': manifest({ all: false, core: false, apps: ['notes'] }),
      'databases/app_notes.sql': '--',
    });
    const refused = await sv(world, 'restore', appOnly, '--core', '--yes');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('holds notes, not core');
  });

  it('opens a backup with the key --key names, such as a recovery key', async () => {
    await ready();
    const identity = await generateX25519Identity();
    const keyFile = path.join(temp(), 'recovery.key');
    writeFileSync(keyFile, `${identity}\n`);
    const file = await backupFile(await identityToRecipient(identity), temp());
    world.ctx.remote = async (_t, _w, options) => (
      await drain(options?.inputStream),
      { code: 0, stdout: '', stderr: '' }
    );
    expect((await sv(world, 'restore', file, '--yes')).code).toBe(2);
    expect((await sv(world, 'restore', file, '--key', keyFile, '--yes')).code).toBe(0);
  });

  it('refuses a file that is neither an encrypted nor a plain backup', async () => {
    await ready();
    const file = path.join(temp(), 'notes.txt');
    writeFileSync(file, 'hello');
    const done = await sv(world, 'restore', file, '--yes');
    expect(done.code).toBe(2);
    expect(done.text).toContain('is not a backup');
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
