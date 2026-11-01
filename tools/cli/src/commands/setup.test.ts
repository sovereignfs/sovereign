import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';
import type { Lock, Suite } from '../suite/types.js';
import { RELEASE } from '../release.js';
import { Failed } from '../errors.js';

let world: World;
afterEach(() => world.cleanup());
const read = (file: string) => readFileSync(path.join(world.root, file), 'utf8');

describe('sv setup', () => {
  it('writes suite.yml and suite.lock from flags, with no terminal, and makes the operator’s key', async () => {
    world = makeWorld();
    const done = await setUpWorld(
      world,
      '--deploy',
      'ssh',
      '--tls',
      'per-host',
      '--tls-email',
      'op@sovereign.local',
    );
    expect(done.code).toBe(0);
    const suite = parse(read('suite.yml')) as Suite;
    expect(suite).toMatchObject({
      schema: 1,
      domain: 'sovereign.local',
      database: { version: '18' },
      server: { host: '203.0.113.7', deploy: 'ssh' },
      tls: { mode: 'per-host', email: 'op@sovereign.local' },
    });
    expect(suite.secrets.recipients).toHaveLength(1);
    const key = read('../home/config/age.key');
    expect(key).toContain(`public key: ${suite.secrets.recipients[0]}`);
    expect(statSync(world.ctx.keyFile).mode & 0o777).toBe(0o600);
    const lock = parse(read('suite.lock')) as Lock;
    expect(Object.keys(lock.images).sort()).toEqual(['cli', 'core', 'database', 'proxy']);
    expect(lock.images.database.ref).toBe('postgres:18');
    expect(lock.apps).toBeUndefined();
    expect(done.text).toContain('Made your key');
    expect(read('suite.lock')).toMatch(/^# Written by sv\. Do not edit it by hand/);
  });

  it('starts the instance on the newest core that is published and supported, and pins that image', async () => {
    world = makeWorld({ coreTags: [RELEASE.newestCore, '0.99.3', '0.99.10', '1.0.0', 'latest'] });
    const done = await setUpWorld(world);
    expect((parse(read('suite.yml')) as Suite).core.version).toBe('0.99.10');
    expect((parse(read('suite.lock')) as Lock).images.core.ref).toBe(
      `${RELEASE.images.core}:0.99.10`,
    );
    expect(done.text).not.toContain('Could not look up');
  });

  it('starts on the core this toolkit was made for when nothing newer is published', async () => {
    world = makeWorld({ coreTags: [RELEASE.newestCore] });
    await setUpWorld(world);
    expect((parse(read('suite.yml')) as Suite).core.version).toBe(RELEASE.newestCore);
  });

  it('still sets up, on that core, and says why, when the registry cannot be asked', async () => {
    world = makeWorld({ coreTags: new Failed('Could not reach ghcr.io: offline.') });
    const done = await setUpWorld(world);
    expect(done.code).toBe(0);
    expect((parse(read('suite.yml')) as Suite).core.version).toBe(RELEASE.newestCore);
    expect(done.text).toContain('Could not look up the newest core');
    expect(done.text).toContain('Could not reach ghcr.io: offline');
  });

  it('keeps the key it made out of the repository and out of what it says', async () => {
    world = makeWorld();
    const done = await setUpWorld(world);
    const identity = /AGE-SECRET-KEY-1\w+/.exec(readFileSync(world.ctx.keyFile, 'utf8'))?.[0] ?? '';
    expect(identity).not.toBe('');
    expect(done.text).not.toContain(identity);
    expect(read('suite.yml')).not.toContain(identity);
    expect(path.relative(world.root, world.ctx.keyFile).startsWith('..')).toBe(true);
  });

  it('asks for what it is not given when there is a terminal, with answers as defaults', async () => {
    world = makeWorld({
      interactive: true,
      answers: ['sovereign.local', '', 'ssh', 'internal', ''],
    });
    const done = await sv(world, 'setup');
    expect(done.code).toBe(0);
    const suite = parse(read('suite.yml')) as Suite;
    // The server defaulted to the domain, and the certificates to the internal authority.
    expect(suite.server.host).toBe('sovereign.local');
    expect(suite.tls).toEqual({ mode: 'internal' });
  });

  it('refuses, saying which flag to pass, when it would have to ask and there is nobody to', async () => {
    world = makeWorld();
    const done = await sv(world, 'setup');
    expect(done.code).toBe(2);
    expect(done.text).toContain('Pass --domain.');
    expect(existsSync(path.join(world.root, 'suite.yml'))).toBe(false);
  });

  it('writes nothing when what it was given is not valid', async () => {
    world = makeWorld();
    const done = await sv(
      world,
      'setup',
      '--domain',
      'Not A Domain',
      '--host',
      'h.sovereign.local',
    );
    expect(done.code).toBe(2);
    expect(done.text).toContain('domain');
    expect(existsSync(path.join(world.root, 'suite.yml'))).toBe(false);
    expect(existsSync(path.join(world.root, 'suite.lock'))).toBe(false);
  });

  it('will not write over a suite.yml that is there', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const before = read('suite.yml');
    const done = await sv(world, 'setup', '--domain', 'other.sovereign.local', '--host', 'h');
    expect(done.code).toBe(2);
    expect(done.text).toContain('already here');
    expect(read('suite.yml')).toBe(before);
  });

  it('reuses a key that is there, and says so', async () => {
    world = makeWorld();
    await setUpWorld(world);
    const recipient = (parse(read('suite.yml')) as Suite).secrets.recipients[0];
    const second = makeWorld();
    try {
      second.ctx.keyFile = world.ctx.keyFile;
      const done = await setUpWorld(second);
      expect(done.text).toContain('Used your key');
      expect(
        (parse(readFileSync(path.join(second.root, 'suite.yml'), 'utf8')) as Suite).secrets
          .recipients[0],
      ).toBe(recipient);
    } finally {
      second.cleanup();
    }
  });

  it('writes the workflow that deploys from GitHub, calling the toolkit’s at this version, only for deploy: github', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'github');
    const workflow = read('.github/workflows/deploy.yml');
    expect(workflow).toContain(
      `sovereignfs/sovereign/.github/workflows/deploy.yml@cli-v${RELEASE.version}`,
    );
    expect(workflow).toContain('SV_DEPLOY_KEY: ${{ secrets.SV_DEPLOY_KEY }}');
    expect(workflow).not.toMatch(/AGE|age\.key|SECRET_KEY/);
    world.cleanup();
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    expect(existsSync(path.join(world.root, '.github/workflows/deploy.yml'))).toBe(false);
  });

  it('writes the environment, and pins Mailpit only when the instance is not production', async () => {
    world = makeWorld();
    const done = await setUpWorld(world, '--deploy', 'ssh', '--environment', 'staging');
    expect(done.code).toBe(0);
    expect((parse(read('suite.yml')) as Suite).environment).toBe('staging');
    expect((parse(read('suite.lock')) as Lock).images.mail?.ref).toBe(RELEASE.images.mail);
    expect(done.text).toContain('sv mail');
    world.cleanup();

    world = makeWorld();
    const production = await setUpWorld(world, '--deploy', 'ssh');
    expect((parse(read('suite.yml')) as Suite).environment).toBe('production');
    expect((parse(read('suite.lock')) as Lock).images.mail).toBeUndefined();
    expect(production.text).not.toContain('Mailpit');
  });

  it('refuses an environment it does not know, and writes nothing', async () => {
    world = makeWorld();
    const done = await sv(
      world,
      'setup',
      '--domain',
      'sovereign.local',
      '--host',
      '203.0.113.7',
      '--environment',
      'testing',
    );
    expect(done.code).toBe(2);
    expect(done.text).toContain('development, staging or production');
    expect(existsSync(path.join(world.root, 'suite.yml'))).toBe(false);
  });
});
