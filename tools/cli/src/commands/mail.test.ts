import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import type { Target } from '../server/remote.js';
import type { Suite } from '../suite/types.js';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';

let world: World;
afterEach(() => world.cleanup());

type Opened = { target: Target; local: number; remote: number };
function tunnelling(code = 0) {
  const opened: Opened[] = [];
  world.ctx.tunnel = async (target, local, remote) => {
    opened.push({ target, local, remote });
    return code;
  };
  return opened;
}

describe('sv mail', () => {
  it('opens the inbox on this machine through ssh to the server, until it is closed', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh', '--environment', 'development', '--port', '2222');
    const opened = tunnelling();
    const done = await sv(world, 'mail');
    expect(done.code).toBe(0);
    expect(opened).toEqual([
      { target: { host: '203.0.113.7', port: 2222, user: 'root' }, local: 8025, remote: 8025 },
    ]);
    expect(done.text).toContain('http://localhost:8025');
  });

  it('takes another local port, and refuses one it cannot use', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh', '--environment', 'staging');
    const opened = tunnelling();
    expect((await sv(world, 'mail', '--port', '9025')).code).toBe(0);
    expect(opened[0]).toMatchObject({ local: 9025, remote: 8025 });
    for (const bad of ['80', 'abc', '70000']) {
      const refused = await sv(world, 'mail', '--port', bad);
      expect(refused.code, bad).toBe(2);
    }
    expect(opened).toHaveLength(1);
  });

  it('says there is no inbox on production, and opens no tunnel', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    const opened = tunnelling();
    const done = await sv(world, 'mail');
    expect(done.code).toBe(2);
    expect(done.text).toContain('production instance has no inbox');
    expect(opened).toEqual([]);
  });

  it('says there is no inbox when the operator named a mail server of their own', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh', '--environment', 'staging');
    const file = path.join(world.root, 'suite.yml');
    const suite = parse(readFileSync(file, 'utf8')) as Suite;
    suite.core.env = { SV_SMTP_HOST: 'smtp.sovereign.local' };
    writeFileSync(file, stringify(suite));
    const opened = tunnelling();
    const done = await sv(world, 'mail');
    expect(done.code).toBe(2);
    expect(done.text).toContain('SV_SMTP_HOST');
    expect(opened).toEqual([]);
  });

  it('fails, and says what to try, when the tunnel ends with an error', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh', '--environment', 'development');
    tunnelling(255);
    const done = await sv(world, 'mail');
    expect(done.code).toBe(1);
    expect(done.text).toContain('--port');
  });
});
