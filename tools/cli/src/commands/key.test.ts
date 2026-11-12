import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readOperatorKey } from '../secrets/keys.js';
import { decryptValue, type SecretsDocument } from '../secrets/store.js';
import type { Suite } from '../suite/types.js';
import { setUpWorld, sv } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';

let world: World;
const dirs: string[] = [];
afterEach(() => {
  world.cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const outside = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-recovery-'));
  dirs.push(dir);
  return dir;
};
const file = (name: string) => readFileSync(path.join(world.root, name), 'utf8');
const recipients = () => (parse(file('suite.yml')) as Suite).secrets.recipients;

describe('sv key recovery', () => {
  it('writes a key outside the repository, adds it to the recipients marked as one, and re-encrypts the secrets to it', async () => {
    world = makeWorld({ stdin: 'smtp-password\n' });
    await setUpWorld(world);
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    const before = recipients();
    const target = path.join(outside(), 'recovery.key');
    const done = await sv(world, 'key', 'recovery', '--out', target);
    expect(done.code).toBe(0);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    const recovery = await readOperatorKey(target);
    expect(recovery).toBeDefined();
    expect(recipients()).toEqual([...before, recovery?.recipient]);
    expect(file('suite.yml')).toMatch(/age1\S+ # recovery key/);
    const armored = (parse(file('secrets.age.yml')) as SecretsDocument).core?.SV_SMTP_PASSWORD;
    expect(await decryptValue(armored ?? '', recovery?.identity ?? '')).toBe('smtp-password');
    expect(done.text).toContain('sv push and sv deploy');
    expect(done.text).not.toContain(recovery?.identity ?? 'x');
  });

  it('shows the key once in a terminal, and refuses without one unless given --out', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const refused = await sv(world, 'key', 'recovery');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('--out');
    expect(recipients()).toHaveLength(1);
    world.cleanup();

    world = makeWorld({ interactive: true });
    await setUpWorld(world);
    const shown = await sv(world, 'key', 'recovery');
    expect(shown.code).toBe(0);
    expect(shown.text).toMatch(/AGE-SECRET-KEY-1[0-9A-Z]+/);
    expect(shown.text).toContain('shown this once');
    expect(recipients()).toHaveLength(2);
  });

  it('never writes the key inside the repository', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const done = await sv(world, 'key', 'recovery', '--out', path.join(world.root, 'recovery.key'));
    expect(done.code).toBe(2);
    expect(existsSync(path.join(world.root, 'recovery.key'))).toBe(false);
    expect(recipients()).toHaveLength(1);
  });

  it('--remove takes recovery keys out and leaves the operator’s, saying what it does not take back', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const operator = recipients();
    await sv(world, 'key', 'recovery', '--out', path.join(outside(), 'r.key'));
    expect(recipients()).toHaveLength(2);
    const done = await sv(world, 'key', 'recovery', '--remove');
    expect(done.code).toBe(0);
    expect(recipients()).toEqual(operator);
    expect(done.text).toContain('does not take back');
    const again = await sv(world, 'key', 'recovery', '--remove');
    expect(again.text).toContain('no recovery key');
  });
});
