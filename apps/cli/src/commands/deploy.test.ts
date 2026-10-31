import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
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

  it('uses server.deploy when told nothing, refuses when that says nothing, and says --github is not here yet', async () => {
    await ready();
    await sv(world, 'push');
    world.ctx.remote = server().remote;
    expect((await sv(world, 'deploy')).code).toBe(0);
    const github = await sv(world, 'deploy', '--github');
    expect(github.code).toBe(2);
    expect(github.text).toContain('not in this version');
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
