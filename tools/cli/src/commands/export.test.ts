import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { encryptTo, ExportWriter, type ExportHead } from '@sovereignfs/export';
import { readOperatorKey } from '../secrets/keys.js';
import type { Suite } from '../suite/types.js';
import { setUpWorld, sv } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';

let world: World;
const dirs: string[] = [];
afterEach(() => {
  world?.cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const outside = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-export-'));
  dirs.push(dir);
  return dir;
};

const head: ExportHead = {
  format: 1,
  kind: 'instance',
  producer: { name: 'core', version: '0.80.0' },
  instance: { id: 'i', url: 'https://sovereign.example.org' },
  takenAt: '2026-11-20T10:00:00.000Z',
};

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>)
    parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

async function anExport(): Promise<Buffer> {
  const writer = new ExportWriter({ head });
  const out = collect(writer.readable);
  writer.addPart({ name: 'core', status: 'complete' });
  await writer.addRecords('core/records/accounts.jsonl', 'accounts', [
    { email: 'ada@sovereign.local' },
  ]);
  await writer.addFile('core/files/person/a.txt', new TextEncoder().encode('hello'));
  await writer.finish();
  return out;
}

describe('sv key export', () => {
  it('prints the recipients as the one line the Console takes', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const done = await sv(world, 'key', 'export');
    expect(done.code).toBe(0);
    const recipients = (parse(readFileSync(path.join(world.root, 'suite.yml'), 'utf8')) as Suite)
      .secrets.recipients;
    expect(done.out).toEqual([recipients.join(' ')]);
    expect(done.text).not.toMatch(/AGE-SECRET-KEY/);
  });
});

describe('sv export open', () => {
  it('opens an owner’s export with the operator’s key, checks it, and unpacks it beside the file', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const key = await readOperatorKey(world.ctx.keyFile);
    const dir = outside();
    const file = path.join(dir, 'sovereign-x-20261120T100000Z-instance.tar.age');
    writeFileSync(file, await collect(await encryptTo([key?.recipient ?? ''], await anExport())));
    const done = await sv(world, 'export', 'open', file);
    expect(done.code).toBe(0);
    const out = path.join(dir, 'sovereign-x-20261120T100000Z-instance');
    expect(readFileSync(path.join(out, 'core/files/person/a.txt'), 'utf8')).toBe('hello');
    expect(JSON.parse(readFileSync(path.join(out, 'export.json'), 'utf8'))).toEqual(head);
    expect(statSync(out).mode & 0o777).toBe(0o700);
    expect(done.text).toMatch(/not a backup/);
  });

  it('refuses an export its key cannot open, and keeps nothing', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const dir = outside();
    const other = await identityToRecipient(await generateX25519Identity());
    const file = path.join(dir, 'x.tar.age');
    writeFileSync(file, await collect(await encryptTo([other], await anExport())));
    const done = await sv(world, 'export', 'open', file);
    expect(done.code).toBe(2);
    expect(existsSync(path.join(dir, 'x'))).toBe(false);
    expect(readdir(dir)).toEqual(['x.tar.age']);
  });

  it('refuses a changed export, and keeps nothing of it', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const dir = outside();
    const bytes = await anExport();
    bytes[bytes.indexOf('hello')] = 'j'.charCodeAt(0);
    const file = path.join(dir, 'x.tar');
    writeFileSync(file, bytes);
    const done = await sv(world, 'export', 'open', file);
    expect(done.code).toBe(2);
    expect(done.text).toMatch(/nothing of it was kept/);
    expect(readdir(dir)).toEqual(['x.tar']);
  });

  it('says a zip is a person’s export, and a file that is neither is no export', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const dir = outside();
    writeFileSync(path.join(dir, 'a.zip'), Buffer.from('PK\u0003\u0004rest'));
    writeFileSync(path.join(dir, 'b.bin'), Buffer.alloc(600, 1));
    expect((await sv(world, 'export', 'open', path.join(dir, 'a.zip'))).text).toMatch(
      /person's export, a zip/,
    );
    expect((await sv(world, 'export', 'open', path.join(dir, 'b.bin'))).text).toMatch(
      /not an export/,
    );
  });
});

const readdir = (dir: string): string[] => readdirSync(dir);
