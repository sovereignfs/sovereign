import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import type { Remote } from '../server/remote.js';
import type { Suite } from '../suite/types.js';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';

let world: World;
afterEach(() => world.cleanup());

/** A server that answers `seed` with what a test says, and keeps what it was asked. */
function server(reply: { stdout?: string; code?: number; stderr?: string } = {}) {
  const asked: string[] = [];
  const remote: Remote = async (_target, words) => {
    asked.push(words.slice(1).join(' '));
    return { code: reply.code ?? 0, stdout: reply.stdout ?? '', stderr: reply.stderr ?? '' };
  };
  return { asked, remote };
}
const instance = async (environment: string) => {
  world = makeWorld();
  await setUpWorld(world, '--deploy', 'ssh', '--environment', environment);
};

describe('sv seed', () => {
  it.each(['development', 'staging'])(
    'asks the server to seed a %s instance, and prints what it answers',
    async (environment) => {
      await instance(environment);
      const fake = server({ stdout: 'owner@sovereign.local\tplatform:owner\tpassword: abc\n' });
      world.ctx.remote = fake.remote;
      const done = await sv(world, 'seed');
      expect(done.code).toBe(0);
      expect(fake.asked).toEqual(['seed']);
      expect(done.text).toContain('owner@sovereign.local\tplatform:owner\tpassword: abc');
    },
  );

  it('passes --json on', async () => {
    await instance('development');
    const fake = server({ stdout: '{"ok":true}\n' });
    world.ctx.remote = fake.remote;
    await sv(world, 'seed', '--json');
    expect(fake.asked).toEqual(['seed --json']);
  });

  it('is refused on a production instance, and on one that does not say, before it connects', async () => {
    for (const environment of ['production', undefined]) {
      world = makeWorld();
      await setUpWorld(world, '--deploy', 'ssh');
      if (environment === undefined) {
        const file = path.join(world.root, 'suite.yml');
        const suite = parse(readFileSync(file, 'utf8')) as Suite;
        delete suite.environment;
        writeFileSync(file, stringify(suite));
      }
      const fake = server();
      world.ctx.remote = fake.remote;
      const done = await sv(world, 'seed');
      expect(done.code).toBe(2);
      expect(done.text).toContain('never seeded');
      expect(fake.asked).toEqual([]);
      world.cleanup();
    }
  });

  it('refuses what it was not given to do', async () => {
    await instance('development');
    world.ctx.remote = server().remote;
    expect((await sv(world, 'seed', 'now')).code).toBe(2);
    expect((await sv(world, 'seed', '--password', 'x')).code).toBe(2);
  });

  it('says core’s own refusal as a refusal', async () => {
    await instance('staging');
    world.ctx.remote = server({
      code: 2,
      stderr: 'This instance has 1 account that no seed made, so it is not seeded.',
    }).remote;
    const done = await sv(world, 'seed');
    expect(done.code).toBe(2);
    expect(done.text).toContain('no seed made');
  });
});
