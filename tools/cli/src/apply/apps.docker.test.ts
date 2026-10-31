/**
 * `sv apply` hosting apps, against the real Docker: two hosted apps and an external one next to core, a third that cannot start, and
 * an app taken out and then purged. It runs the test app of `tools/cli/test-app` and needs the same free names as
 * `apply.docker.test.ts`, plus those of its apps, and skips itself when any is taken. Run it with `pnpm test:docker`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Failed } from '../errors.js';
import { Registry } from '../registry.js';
import type { Suite } from '../suite/types.js';
import { makeSource, type Source } from '../testing/source.js';
import { fakeRegistry } from '../testing/world.js';
import { apply, type ApplyOptions } from './apply.js';
import { realHost, type Host } from './host.js';
import type { State } from './state.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerUp = docker('version', '--format', '{{.Server.Version}}').status === 0;
const NAMES = ['sv-core', 'sv-proxy', 'sv-database', 'sv-app-alpha', 'sv-app-beta', 'sv-app-gamma'];
const NETWORKS = ['sv-net-core', 'sv-net-app-alpha', 'sv-net-app-beta', 'sv-net-app-gamma'];
const taken =
  dockerUp &&
  (docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .some((name) => NAMES.includes(name)) ||
    NETWORKS.some((network) => docker('network', 'inspect', network).status === 0));
const runnable = dockerUp && !taken;

const DOMAIN = 'sv-test.example.test';
const REF = 'ghcr.io/example/testapp:1';
const PROJECTS = [
  'sovereign-core',
  'sovereign-proxy',
  'sovereign-database',
  'sovereign-app-alpha',
  'sovereign-app-beta',
  'sovereign-app-gamma',
];
function teardown() {
  for (const project of PROJECTS)
    docker('compose', '--project-name', project, 'down', '--volumes', '--remove-orphans');
  docker('rm', '--force', ...NAMES);
  for (const network of NETWORKS) docker('network', 'rm', network);
}

const wiki = { external: true as const, name: 'Wiki', redirect: ['https://wiki.example.org/cb'] };

describe.skipIf(!runnable)('sv apply hosting apps against the real Docker', () => {
  let coreImage: string;
  let appImage: string;
  let first: Source;
  const logs: string[] = [];

  const suiteOf = (apps: Suite['apps'], extra: Partial<Suite> = {}): Partial<Suite> => ({
    domain: DOMAIN,
    tls: { mode: 'internal' },
    apps,
    ...extra,
  });
  const resolve = (ref: string) => {
    const registry = new Registry();
    return ref.startsWith('ghcr.io/')
      ? Promise.resolve(`sha256:${'1'.repeat(64)}`)
      : registry.digest(ref);
  };
  const again = (suite: Partial<Suite>) => makeSource({ suite, resolve });
  const options = (from: Source, commit: string): ApplyOptions => ({
    from: from.dir,
    commit: commit.repeat(40),
    stateDir: first.stateDir,
    publishPorts: false,
    skipDns: true,
    restore: false,
    imageOverrides: {
      core: coreImage,
      cli: appImage,
      apps: { alpha: appImage, beta: appImage, gamma: appImage },
    },
  });
  const host = (): Host => ({
    ...realHost((line) => logs.push(line)),
    log: (line) => logs.push(line),
    registry: fakeRegistry({
      [REF]: {
        manifest: JSON.parse(
          readFileSync(path.join(root, 'tools/cli/test-app/manifest.json'), 'utf8'),
        ),
      },
    }).registry,
  });
  const state = () =>
    JSON.parse(readFileSync(path.join(first.stateDir, 'state.json'), 'utf8')) as State;
  const ids = (...names: string[]) =>
    names
      .map(
        (name) =>
          `${name} ${docker('inspect', '--format', '{{.Id}} {{.State.StartedAt}} {{.State.Running}}', name).stdout.trim()}`,
      )
      .join('\n');
  const present = (name: string) => docker('inspect', name).status === 0;
  const admin = (...args: string[]) => docker('exec', 'sv-core', 'sovereign-admin', ...args);
  const psql = (user: string, database: string, sql: string) =>
    docker('exec', 'sv-database', 'psql', '-U', user, '-d', database, '-t', '-A', '-c', sql);
  const hasDatabase = (name: string) =>
    psql(
      'sovereign',
      'postgres',
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
    ).stdout.trim() === '1';
  /** What an app, from inside its own network, makes of an address. */
  const fromApp = (name: string, url: string) => {
    const done = docker(
      'exec',
      `sv-app-${name}`,
      'node',
      '-e',
      "fetch('http://127.0.0.1:3000/fetch?url=' + encodeURIComponent(process.argv[1])).then((r) => r.text()).then(console.log)",
      url,
    );
    return JSON.parse(done.stdout) as { status?: number; error?: string };
  };
  const secrets = () => readdirSync(path.join(first.stateDir, 'secrets'));

  beforeAll(async () => {
    coreImage = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
    if (!process.env.SV_TEST_CORE_IMAGE)
      execFileSync('docker', ['build', '--tag', coreImage, root], { stdio: 'inherit' });
    appImage = 'sv-test-app:local';
    execFileSync('docker', ['build', '--tag', appImage, path.join(root, 'tools/cli/test-app')], {
      stdio: 'inherit',
    });
    first = await again(suiteOf({ alpha: { image: REF }, beta: { image: REF }, wiki }));
  });
  afterAll(() => {
    if (process.env.SV_KEEP) return;
    teardown();
    if (first) rmSync(path.dirname(first.dir), { recursive: true, force: true });
  });

  it('brings up two hosted apps next to core, each healthy, and registers the external one too', async () => {
    const done = await apply(host(), options(first, 'a'));
    expect(done.changed).toBe(true);
    for (const line of ids('sv-core', 'sv-app-alpha', 'sv-app-beta').split('\n'))
      expect(line.endsWith('true'), line).toBe(true);
    expect(docker('inspect', '--format', '{{.State.Health.Status}}', 'sv-core').stdout.trim()).toBe(
      'healthy',
    );
    expect(Object.keys(state().apps).sort()).toEqual(['alpha', 'beta', 'wiki']);
    expect(state().apps.wiki).toMatchObject({ kind: 'external' });
    const listed = admin('apps', 'list', '--json').stdout;
    for (const app of Object.values(state().apps)) expect(listed).toContain(app.clientId);
    expect(present('sv-app-wiki')).toBe(false);
  });

  it('gives each app its address, core’s, its secrets as files it can read, and a user that is not root', () => {
    const done = docker(
      'exec',
      'sv-app-alpha',
      'node',
      '-e',
      "fetch('http://127.0.0.1:3000/env').then((r) => r.text()).then(console.log)",
    );
    const seen = JSON.parse(done.stdout) as {
      env: Record<string, string | { length: number }>;
      user: number;
    };
    expect(seen.user).not.toBe(0);
    expect(seen.env.TESTAPP_URL).toBe(`https://alpha.${DOMAIN}`);
    expect(seen.env.TESTAPP_CORE_URL).toBe(`https://${DOMAIN}`);
    expect(seen.env.TESTAPP_CORE_CLIENT_ID).toBe(state().apps.alpha?.clientId);
    for (const variable of [
      'TESTAPP_CORE_CLIENT_SECRET_FILE',
      'TESTAPP_POSTGRES_URL_FILE',
      'TESTAPP_AUTH_SECRET_FILE',
    ]) {
      expect((seen.env[variable] as { length: number }).length, variable).toBeGreaterThan(10);
    }
    // Nothing the app was given as a secret appears in what it can read as plain environment.
    expect(Object.keys(seen.env).some((name) => name.endsWith('_SECRET'))).toBe(false);
  });

  it('keeps the apps apart: each reaches the other only by its public name, and each opens only its own database', () => {
    expect(fromApp('alpha', `https://beta.${DOMAIN}/health`)).toEqual({ status: 200 });
    expect(fromApp('alpha', `https://${DOMAIN}/.well-known/openid-configuration`).status).toBe(200);
    expect(fromApp('alpha', 'http://sv-app-beta:3000/health').error).toBeTruthy();
    expect(fromApp('alpha', 'http://sv-core:3000/').error).toBeTruthy();
    expect(psql('app_alpha', 'app_alpha', 'SELECT 1').status).toBe(0);
    const across = psql('app_alpha', 'app_beta', 'SELECT 1');
    expect(across.status).not.toBe(0);
    expect(across.stderr).toContain('permission denied');
    // Nor core’s.
    expect(psql('app_alpha', 'core', 'SELECT 1').status).not.toBe(0);
  });

  it('changes nothing the second time', async () => {
    const before = ids('sv-database', 'sv-proxy', 'sv-core', 'sv-app-alpha', 'sv-app-beta');
    const second = await apply(host(), options(first, 'b'));
    expect(second.changed).toBe(false);
    expect(ids('sv-database', 'sv-proxy', 'sv-core', 'sv-app-alpha', 'sv-app-beta')).toBe(before);
  });

  it('stops only the app that cannot start: core and the others keep running, and the proxy does not answer for it', async () => {
    const failing = await again(
      suiteOf({
        alpha: { image: REF },
        beta: { image: REF },
        wiki,
        gamma: { image: REF, env: { TESTAPP_LISTEN_PORT: '3999' } },
      }),
    );
    const before = ids('sv-core', 'sv-app-alpha', 'sv-app-beta');
    const error = await apply(host(), options(failing, 'c')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Failed);
    expect((error as Failed).message).toContain('gamma');
    expect(ids('sv-core', 'sv-app-alpha', 'sv-app-beta')).toBe(before);
    expect(readFileSync(path.join(first.stateDir, 'proxy', 'Caddyfile'), 'utf8')).not.toContain(
      'gamma',
    );
    expect(state().commit).toBe('b'.repeat(40));
  });

  it('stops an app taken out of suite.yml, removes its client, and keeps its data', async () => {
    const without = await again(suiteOf({ alpha: { image: REF }, wiki }));
    const alpha = ids('sv-app-alpha');
    await apply(host(), options(without, 'd'));
    expect(present('sv-app-beta')).toBe(false);
    expect(present('sv-app-gamma')).toBe(false);
    expect(docker('network', 'inspect', 'sv-net-app-beta').status).not.toBe(0);
    expect(admin('apps', 'list', '--json').stdout).not.toContain('"beta"');
    expect(hasDatabase('app_beta')).toBe(true);
    expect(secrets()).toContain('role-app-beta-password');
    expect(ids('sv-app-alpha')).toBe(alpha);
    expect(Object.keys(state().apps).sort()).toEqual(['alpha', 'wiki']);
  });

  it('deletes what an app held when it is purged, after taking a backup', async () => {
    const purged = await again(suiteOf({ alpha: { image: REF }, wiki }, { purge: ['beta'] }));
    await apply(host(), options(purged, 'e'));
    expect(hasDatabase('app_beta')).toBe(false);
    expect(secrets().filter((file) => file.includes('beta'))).toEqual([]);
    expect(
      docker(
        'volume',
        'ls',
        '-q',
        '--filter',
        'label=com.docker.compose.project=sovereign-app-beta',
      ).stdout.trim(),
    ).toBe('');
    expect(existsSync(path.join(first.stateDir, 'backups'))).toBe(true);
    expect(readdirSync(path.join(first.stateDir, 'backups')).length).toBeGreaterThan(0);
    // The one that stayed is untouched.
    expect(hasDatabase('app_alpha')).toBe(true);
    expect(secrets()).toContain('role-app-alpha-password');
  });
});
