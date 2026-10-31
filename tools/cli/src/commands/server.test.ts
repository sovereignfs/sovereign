import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { parse } from 'yaml';
import type { Remote } from '../server/remote.js';
import { decryptValue } from '../secrets/store.js';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';
import type { Suite } from '../suite/types.js';
import { parse as parseYaml } from 'yaml';

let world: World;
afterEach(() => world.cleanup());
const suite = () => parse(readFileSync(path.join(world.root, 'suite.yml'), 'utf8')) as Suite;

type Call = { user: string; words: string[]; input: string };
async function serverAnswering(extra: string[] = []) {
  const identity = await generateX25519Identity();
  const recipient = await identityToRecipient(identity);
  const calls: Call[] = [];
  const answer =
    (stdout: string, code = 0, stderr = ''): Remote =>
    async (target, words, options) => {
      calls.push({ user: target.user, words: [...words], input: String(options?.input ?? '') });
      options?.onStderr?.('sv: Ready.\n');
      return { code, stdout, stderr };
    };
  return {
    identity,
    recipient,
    calls,
    answer,
    lines: [`SV_SERVER_KEY=${recipient}`, ...extra].join('\n'),
  };
}

describe('sv server bootstrap', () => {
  it('runs the script as root, adds the server’s key to suite.yml, and re-encrypts what is held so the server can read it', async () => {
    world = makeWorld({ stdin: 'a-secret-value' });
    await setUpWorld(world, '--deploy', 'ssh');
    expect((await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD')).code).toBe(0);
    const server = await serverAnswering();
    world.ctx.remote = server.answer(server.lines);
    const done = await sv(world, 'server', 'bootstrap');
    expect(done.code).toBe(0);
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.words).toEqual(['sh', '-s']);
    expect(server.calls[0]?.input).toContain('ghcr.io/sovereignfs/cli');
    expect(server.calls[0]?.input).toContain("DEPLOY_KEY=''");
    expect(suite().secrets.recipients).toContain(server.recipient);
    const secrets = parse(readFileSync(path.join(world.root, 'secrets.age.yml'), 'utf8')) as {
      core: Record<string, string>;
    };
    expect(await decryptValue(secrets.core.SV_SMTP_PASSWORD as string, server.identity)).toBe(
      'a-secret-value',
    );
    expect(done.text).toContain('sv push');
  });

  it('writes the server’s host key to suite.yml, so a runner can check the machine, and says when it changes', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'github');
    const first =
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const second =
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const server = await serverAnswering(['SV_DEPLOY_KEY=installed', `SV_HOST_KEY=${first}`]);
    world.ctx.remote = server.answer(server.lines);
    const done = await sv(world, 'server', 'bootstrap');
    expect(suite().server.hostKey).toBe(first);
    expect(done.text).toContain('Wrote the server’s host key');
    const again = await serverAnswering([`SV_HOST_KEY=${second}`]);
    world.ctx.remote = again.answer(`SV_SERVER_KEY=${server.recipient}\nSV_HOST_KEY=${second}`);
    const changed = await sv(world, 'server', 'bootstrap');
    expect(suite().server.hostKey).toBe(second);
    expect(changed.text).toContain('host key has changed');
  });

  it('is safe to run again: the key is already there, and nothing is added twice', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    const server = await serverAnswering();
    world.ctx.remote = server.answer(server.lines);
    await sv(world, 'server', 'bootstrap');
    const again = await sv(world, 'server', 'bootstrap');
    expect(again.code).toBe(0);
    expect(suite().secrets.recipients.filter((r) => r === server.recipient)).toHaveLength(1);
    expect(again.text).toContain('already in suite.yml');
  });

  it('goes through sudo, without a password, for a user who is not root', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    const text = readFileSync(path.join(world.root, 'suite.yml'), 'utf8').replace(
      'host: 203.0.113.7',
      'host: 203.0.113.7\n  user: ops',
    );
    (await import('node:fs')).writeFileSync(path.join(world.root, 'suite.yml'), text);
    const server = await serverAnswering();
    world.ctx.remote = server.answer(server.lines);
    expect((await sv(world, 'server', 'bootstrap')).code).toBe(0);
    expect(server.calls[0]).toMatchObject({ user: 'ops', words: ['sudo', '-n', 'sh', '-s'] });
  });

  it('makes the deployment key here for deploy: github, gives the server only the public half, and prints the private half once', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'github');
    const server = await serverAnswering(['SV_DEPLOY_KEY=installed']);
    world.ctx.remote = server.answer(server.lines);
    const done = await sv(world, 'server', 'bootstrap');
    expect(done.code).toBe(0);
    expect(server.calls[0]?.input).toMatch(/DEPLOY_KEY='ssh-ed25519 [A-Za-z0-9+/=]+'/);
    expect(server.calls[0]?.input).not.toContain('PRIVATE KEY');
    expect(done.out.join('\n')).toContain('BEGIN OPENSSH PRIVATE KEY');
    expect(done.err.join('\n')).not.toContain('PRIVATE KEY');
  });

  it('prints no private key when the server kept the one it had', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'github');
    const server = await serverAnswering(['SV_DEPLOY_KEY=kept']);
    world.ctx.remote = server.answer(server.lines);
    const done = await sv(world, 'server', 'bootstrap');
    expect(done.code).toBe(0);
    expect(done.out.join('\n')).not.toContain('PRIVATE KEY');
  });

  it('says what to do when ssh does not work, and when the server refuses', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    const server = await serverAnswering();
    world.ctx.remote = server.answer(
      '',
      255,
      'ssh: connect to host 203.0.113.7 port 22: Connection refused',
    );
    const down = await sv(world, 'server', 'bootstrap');
    expect(down.code).toBe(1);
    expect(down.text).toContain('Connection refused');
    expect(down.text).toContain('server.host');
    world.ctx.remote = server.answer('', 2, 'sv: This must run as root.');
    const refused = await sv(world, 'server', 'bootstrap');
    expect(refused.code).toBe(2);
    expect(
      parseYaml(readFileSync(path.join(world.root, 'suite.yml'), 'utf8')).secrets.recipients,
    ).toHaveLength(1);
  });

  it('refuses an answer that holds no key, changing nothing', async () => {
    world = makeWorld();
    await setUpWorld(world, '--deploy', 'ssh');
    const server = await serverAnswering();
    world.ctx.remote = server.answer('nothing useful');
    const done = await sv(world, 'server', 'bootstrap');
    expect(done.code).toBe(1);
    expect(suite().secrets.recipients).toHaveLength(1);
  });
});
