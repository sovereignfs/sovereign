import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTES_IMAGE, sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';
import type { Remote } from '../server/remote.js';
import { RELEASE } from '../release.js';

/** The core `sv setup` writes into suite.yml. */
const CORE = RELEASE.newestCore;

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
    'https://w.sovereign.local/cb',
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
        core: { version: CORE, healthy: true },
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
    expect(behind.text).toContain(`suite.yml wants ${CORE}`);
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
    expect(plain.text).toContain('https://notes.sovereign.local');
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
    expect(done.text).toContain('DNS for sovereign.local');
    expect(done.text).toContain('DNS for notes.sovereign.local');
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
    expect(done.text).toContain('Point sovereign.local at 203.0.113.7');
    expect(done.text).toContain('FAIL  Port 443');
    world.ctx.remote = answering({ doctor: { code: 127, stderr: 'not found' } }).remote;
    expect((await sv(world, 'doctor')).text).toContain('Run sv server bootstrap');
  });

  it('says what the server answered when it is prepared but cannot run the toolkit, and not that it is unprepared', async () => {
    await ready();
    world.ctx.remote = answering({
      doctor: {
        code: 1,
        stderr:
          'permission denied while trying to connect to the docker API at unix:///var/run/docker.sock',
      },
    }).remote;
    world.ctx.network = { resolve: async () => ['203.0.113.7'], reachable: async () => true };
    const done = await sv(world, 'doctor');
    expect(done.code).toBe(1);
    expect(done.text).toContain('permission denied while trying to connect to the docker API');
    expect(done.text).not.toContain('has not been prepared');
    expect(done.text).toContain('Run sv server bootstrap');
  });

  it('says a different toolkit on the server is brought up by the next sv deploy, or by sv deploy --ssh when a runner deploys', async () => {
    await ready();
    world.ctx.network = { resolve: async () => ['203.0.113.7'], reachable: async () => true };
    const other = `ghcr.io/sovereignfs/cli:0.0.9@sha256:${'b'.repeat(64)}`;
    world.ctx.remote = answering({ doctor: { stdout: server({ toolkitImage: other }) } }).remote;
    const ssh = await sv(world, 'doctor');
    expect(ssh.code).toBe(0);
    expect(ssh.text).toContain('warn  The toolkit on the server');
    expect(ssh.text).toContain('The next sv deploy brings the server to the pinned toolkit.');
    const file = path.join(world.root, 'suite.yml');
    (await import('node:fs')).writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('deploy: ssh', 'deploy: github'),
    );
    const github = await sv(world, 'doctor');
    expect(github.text).toContain('sv deploy --ssh');
    expect(github.text).not.toContain('The next sv deploy brings');
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

describe('the connections in sv status and sv doctor', () => {
  const CONNECTIONS = {
    max: 100,
    reserved: 3,
    total: 4,
    roles: [
      { role: 'app_notes', used: 2, limit: 12 },
      { role: 'core', used: 1, limit: 12 },
    ],
  };
  const stateOf = (connections: unknown) => ({
    state: { commit: head(), core: { version: CORE, healthy: true }, apps: {} },
    current: head(),
    containers: [],
    deploying: false,
    ...(connections === undefined ? {} : { connections }),
  });
  const doctorServer = (connections: unknown) =>
    JSON.stringify({
      protocol: 1,
      docker: { engine: '27.0.1', compose: '2.29.1' },
      freeBytes: 20 * 1024 ** 3,
      toolkitImage: null,
      ...(connections === undefined ? {} : { connections }),
    });
  const network = { resolve: async () => ['203.0.113.7'], reachable: async () => true };

  it('shows what each service holds against its limit in sv status, and in its JSON', async () => {
    await ready();
    await sv(world, 'push');
    world.ctx.remote = answering({
      status: { stdout: JSON.stringify(stateOf(CONNECTIONS)) },
    }).remote;
    const done = await sv(world, 'status');
    expect(done.text).toContain('Connections: 4 open of 100 (notes 2/12, core 1/12)');
    expect(done.text).not.toContain('near its limit');
    const asJson = JSON.parse((await sv(world, 'status', '--json')).out.join('\n'));
    expect(asJson.connections).toEqual(CONNECTIONS);
  });

  it('says in sv status which are near their limit', async () => {
    await ready();
    await sv(world, 'push');
    const busy = { ...CONNECTIONS, roles: [{ role: 'app_notes', used: 11, limit: 12 }] };
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(busy)) } }).remote;
    expect((await sv(world, 'status')).text).toContain('near its limit: notes holds 11 of 12');
  });

  it.each([undefined, null])(
    'says nothing when the server did not report them (%s)',
    async (value) => {
      await ready();
      await sv(world, 'push');
      world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(value)) } }).remote;
      expect((await sv(world, 'status')).text).not.toContain('Connections');
    },
  );

  it('is an ok check in sv doctor, and a warning with what to run when one is near its limit', async () => {
    await ready();
    world.ctx.network = network;
    world.ctx.remote = answering({ doctor: { stdout: doctorServer(CONNECTIONS) } }).remote;
    const calm = await sv(world, 'doctor');
    expect(calm.text).toContain('ok    Connections: 4 open of 100 (notes 2/12, core 1/12)');
    const busy = { ...CONNECTIONS, total: 90 };
    world.ctx.remote = answering({ doctor: { stdout: doctorServer(busy) } }).remote;
    const warned = await sv(world, 'doctor');
    expect(warned.text).toContain('warn  Connections');
    expect(warned.text).toContain('90 are open of the 97 the server leaves for them');
    expect(warned.text).toContain('sv database');
    expect(warned.code).toBe(0);
  });

  it('adds no check when an older server does not report them', async () => {
    await ready();
    world.ctx.network = network;
    world.ctx.remote = answering({ doctor: { stdout: doctorServer(undefined) } }).remote;
    expect((await sv(world, 'doctor')).text).not.toContain('Connections');
  });
});

describe('the pooler in sv status', () => {
  const stateOf = (pools: unknown) => ({
    state: { commit: head(), core: { version: CORE, healthy: true }, apps: {} },
    current: head(),
    containers: [],
    deploying: false,
    ...(pools === undefined ? {} : { pools }),
  });

  it('shows each app’s pool, and its JSON', async () => {
    await ready();
    await sv(world, 'push');
    const pools = [
      {
        database: 'app_notes',
        clientsActive: 3,
        clientsWaiting: 1,
        serversActive: 2,
        serversIdle: 4,
      },
    ];
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(pools)) } }).remote;
    const done = await sv(world, 'status');
    expect(done.text).toContain('Pooler:');
    expect(done.text).toContain(
      'notes: 3 clients active, 1 waiting; 2 server connections active, 4 idle',
    );
    expect(JSON.parse((await sv(world, 'status', '--json')).out.join('\n')).pools).toEqual(pools);
  });

  it('says so when no app has connected, and says nothing about a pooler that is off', async () => {
    await ready();
    await sv(world, 'push');
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf([])) } }).remote;
    expect((await sv(world, 'status')).text).toContain('no app has connected yet');
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(null)) } }).remote;
    expect((await sv(world, 'status')).text).not.toContain('Pooler');
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(undefined)) } }).remote;
    expect((await sv(world, 'status')).text).not.toContain('Pooler');
  });

  it('says it is on in suite.yml and not running when the server has none', async () => {
    await ready();
    await sv(world, 'database', 'pooler', 'enable');
    await sv(world, 'push');
    world.ctx.remote = answering({ status: { stdout: JSON.stringify(stateOf(null)) } }).remote;
    expect((await sv(world, 'status')).text).toContain('not running (sv deploy starts it)');
  });
});
