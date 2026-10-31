/**
 * `sv apply` against the real Docker, with real images: the proof that what the unit tests pretend is true. It builds core from this
 * repository (or uses SV_TEST_CORE_IMAGE), pulls PostgreSQL and Caddy by the digest the registry gives, and runs the whole base on
 * a machine of its own: no port is published, the DNS check is skipped, and the proxy makes its own certificates.
 *
 * It needs the names `sv apply` uses (sv-core, sv-proxy, sv-database, the network sv-net-core) to be free, and skips itself when they
 * are not, so it can never touch a real instance on the machine it runs on. Run it with `pnpm test:docker`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Registry } from '../registry.js';
import { makeSource, type Source } from '../testing/source.js';
import { apply, type ApplyOptions } from './apply.js';
import { realHost, type Host } from './host.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerUp = docker('version', '--format', '{{.Server.Version}}').status === 0;
const taken =
  dockerUp &&
  (docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .some((name) => ['sv-core', 'sv-proxy', 'sv-database'].includes(name)) ||
    docker('network', 'inspect', 'sv-net-core').status === 0);
const runnable = dockerUp && !taken;

const PROJECTS = ['sovereign-core', 'sovereign-proxy', 'sovereign-database'];
function teardown() {
  for (const project of PROJECTS)
    docker('compose', '--project-name', project, 'down', '--volumes', '--remove-orphans');
  docker('network', 'rm', 'sv-net-core');
}

describe.skipIf(!runnable)('sv apply against the real Docker', () => {
  let image: string;
  let source: Source;
  const logs: string[] = [];

  const options = (extra: Partial<ApplyOptions> = {}): ApplyOptions => ({
    from: source.dir,
    commit: 'a'.repeat(40),
    stateDir: source.stateDir,
    publishPorts: false,
    skipDns: true,
    restore: false,
    imageOverrides: { core: image },
    ...extra,
  });
  const ids = () =>
    ['sv-database', 'sv-proxy', 'sv-core']
      .map(
        (name) =>
          `${name} ${docker('inspect', '--format', '{{.Id}} {{.State.StartedAt}} {{.State.Health.Status}}', name).stdout.trim()}`,
      )
      .join('\n');

  beforeAll(async () => {
    image = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
    if (!process.env.SV_TEST_CORE_IMAGE)
      execFileSync('docker', ['build', '--tag', image, root], { stdio: 'inherit' });
    const registry = new Registry();
    source = await makeSource({
      suite: { domain: 'sv-test.example.test', tls: { mode: 'internal' } },
      resolve: (ref) =>
        ref.startsWith('ghcr.io/')
          ? Promise.resolve(`sha256:${'1'.repeat(64)}`)
          : registry.digest(ref),
    });
  });
  afterAll(() => {
    if (process.env.SV_KEEP) return;
    teardown();
    if (source) rmSync(path.dirname(source.dir), { recursive: true, force: true });
  });

  const host = (): Host => ({
    ...realHost((line) => logs.push(line)),
    log: (line) => logs.push(line),
  });

  it('brings up the database, the proxy and core, healthy, and a second run changes nothing', async () => {
    const first = await apply(host(), options());
    expect(first.changed).toBe(true);
    expect(
      ids()
        .split('\n')
        .every((line) => line.endsWith('healthy')),
    ).toBe(true);
    expect(readFileSync(path.join(source.stateDir, 'state.json'), 'utf8')).toContain(
      '"healthy": true',
    );
    expect(existsSync(path.join(source.stateDir, 'current'))).toBe(true);

    const before = ids();
    const second = await apply(host(), options());
    expect(second.changed).toBe(false);
    expect(ids()).toBe(before);
    // A new commit with the same content moves current and changes nothing that runs.
    const third = await apply(host(), options({ commit: 'b'.repeat(40) }));
    expect(third.changed).toBe(false);
    expect(ids()).toBe(before);
  });

  it('keeps every secret out of the logs, the release directory and the command lines it ran', () => {
    const secrets = readdirSync(path.join(source.stateDir, 'secrets')).map((name) =>
      readFileSync(path.join(source.stateDir, 'secrets', name), 'utf8'),
    );
    expect(secrets.length).toBeGreaterThanOrEqual(5);
    const text = logs.join('\n');
    for (const value of secrets) expect(text).not.toContain(value);
    const release = path.join(source.stateDir, 'releases', 'a'.repeat(40));
    for (const entry of readdirSync(release, { recursive: true })) {
      const file = path.join(release, String(entry));
      if (!statSync(file).isFile()) continue;
      for (const value of secrets) expect(readFileSync(file, 'utf8')).not.toContain(value);
    }
    expect(statSync(path.join(source.stateDir, 'secrets')).mode & 0o777).toBe(0o700);
    // And the password the role was given works: core is healthy, which it could not be without it.
    expect(docker('inspect', '--format', '{{.State.Health.Status}}', 'sv-core').stdout.trim()).toBe(
      'healthy',
    );
  });

  it('puts core on its own network with the proxy and the database server, and publishes nothing but the proxy’s ports', () => {
    const inspected = JSON.parse(docker('network', 'inspect', 'sv-net-core').stdout) as {
      Containers: Record<string, { Name: string }>;
    }[];
    expect(
      Object.values(inspected[0]?.Containers ?? {})
        .map((c) => c.Name)
        .sort(),
    ).toEqual(['sv-core', 'sv-database', 'sv-proxy']);
    expect(docker('port', 'sv-core').stdout.trim()).toBe('');
    expect(docker('port', 'sv-database').stdout.trim()).toBe('');
  });

  it('serves core on its public name over https with the proxy’s own authority, from inside the network', () => {
    const done = docker(
      'exec',
      'sv-core',
      'node',
      '-e',
      "fetch('https://sv-test.example.test/.well-known/openid-configuration').then(async (r) => { const d = await r.json(); console.log(d.issuer); process.exit(d.issuer === 'https://sv-test.example.test' ? 0 : 1); })",
    );
    expect(done.status).toBe(0);
    expect(done.stdout.trim()).toBe('https://sv-test.example.test');
  });

  it('shuts other roles out of core’s database', () => {
    const connect = docker(
      'exec',
      'sv-database',
      'psql',
      '-U',
      'sovereign',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-c',
      "SELECT has_database_privilege('public', 'core', 'CONNECT')",
    );
    expect(connect.stdout.trim()).toBe('f');
  });

  describe('a run that stops partway', () => {
    // Each failure is made by refusing one docker call, then the same commit is deployed again. Whatever stopped, the result is the
    // instance a deployment that never stopped makes.
    const scenarios = [
      { name: 'while the database server starts', text: 'sovereign-database' },
      { name: 'while the proxy starts', text: 'sovereign-proxy' },
      { name: 'while core starts', text: 'sovereign-core' },
    ];
    for (const scenario of scenarios) {
      it(`finishes when it is run again, after stopping ${scenario.name}`, async () => {
        teardown();
        rmSync(path.join(source.stateDir, 'current'), { force: true });
        rmSync(path.join(source.stateDir, 'state.json'), { force: true });
        const real = host();
        let failing = true;
        const flaky: Host = {
          ...real,
          docker: (args, callOptions) =>
            failing && args.join(' ').includes(scenario.text) && args.includes('up')
              ? Promise.resolve({ code: 1, stdout: '', stderr: `refused: ${scenario.name}` })
              : real.docker(args, callOptions),
        };
        await expect(apply(flaky, options({ commit: 'c'.repeat(40) }))).rejects.toThrow(/failed/);
        expect(existsSync(path.join(source.stateDir, 'current'))).toBe(false);
        failing = false;
        const done = await apply(real, options({ commit: 'c'.repeat(40) }));
        expect(done.changed).toBe(true);
        expect(
          ids()
            .split('\n')
            .every((line) => line.endsWith('healthy')),
        ).toBe(true);
        const settled = ids();
        expect((await apply(real, options({ commit: 'c'.repeat(40) }))).changed).toBe(false);
        expect(ids()).toBe(settled);
      });
    }
  });
});
