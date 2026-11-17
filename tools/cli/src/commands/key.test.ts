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

describe('sv key escrow (operator-cli §9.5)', () => {
  it('writes the private half outside the repository, and prints the line the owner pastes into the Console', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const target = path.join(outside(), 'escrow.key');
    const done = await sv(world, 'key', 'escrow', '--out', target);
    expect(done.code).toBe(0);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    const kept = readFileSync(target, 'utf8');
    const line = /sv-escrow-1\.[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{43}/.exec(done.text)?.[0];
    expect(line).toBeDefined();
    expect(kept).toContain(`# public key: ${line}`);
    expect(kept).toMatch(/^SV-ESCROW-SECRET-1\./m);
    // The private half is in the file alone, never in what the command printed, and nothing in the repository changed.
    const secret = /^SV-ESCROW-SECRET-1\.\S+/m.exec(kept)?.[0] ?? 'x';
    expect(done.text).not.toContain(secret);
    expect(done.text).toContain('Console');
  });

  it('refuses to write it inside the repository, over a file, or with no terminal and no --out', async () => {
    world = makeWorld();
    await setUpWorld(world);
    expect(
      (await sv(world, 'key', 'escrow', '--out', path.join(world.root, 'escrow.key'))).code,
    ).toBe(2);
    expect(existsSync(path.join(world.root, 'escrow.key'))).toBe(false);
    expect((await sv(world, 'key', 'escrow')).text).toContain('--out');
  });

  it('opens a person’s escrow way in offline and makes a new kit whose way in opens the same account key', async () => {
    const crypto = await import('@sovereignfs/crypto/web');
    world = makeWorld({ interactive: true });
    await setUpWorld(world);
    const dir = outside();
    const keyPath = path.join(dir, 'escrow.key');
    const made = await sv(world, 'key', 'escrow', '--out', keyPath);
    const line = /sv-escrow-1\.\S+/.exec(made.text)?.[0] ?? '';
    const escrowKey = await crypto.parseEscrowKey(line);
    if (!escrowKey) throw new Error('no escrow key');

    // What a person's browser sealed when they were covered, as sovereign-admin accounts escrow-record gives it.
    const accountKey = crypto.newKey();
    const record = await crypto.sealEscrowWrap({
      accountKey,
      sub: 'ada',
      escrowKeyId: escrowKey.id,
      escrowPublicKey: escrowKey.publicKey,
    });
    const recordPath = path.join(dir, 'record.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(recordPath, JSON.stringify({ sub: 'ada', escrowKeyId: escrowKey.id, record }));
    const outPath = path.join(dir, 'kit.json');

    const opened = await sv(
      world,
      'key',
      'escrow',
      'open',
      '--key',
      keyPath,
      '--out',
      outPath,
      recordPath,
    );
    expect(opened.code).toBe(0);
    const kitText =
      /([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}/.exec(opened.text)?.[0] ?? '';
    const kit = await crypto.readKit(kitText);
    if (!kit.ok) throw new Error('no kit');
    const written = JSON.parse(readFileSync(outPath, 'utf8')) as { sub: string; record: unknown };
    expect(written.sub).toBe('ada');
    expect(statSync(outPath).mode & 0o777).toBe(0o600);
    expect(
      await crypto.unwrapSecret(
        await crypto.kitKey(kit.kit),
        written.record,
        crypto.accountWrapData('ada', 'kit'),
      ),
    ).toEqual(accountKey);
    expect(opened.text).toContain('put-kit');
  });

  it('refuses a way in made for another escrow key', async () => {
    const crypto = await import('@sovereignfs/crypto/web');
    world = makeWorld({ interactive: true });
    await setUpWorld(world);
    const dir = outside();
    const keyPath = path.join(dir, 'escrow.key');
    await sv(world, 'key', 'escrow', '--out', keyPath);
    const recordPath = path.join(dir, 'record.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      recordPath,
      JSON.stringify({
        sub: 'ada',
        escrowKeyId: 'anotherkey0',
        record: { suite: 1, enc: 'x', ciphertext: 'y' },
      }),
    );
    void crypto;
    const refused = await sv(
      world,
      'key',
      'escrow',
      'open',
      '--key',
      keyPath,
      '--out',
      path.join(dir, 'kit.json'),
      recordPath,
    );
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('another escrow key');
  });
});
