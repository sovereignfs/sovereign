import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTES_IMAGE, sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';
import type { Remote } from '../server/remote.js';

let world: World;
afterEach(() => world.cleanup());

/** A server that answers each request with what a test says, and keeps what it was asked. */
function answering(replies: Record<string, { stdout?: string; code?: number; stderr?: string }>) {
  const asked: string[] = [];
  const remote: Remote = async (_target, words) => {
    const request = words.slice(1).join(' ');
    asked.push(request);
    const reply = replies[request] ?? replies[words[1] as string];
    return { code: reply?.code ?? 0, stdout: reply?.stdout ?? '', stderr: reply?.stderr ?? '' };
  };
  return { asked, remote };
}
const ready = async () => {
  world = makeWorld({ images: { [NOTES_IMAGE]: { manifest: manifestOf() } } });
  await setUpWorld(world, '--deploy', 'ssh');
  await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
  await sv(
    world,
    'app',
    'add',
    'wiki',
    '--external',
    '--name',
    'Wiki',
    '--redirect',
    'https://w.example.com/cb',
  );
};
const head = () => world.git('rev-parse', 'HEAD').trim();

describe('sv status', () => {
  it('compares what runs with the repository: the commit, core’s version, and each app', async () => {
    await ready();
    await sv(world, 'push');
    const state = {
      state: {
        commit: head(),
        core: { version: '0.71.0', healthy: true },
        apps: {
          notes: { kind: 'hosted', healthy: true, version: 'x:1.2.0' },
          old: { kind: 'hosted', healthy: true },
        },
      },
      current: head(),
      containers: [],
      deploying: false,
    };
    const fake = answering({ status: { stdout: JSON.stringify(state) } });
    world.ctx.remote = fake.remote;
    const done = await sv(world, 'status');
    expect(done.code).toBe(0);
    expect(done.text).toContain('which is the repository’s latest commit');
    expect(done.text).toContain('notes: healthy');
    expect(done.text).toContain('wiki: not deployed yet');
    expect(done.text).toContain('old: on the server and not in suite.yml');
    const json = await sv(world, 'status', '--json');
    expect(JSON.parse(json.out.join('\n'))).toMatchObject({ upToDate: true, notInSuite: ['old'] });
  });

  it('says so when the server is behind, and when nothing has been deployed', async () => {
    await ready();
    await sv(world, 'push');
    world.ctx.remote = answering({
      status: {
        stdout: JSON.stringify({
          state: { commit: 'b'.repeat(40), core: { version: '0.70.0', healthy: true }, apps: {} },
          containers: [],
          deploying: true,
        }),
      },
    }).remote;
    const behind = await sv(world, 'status');
    expect(behind.text).toContain('bbbbbbbbbbbb');
    expect(behind.text).toContain('suite.yml wants 0.71.0');
    expect(behind.text).toContain('a deployment is running');
    world.ctx.remote = answering({
      status: { stdout: JSON.stringify({ state: null, containers: [], deploying: false }) },
    }).remote;
    expect((await sv(world, 'status')).text).toContain('Nothing has been deployed yet');
  });

  it('says to prepare the server when it has not been', async () => {
    await ready();
    world.ctx.remote = answering({
      status: { code: 127, stderr: 'sh: sovereign-receive: not found' },
    }).remote;
    const done = await sv(world, 'status');
    expect(done.code).toBe(2);
    expect(done.text).toContain('sv server bootstrap');
  });
});

describe('sv logs', () => {
  it('asks for the last deployment unless told, and for what it is told', async () => {
    await ready();
    const fake = answering({ logs: { stdout: 'line one\nline two\n' } });
    world.ctx.remote = fake.remote;
    const done = await sv(world, 'logs');
    expect(done.text).toContain('line two');
    await sv(world, 'logs', 'notes', '--lines', '20');
    expect(fake.asked).toEqual(['logs deploy 200', 'logs notes 20']);
    expect((await sv(world, 'logs', '--lines', 'many')).code).toBe(2);
  });
});

describe('sv app show', () => {
  it('shows an app’s record without its secret, and the secret alone when asked', async () => {
    await ready();
    const fake = answering({
      'app notes': {
        stdout: JSON.stringify({
          name: 'notes',
          kind: 'hosted',
          clientId: 'c1',
          healthy: true,
          database: 'app_notes',
        }),
      },
      'app notes --secret': { stdout: 's3cret\n' },
    });
    world.ctx.remote = fake.remote;
    const plain = await sv(world, 'app', 'show', 'notes');
    expect(plain.text).toContain('https://notes.sovereign.example.com');
    expect(plain.text).toContain('c1');
    expect(plain.text).not.toContain('s3cret');
    const secret = await sv(world, 'app', 'show', 'notes', '--secret');
    expect(secret.out).toEqual(['s3cret']);
    expect((await sv(world, 'app', 'show', 'ghost')).code).toBe(2);
  });
});

describe('sv secret rotate', () => {
  it('warns that the old secret stops working, needs a yes, and rotates', async () => {
    await ready();
    const fake = answering({ 'rotate wiki': { stdout: '{"rotated":"wiki"}' } });
    world.ctx.remote = fake.remote;
    const refused = await sv(world, 'secret', 'rotate', 'wiki');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('stops working at once');
    expect(refused.text).toContain('--yes');
    expect(fake.asked).toEqual([]);
    const done = await sv(world, 'secret', 'rotate', 'wiki', '--yes');
    expect(done.code).toBe(0);
    expect(fake.asked).toEqual(['rotate wiki']);
    expect(done.text).toContain('sv app show wiki --secret');
  });
});

describe('sv doctor', () => {
  const server = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      protocol: 1,
      docker: { engine: '27.0.1', compose: '2.29.1' },
      freeBytes: 20 * 1024 ** 3,
      toolkitImage: null,
      ...extra,
    });

  it('passes when the server, DNS and the ports are as they should be', async () => {
    await ready();
    world.ctx.remote = answering({ doctor: { stdout: server() } }).remote;
    world.ctx.network = {
      resolve: async () => ['203.0.113.7'],
      reachable: async () => true,
    };
    const done = await sv(world, 'doctor');
    expect(done.code).toBe(0);
    expect(done.text).toContain('DNS for sovereign.example.com');
    expect(done.text).toContain('DNS for notes.sovereign.example.com');
    expect(done.text).not.toContain('FAIL');
    expect(JSON.parse((await sv(world, 'doctor', '--json')).out.join('\n')).ok).toBe(true);
  });

  it('says what to fix: a name that points elsewhere, a closed port, an old Docker, a server not prepared', async () => {
    await ready();
    world.ctx.remote = answering({
      doctor: {
        stdout: server({ docker: { engine: '20.10.0', compose: '1.29.2' }, freeBytes: 100 }),
      },
    }).remote;
    world.ctx.network = { resolve: async () => ['198.51.100.9'], reachable: async () => false };
    const done = await sv(world, 'doctor');
    expect(done.code).toBe(1);
    expect(done.text).toContain('FAIL  Docker');
    expect(done.text).toContain('FAIL  Disk');
    expect(done.text).toContain('Point sovereign.example.com at 203.0.113.7');
    expect(done.text).toContain('FAIL  Port 443');
    world.ctx.remote = answering({ doctor: { code: 127, stderr: 'not found' } }).remote;
    expect((await sv(world, 'doctor')).text).toContain('Run sv server bootstrap');
  });

  it('only warns about DNS and ports when the certificates are the proxy’s own', async () => {
    await ready();
    const path_ = path.join(world.root, 'suite.yml');
    (await import('node:fs')).writeFileSync(
      path_,
      readFileSync(path_, 'utf8').replace('mode: per-host', 'mode: internal'),
    );
    world.ctx.remote = answering({ doctor: { stdout: server() } }).remote;
    world.ctx.network = { resolve: async () => ['192.168.1.5'], reachable: async () => false };
    const done = await sv(world, 'doctor');
    expect(done.code).toBe(0);
    expect(done.text).toContain('warn  DNS');
  });
});
