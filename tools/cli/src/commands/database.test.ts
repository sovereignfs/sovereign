import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { NOTES_IMAGE, sv, setUpWorld } from '../testing/commands.js';
import { fakeRegistry, makeWorld, manifestOf, type World } from '../testing/world.js';
import type { Suite } from '../suite/types.js';

let world: World;
afterEach(() => world.cleanup());
const suite = () => parse(readFileSync(path.join(world.root, 'suite.yml'), 'utf8')) as Suite;
const raw = () => readFileSync(path.join(world.root, 'suite.yml'), 'utf8');
const lock = () => readFileSync(path.join(world.root, 'suite.lock'), 'utf8');

const STATIC_IMAGE = 'ghcr.io/example/static:1';
/** An instance with `notes`, which has a database, and `static`, which has none. */
async function instance() {
  world = makeWorld({
    images: {
      [NOTES_IMAGE]: { manifest: manifestOf() },
      [STATIC_IMAGE]: {
        manifest: manifestOf({ name: 'Static', prefix: 'STATIC', database: false, generate: [] }),
      },
    },
  });
  await setUpWorld(world, '--deploy', 'ssh');
  await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
  await sv(world, 'app', 'add', 'static', '--image', STATIC_IMAGE, '--yes');
}

describe('sv database', () => {
  it('shows what the defaults give: the server, each role’s pool and limit, and what is left', async () => {
    await instance();
    const done = await sv(world, 'database');
    expect(done.code).toBe(0);
    expect(done.text).toContain('PostgreSQL 18, max_connections 100 (the default)');
    expect(done.text).toMatch(/core\s+pool 10\s+role limit 12/);
    expect(done.text).toMatch(/notes\s+pool 10\s+role limit 12/);
    expect(done.text).toMatch(/static\s+has no database/);
    expect(done.text).toContain('24 of the 97 the server allows');
    expect(done.text).toContain('73 left');
  });

  it('says what is an app’s own, and that the server’s number was chosen', async () => {
    await instance();
    await sv(world, 'database', 'set', '--max-connections', '200');
    await sv(world, 'app', 'update', 'notes', '--connections', '4');
    const done = await sv(world, 'database');
    expect(done.text).toContain('max_connections 200\n');
    expect(done.text).not.toContain('(the default)');
    expect(done.text).toMatch(/notes\s+pool 4\s+role limit 6 \(its own\)/);
  });

  it('answers as JSON', async () => {
    await instance();
    const out = JSON.parse((await sv(world, 'database', '--json')).out.join('\n')) as {
      maxConnections: number;
      roles: { name: string; pool: number; limit: number }[];
      withoutDatabase: string[];
      left: number;
    };
    expect(out.maxConnections).toBe(100);
    expect(out.roles).toEqual([
      { name: 'core', pool: 10, limit: 12 },
      { name: 'notes', pool: 10, limit: 12 },
    ]);
    expect(out.withoutDatabase).toEqual(['static']);
    expect(out.left).toBe(73);
  });

  it('counts an app whose manifest it cannot read as having a database, and says so', async () => {
    await instance();
    world.ctx.registry = fakeRegistry({}).registry;
    const done = await sv(world, 'database');
    expect(done.text).toContain('Could not read the manifest of notes, static');
    expect(done.text).toContain('36 of the 97');
  });
});

describe('sv database set', () => {
  it('writes the numbers, leaves the lock alone, and says what applying them does', async () => {
    await instance();
    const before = lock();
    const done = await sv(
      world,
      'database',
      'set',
      '--max-connections',
      '300',
      '--core',
      '20',
      '--app',
      '6',
    );
    expect(done.code).toBe(0);
    expect(suite().database).toEqual({
      version: '18',
      maxConnections: 300,
      connections: { core: 20, app: 6 },
    });
    expect(lock()).toBe(before);
    expect(done.text).toContain('Run sv push and sv deploy to apply it.');
    expect(done.text).toContain('max_connections goes from 100 to 300');
    expect(done.text).toContain('restarts');
  });

  it('says nothing about a restart when the server’s number is not what changed', async () => {
    await instance();
    const done = await sv(world, 'database', 'set', '--app', '5');
    expect(done.code).toBe(0);
    expect(done.text).not.toContain('restarts');
  });

  it('takes `default` to go back, and leaves no empty map behind', async () => {
    await instance();
    await sv(world, 'database', 'set', '--max-connections', '300', '--core', '20', '--app', '6');
    await sv(world, 'database', 'set', '--core', 'default', '--app', 'default');
    expect(suite().database).toEqual({ version: '18', maxConnections: 300 });
    expect(raw()).not.toContain('connections:');
    await sv(world, 'database', 'set', '--max-connections', 'default');
    expect(suite().database).toEqual({ version: '18' });
  });

  it.each([
    ['--core', '1'],
    ['--core', '101'],
    ['--app', '0'],
    ['--app', 'many'],
    ['--max-connections', '19'],
    ['--max-connections', '1001'],
    ['--max-connections', '100.5'],
  ])('refuses %s %s, changing nothing', async (flag, value) => {
    await instance();
    const before = raw();
    const done = await sv(world, 'database', 'set', flag as string, value as string);
    expect(done.code).toBe(2);
    expect(done.text).toContain('whole number');
    expect(raw()).toBe(before);
  });

  it('refuses numbers that do not fit the server, saying where the connections go, and changes nothing', async () => {
    await instance();
    const before = raw();
    const done = await sv(world, 'database', 'set', '--max-connections', '20');
    expect(done.code).toBe(2);
    expect(done.text).toContain('add up to 24 (core 12, notes 12)');
    expect(done.text).toContain('the server allows 17');
    expect(raw()).toBe(before);
  });

  it('does not count an app that has no database', async () => {
    await instance();
    // core 12 + notes 12 = 24, which 27 less 3 holds; static has no database and takes nothing.
    expect((await sv(world, 'database', 'set', '--max-connections', '27')).code).toBe(0);
  });

  it('refuses with nothing to change, and with a word it does not take', async () => {
    await instance();
    expect((await sv(world, 'database', 'set')).code).toBe(2);
    expect((await sv(world, 'database', 'set', 'now')).code).toBe(2);
    expect((await sv(world, 'database', 'set', '--password', 'x')).code).toBe(2);
  });
});

describe('sv app update --connections', () => {
  it('gives one app its own pool, and takes it back with default', async () => {
    await instance();
    const done = await sv(world, 'app', 'update', 'notes', '--connections', '4');
    expect(done.code).toBe(0);
    expect((suite().apps?.notes as { connections?: number }).connections).toBe(4);
    await sv(world, 'app', 'update', 'notes', '--connections', 'default');
    expect(suite().apps?.notes).not.toHaveProperty('connections');
  });

  it.each(['1', '101', 'x', '5.5'])('refuses %s', async (value) => {
    await instance();
    const before = raw();
    const done = await sv(world, 'app', 'update', 'notes', '--connections', value);
    expect(done.code).toBe(2);
    expect(done.text).toContain('from 2 to 100, or default');
    expect(raw()).toBe(before);
  });

  it('refuses a pool that does not fit the server, changing nothing', async () => {
    await instance();
    const before = raw();
    const done = await sv(world, 'app', 'update', 'notes', '--connections', '100');
    expect(done.code).toBe(2);
    expect(done.text).toContain('add up to 114');
    expect(raw()).toBe(before);
  });

  it('is for a hosted app', async () => {
    await instance();
    await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'Wiki',
      '--redirect',
      'https://w.sovereign.local/cb',
    );
    const done = await sv(world, 'app', 'update', 'wiki', '--connections', '4');
    expect(done.code).toBe(2);
    expect(done.text).toContain('--connections is for hosted apps');
  });
});
