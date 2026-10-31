import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { realExec } from '../context.js';
import { readArchive } from '../server/tar.js';
import { isKnownPath } from '../suite/files.js';
import { sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, type World } from '../testing/world.js';
import type { Remote } from '../server/remote.js';

let world: World;
afterEach(() => world.cleanup());
const write = (name: string, text: string) => {
  mkdirSync(path.dirname(path.join(world.root, name)), { recursive: true });
  writeFileSync(path.join(world.root, name), text);
};

type Call = { words: string[]; input: Buffer };
function server(code = 0, lines: string[] = ['Applied.'], stderr = '') {
  const calls: Call[] = [];
  const remote: Remote = async (_target, words, options) => {
    calls.push({ words: [...words], input: Buffer.from(options?.input ?? '') });
    for (const line of lines) options?.onStdout?.(`${line}\n`);
    return { code, stdout: lines.join('\n'), stderr };
  };
  return { calls, remote };
}
const ready = async (...extra: string[]) => {
  world = makeWorld();
  await setUpWorld(world, '--deploy', 'ssh', ...extra);
};

describe('sv deploy', () => {
  it('sends the files of the pushed commit and nothing else, asks the server to deploy that commit, and shows what it prints', async () => {
    await ready();
    write('overrides/compose/core.yml', 'services: {}\n');
    write('notes-to-self.txt', 'not an instance file');
    await sv(world, 'push');
    const commit = world.git('rev-parse', 'HEAD').trim();
    const fake = server();
    world.ctx.remote = fake.remote;
    const done = await sv(world, 'deploy');
    expect(done.code).toBe(0);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.words).toEqual(['/usr/local/sbin/sovereign-receive', 'deploy', commit]);
    const names = readArchive(fake.calls[0]?.input as Buffer, isKnownPath)
      .map((e) => e.name)
      .sort();
    expect(names).toEqual(['overrides/compose/core.yml', 'suite.lock', 'suite.yml']);
    expect(done.text).toContain('Applied.');
    expect(done.text).toContain(`Deployed ${commit.slice(0, 12)}`);
  });

  it('sends what was committed, not what is in the folder', async () => {
    await ready();
    await sv(world, 'push');
    const committed = readFileSync(path.join(world.root, 'suite.yml'), 'utf8');
    const fake = server();
    world.ctx.remote = fake.remote;
    writeFileSync(path.join(world.root, 'notes.txt'), 'x');
    expect((await sv(world, 'deploy')).code).toBe(0);
    const sent = readArchive(fake.calls[0]?.input as Buffer, isKnownPath).find(
      (e) => e.name === 'suite.yml',
    );
    expect(sent?.data.toString()).toBe(committed);
  });

  it('refuses work that is not committed or not pushed, and a branch that has never been pushed, reaching nothing', async () => {
    await ready();
    const fake = server();
    world.ctx.remote = fake.remote;
    const nothing = await sv(world, 'deploy');
    expect(nothing.code).toBe(2);
    await sv(world, 'push');
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      `${readFileSync(path.join(world.root, 'suite.yml'), 'utf8')}\n# edited\n`,
    );
    const dirty = await sv(world, 'deploy');
    expect(dirty.code).toBe(2);
    expect(dirty.text).toContain('not committed');
    world.git('commit', '-am', 'by hand');
    const unpushed = await sv(world, 'deploy');
    expect(unpushed.code).toBe(2);
    expect(unpushed.text).toContain('not pushed');
    expect(fake.calls).toHaveLength(0);
  });

  it('ends as the server says: locked is 3, refused is 2, a lost connection is a failure that names ssh', async () => {
    await ready();
    await sv(world, 'push');
    for (const [code, expected, text] of [
      [3, 3, 'Another deployment is running.'],
      [2, 2, 'The archive holds a file that is not an instance file: x.'],
      [255, 1, 'ssh: connect to host 203.0.113.7 port 22: Connection refused'],
      [1, 1, 'Core did not become healthy.'],
    ] as const) {
      world.ctx.remote = server(code, [], text).remote;
      const done = await sv(world, 'deploy');
      expect(done.code, text).toBe(expected);
      expect(done.text).toContain(text);
    }
  });

  it('uses server.deploy when told nothing, refuses when that says nothing, and says what --github needs', async () => {
    await ready();
    await sv(world, 'push');
    world.ctx.remote = server().remote;
    expect((await sv(world, 'deploy')).code).toBe(0);
    const github = await sv(world, 'deploy', '--github');
    expect(github.code).toBe(2);
    expect(github.text).toContain('There is no .github/workflows/deploy.yml');
    const both = await sv(world, 'deploy', '--ssh', '--github');
    expect(both.code).toBe(2);
    const text = readFileSync(path.join(world.root, 'suite.yml'), 'utf8').replace(
      /\n {2}deploy: ssh/,
      '',
    );
    writeFileSync(path.join(world.root, 'suite.yml'), text);
    world.git('commit', '-am', 'no method');
    world.git('push');
    const none = await sv(world, 'deploy');
    expect(none.code).toBe(2);
    expect(none.text).toContain('Say how to deploy');
  });

  it('clears the record of a purge once the deployment has gone through', async () => {
    await ready();
    const text = `${readFileSync(path.join(world.root, 'suite.yml'), 'utf8')}purge:\n  - notes\n`;
    writeFileSync(path.join(world.root, 'suite.yml'), text);
    await sv(world, 'push');
    world.ctx.remote = server().remote;
    const done = await sv(world, 'deploy');
    expect(done.code).toBe(0);
    expect(parse(readFileSync(path.join(world.root, 'suite.yml'), 'utf8')).purge).toBeUndefined();
    expect(done.text).toContain('no longer recorded');
  });
});

describe('sv deploy --github', () => {
  it('starts the workflow on the pushed commit, with the branch, and says how to watch it', async () => {
    await ready();
    write('.github/workflows/deploy.yml', 'name: Deploy\n');
    await sv(world, 'push');
    const ran: { command: string; args: string[] }[] = [];
    world.ctx.exec = async (command, args, options) => {
      ran.push({ command, args: [...args] });
      if (command === 'gh') return { code: 0, stdout: '', stderr: '' };
      return realExec(command, args, options);
    };
    const done = await sv(world, 'deploy', '--github');
    expect(done.code).toBe(0);
    expect(ran.find((r) => r.command === 'gh')).toEqual({
      command: 'gh',
      args: ['workflow', 'run', 'deploy.yml', '--ref', 'main'],
    });
    expect(done.text).toContain('gh run watch');
  });

  it('refuses work that is not pushed, and says what to install when the GitHub CLI is not there', async () => {
    await ready();
    write('.github/workflows/deploy.yml', 'name: Deploy\n');
    expect((await sv(world, 'deploy', '--github')).code).toBe(2);
    await sv(world, 'push');
    world.ctx.exec = async (command, args, options) =>
      command === 'gh'
        ? { code: 127, stdout: '', stderr: 'gh: command not found' }
        : realExec(command, args, options);
    const done = await sv(world, 'deploy', '--github');
    expect(done.code).toBe(1);
    expect(done.text).toContain('gh auth login');
  });
});

describe('sv deploy --ci (a runner)', () => {
  const HOST_KEY =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
  const withHostKey = () => {
    const file = path.join(world.root, 'suite.yml');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'host: 203.0.113.7',
        `host: 203.0.113.7\n  hostKey: ${HOST_KEY}`,
      ),
    );
    world.git('commit', '-am', 'host key');
  };

  it('deploys the checkout with the deployment key and the server’s host key, from files that are gone afterwards', async () => {
    await ready();
    await sv(world, 'push');
    withHostKey();
    const seen: {
      identity: string;
      known: string;
      file: string;
      known_file: string;
      words: string[];
    }[] = [];
    world.ctx.env = { ...world.ctx.env, SV_DEPLOY_KEY: 'PRIVATE-KEY-TEXT' };
    world.ctx.remote = async (target, words) => {
      seen.push({
        identity: readFileSync(target.identityFile as string, 'utf8'),
        known: readFileSync(target.knownHostsFile as string, 'utf8'),
        file: target.identityFile as string,
        known_file: target.knownHostsFile as string,
        words: [...words],
      });
      return { code: 0, stdout: '', stderr: '' };
    };
    const done = await sv(world, 'deploy', '--ci');
    expect(done.code).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.identity).toBe('PRIVATE-KEY-TEXT\n');
    expect(seen[0]?.known).toBe(`203.0.113.7 ${HOST_KEY}\n`);
    expect(seen[0]?.words.slice(0, 2)).toEqual(['/usr/local/sbin/sovereign-receive', 'deploy']);
    expect(existsSync(seen[0]?.file as string)).toBe(false);
    expect(existsSync(seen[0]?.known_file as string)).toBe(false);
    expect(done.text).not.toContain('PRIVATE-KEY-TEXT');
  });

  it('uses a bracketed host for another port, and does not need the commit to be pushed', async () => {
    await ready();
    await sv(world, 'push');
    const file = path.join(world.root, 'suite.yml');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'host: 203.0.113.7',
        `host: 203.0.113.7\n  port: 2222\n  hostKey: ${HOST_KEY}`,
      ),
    );
    world.git('commit', '-am', 'port');
    world.ctx.env = { ...world.ctx.env, SV_DEPLOY_KEY: 'k' };
    let known = '';
    world.ctx.remote = async (target) => {
      known = readFileSync(target.knownHostsFile as string, 'utf8');
      return { code: 0, stdout: '', stderr: '' };
    };
    expect((await sv(world, 'deploy', '--ci')).code).toBe(0);
    expect(known).toBe(`[203.0.113.7]:2222 ${HOST_KEY}\n`);
  });

  it('refuses without the key, without the server’s host key, and on a checkout that is not clean, reaching nothing', async () => {
    await ready();
    await sv(world, 'push');
    let reached = false;
    world.ctx.remote = async () => ((reached = true), { code: 0, stdout: '', stderr: '' });
    const noKey = await sv(world, 'deploy', '--ci');
    expect(noKey.code).toBe(2);
    expect(noKey.text).toContain('SV_DEPLOY_KEY is not set');
    world.ctx.env = { ...world.ctx.env, SV_DEPLOY_KEY: 'k' };
    const noHost = await sv(world, 'deploy', '--ci');
    expect(noHost.code).toBe(2);
    expect(noHost.text).toContain('host key');
    withHostKey();
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      `${readFileSync(path.join(world.root, 'suite.yml'), 'utf8')}\n# edited\n`,
    );
    expect((await sv(world, 'deploy', '--ci')).code).toBe(2);
    expect(reached).toBe(false);
  });

  it('passes the key by file and never on a command line', async () => {
    const { sshArgs } = await import('../server/remote.js');
    const args = sshArgs(
      { host: 'h', user: 'root', identityFile: '/tmp/k', knownHostsFile: '/tmp/kh' },
      ['x'],
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '-i',
        '/tmp/k',
        'IdentitiesOnly=yes',
        'BatchMode=yes',
        'UserKnownHostsFile=/tmp/kh',
        'StrictHostKeyChecking=yes',
      ]),
    );
    expect(args.indexOf('--')).toBeGreaterThan(args.indexOf('-i'));
    expect(args.join(' ')).not.toContain('PRIVATE');
  });
});
