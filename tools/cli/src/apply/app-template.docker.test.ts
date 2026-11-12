/**
 * The app template against the real Docker (operator-cli §2.2): an app made by `npm create @sovereignfs app`, built into an image, and
 * hosted by `sv apply` with nothing changed in what the template made. It proves that the manifest label is the manifest, that the
 * instance can read it, that the app starts, applies its own migrations and answers its health path, and that its sign-in, back-channel
 * and account-deleted routes are mounted where the manifest says. It needs network for npm and the base images, and the names of
 * `apply.docker.test.ts` plus its own, and skips itself when any is taken. Run it with `pnpm test:docker`.
 *
 * One thing is not as an operator would have it: the Sovereign packages are not published yet, so the app is given tarballs of the
 * ones in this repository (in `vendor/`, copied into the build). Once they are published that goes, and the app is built as it was made.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { namesOf, writeApp } from '../../../create/src/app.js';
import { Registry } from '../registry.js';
import { makeSource, type Source } from '../testing/source.js';
import { fakeRegistry } from '../testing/world.js';
import { apply, type ApplyOptions } from './apply.js';
import { realHost, type Host } from './host.js';
import type { State } from './state.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerUp = docker('version', '--format', '{{.Server.Version}}').status === 0;
const NAMES = ['sv-core', 'sv-proxy', 'sv-database', 'sv-app-tplnotes'];
const NETWORKS = ['sv-net-core', 'sv-net-app-tplnotes'];
const taken =
  dockerUp &&
  (docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .some((name) => NAMES.includes(name)) ||
    NETWORKS.some((network) => docker('network', 'inspect', network).status === 0));
const runnable = dockerUp && !taken;

const DOMAIN = 'sv-test.sovereign.local';
const REF = 'ghcr.io/example/tplnotes:1';
const PROJECTS = [
  'sovereign-core',
  'sovereign-proxy',
  'sovereign-database',
  'sovereign-app-tplnotes',
];

describe.skipIf(!runnable)('an app made from the template, hosted by sv apply', () => {
  let coreImage: string;
  let cliImage: string;
  let appImage: string;
  let appDir: string;
  let work: string;
  let source: Source;
  let state: string;
  let manifest: unknown;
  const logs: string[] = [];

  const host = (): Host => ({
    ...realHost((line) => logs.push(line)),
    log: (line) => logs.push(line),
    registry: fakeRegistry({ [REF]: { manifest } }).registry,
  });
  const options = (): ApplyOptions => ({
    from: source.dir,
    commit: 'a'.repeat(40),
    stateDir: state,
    publishPorts: false,
    skipDns: true,
    restore: false,
    toolkitImage: cliImage,
    imageOverrides: { core: coreImage, cli: cliImage, apps: { tplnotes: appImage } },
  });
  /** A request made from inside core, which trusts the proxy's authority and reaches every public name. */
  const fromCore = (script: string, ...args: string[]) =>
    docker('exec', 'sv-core', 'node', '-e', script, ...args);
  const probe = (method: string, pathname: string) => {
    const done = fromCore(
      "fetch(process.argv[1], { method: process.argv[2], redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: process.argv[2] === 'POST' ? 'x=1' : undefined }).then((r) => console.log(JSON.stringify({ status: r.status, location: r.headers.get('location') })))",
      `https://tplnotes.${DOMAIN}${pathname}`,
      method,
    );
    return JSON.parse(done.stdout) as { status: number; location: string | null };
  };

  beforeAll(async () => {
    coreImage = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
    if (!process.env.SV_TEST_CORE_IMAGE)
      execFileSync('docker', ['build', '--tag', coreImage, root], { stdio: 'inherit' });
    execFileSync('pnpm', ['--filter', '@sovereignfs/cli', 'build'], { cwd: root, stdio: 'ignore' });
    cliImage = 'sv-test-cli:local';
    execFileSync('docker', ['build', '--quiet', '--tag', cliImage, path.join(root, 'tools/cli')], {
      stdio: 'ignore',
    });

    // The app, as the template makes it.
    work = mkdtempSync(path.join(os.tmpdir(), 'sv-template-'));
    const app = path.join(work, 'tplnotes');
    await writeApp(app, namesOf(app));

    // The Sovereign packages of this repository, packed, since the published ones do not exist yet.
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@sovereignfs/sdk...',
        '--filter',
        '@sovereignfs/ui...',
        '--filter',
        '@sovereignfs/storage...',
        'build',
      ],
      { cwd: root, stdio: 'ignore' },
    );
    // The command that makes the image's label and port from the manifest, built the way an author gets it from npm.
    execFileSync('pnpm', ['--filter', '@sovereignfs/manifest', 'build'], {
      cwd: root,
      stdio: 'ignore',
    });
    const vendor = path.join(app, 'vendor');
    mkdirSync(vendor);
    for (const name of ['sdk', 'ui', 'manifest', 'config', 'storage']) {
      execFileSync(
        'pnpm',
        ['--filter', `@sovereignfs/${name}`, 'pack', '--pack-destination', vendor],
        { cwd: root, stdio: 'ignore' },
      );
    }
    const tarballs = readdirSync(vendor);
    const pkg = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };
    for (const [name, field] of [
      ['sdk', 'dependencies'],
      ['ui', 'dependencies'],
      ['config', 'dependencies'],
      ['storage', 'dependencies'],
      ['manifest', 'devDependencies'],
    ] as const) {
      pkg[field][`@sovereignfs/${name}`] =
        `file:./vendor/${tarballs.find((file) => file.startsWith(`sovereignfs-${name}-`)) as string}`;
    }
    // The storage package asks for config by version, which is not published either: it is the tarball too.
    pkg.overrides = { '@sovereignfs/config': pkg.dependencies['@sovereignfs/config'] as string };
    writeFileSync(path.join(app, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    execFileSync(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: app, stdio: 'ignore' },
    );
    const dockerfile = readFileSync(path.join(app, 'Dockerfile'), 'utf8').replace(
      'COPY package.json package-lock.json ./\n',
      'COPY package.json package-lock.json ./\nCOPY vendor ./vendor\n',
    );
    writeFileSync(path.join(app, 'Dockerfile'), dockerfile);

    appImage = 'sv-test-tpl:local';
    // Built as the template's own instructions say: the label and the port come from the manifest, through `sovereign-manifest docker-args`.
    const cli = path.join(root, 'packages/manifest/dist/cli.js');
    execFileSync(
      'sh',
      [
        '-c',
        `eval "docker build --quiet --tag ${appImage} $(node '${cli}' docker-args '${app}') '${app}'"`,
      ],
      { stdio: 'inherit' },
    );
    appDir = app;
    manifest = JSON.parse(readFileSync(path.join(app, 'sovereign.manifest.json'), 'utf8'));

    state = mkdtempSync(path.join(os.tmpdir(), 'sv-template-state-'));
    source = await makeSource({
      suite: { domain: DOMAIN, tls: { mode: 'internal' }, apps: { tplnotes: { image: REF } } },
      resolve: (ref) =>
        ref.startsWith('ghcr.io/')
          ? Promise.resolve(`sha256:${'1'.repeat(64)}`)
          : new Registry().digest(ref),
    });
  });
  afterAll(() => {
    if (process.env.SV_KEEP) return;
    for (const project of PROJECTS)
      docker('compose', '--project-name', project, 'down', '--volumes', '--remove-orphans');
    docker('rm', '--force', ...NAMES);
    docker('volume', 'rm', '--force', 'sovereign-data');
    for (const network of NETWORKS) docker('network', 'rm', network);
    for (const dir of [work, state, source && path.dirname(source.dir)]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries its manifest as the label of the image, equal to the manifest file', () => {
    const label = docker(
      'inspect',
      '--format',
      '{{ index .Config.Labels "io.github.sovereignfs.app-manifest" }}',
      appImage,
    ).stdout.trim();
    expect(JSON.parse(label)).toEqual(manifest);
  });

  it('listens on the port the manifest names, which it was built with and does not write itself', () => {
    const inspected = JSON.parse(docker('inspect', appImage).stdout) as {
      Config: { Env: string[]; ExposedPorts: Record<string, unknown> };
    }[];
    const port = String((manifest as { port: number }).port);
    expect(inspected[0]?.Config.Env).toContain(`PORT=${port}`);
    expect(Object.keys(inspected[0]?.Config.ExposedPorts ?? {})).toEqual([`${port}/tcp`]);
  });

  it('refuses to be built without the port, and says how to build', () => {
    const built = docker('build', '--tag', 'sv-test-tpl:no-port', appDir);
    expect(built.status).not.toBe(0);
    expect(built.stderr).toContain('sovereign-manifest docker-args');
  });

  it('is hosted as it stands: it starts, applies its migrations, answers its health path, and registers with core', async () => {
    await apply(host(), options());
    const recorded = JSON.parse(readFileSync(path.join(state, 'state.json'), 'utf8')) as State;
    expect(recorded.apps.tplnotes).toMatchObject({
      kind: 'hosted',
      healthy: true,
      database: 'app_tplnotes',
    });
    expect(probe('GET', '/api/health').status).toBe(200);
    const migrated = docker(
      'exec',
      'sv-database',
      'psql',
      '-U',
      'sovereign',
      '-d',
      'app_tplnotes',
      '-t',
      '-A',
      '-c',
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    expect(migrated.stdout.trim()).toBe('001_init.sql');
    expect(docker('exec', 'sv-app-tplnotes', 'id', '-u').stdout.trim()).not.toBe('0');
  });

  it('sends a person to core to sign in, with the client core registered and PKCE', () => {
    const recorded = JSON.parse(readFileSync(path.join(state, 'state.json'), 'utf8')) as State;
    const login = probe('GET', '/auth/login');
    expect([302, 303, 307]).toContain(login.status);
    const target = new URL(login.location as string);
    expect(target.origin).toBe(`https://${DOMAIN}`);
    expect(target.searchParams.get('client_id')).toBe(recorded.apps.tplnotes?.clientId);
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('redirect_uri')).toBe(
      `https://tplnotes.${DOMAIN}/auth/callback`,
    );
  });

  it('asks core for scopes core gives it: the sign-in is not refused before a person is asked', () => {
    const login = probe('GET', '/auth/login');
    const answer = fromCore(
      "fetch(process.argv[1], { redirect: 'manual' }).then(async (r) => console.log(JSON.stringify({ status: r.status, location: r.headers.get('location'), body: (await r.text()).slice(0, 400) })))",
      login.location as string,
    );
    const seen = JSON.parse(answer.stdout) as { location: string | null; body: string };
    // Core sends someone who is not signed in to its sign-in page; a refusal is an error in the address instead.
    expect(`${seen.location ?? ''} ${seen.body}`).not.toMatch(/error=|invalid_scope/);
    expect(`${seen.location ?? ''} ${seen.body}`).toContain('sign-in');
  });

  it('has its back-channel logout and account-deleted routes where the manifest says, and refuses what core did not sign', () => {
    for (const route of ['/auth/backchannel-logout', '/auth/account-deleted']) {
      const answer = probe('POST', route);
      expect(answer.status, route).toBeGreaterThanOrEqual(400);
      expect(answer.status, route).toBeLessThan(500);
      expect(answer.status, route).not.toBe(404);
    }
  });

  it('keeps its page behind sign-in', () => {
    const page = probe('GET', '/');
    expect([302, 303, 307]).toContain(page.status);
    expect(page.location).toContain('/auth/login');
  });

  it('keeps people’s files in a folder of its own that the app can write, and answers no one who is not signed in', () => {
    // The instance mounted only this app's folder, owned by the user the image runs as.
    const write = docker(
      'exec',
      'sv-app-tplnotes',
      'sh',
      '-c',
      'touch /data/s3/tplnotes/probe && rm /data/s3/tplnotes/probe && ls /data/s3',
    );
    expect(write.status, write.stderr).toBe(0);
    expect(write.stdout.trim()).toBe('tplnotes');
    expect(probe('GET', '/api/files').status).toBe(401);
    expect(probe('GET', '/api/files/abcdefghijklmnopqrstuv').status).toBe(401);
    // A request that did not come from the app's own pages cannot change anything, signed in or not.
    expect(probe('POST', '/api/files').status).toBe(403);
    expect(probe('DELETE', '/api/files/abcdefghijklmnopqrstuv').status).toBe(403);
  });

  it('starts by itself with docker compose, on a volume it can write, and answers its health path', () => {
    const project = 'sv-tpl-compose';
    const override = path.join(appDir, 'compose.override.yml');
    // The test publishes no port, so it cannot meet whatever is on the machine already.
    writeFileSync(override, 'services:\n  app:\n    ports: !reset []\n');
    writeFileSync(path.join(appDir, '.env'), readFileSync(path.join(appDir, '.env.example')));
    const compose = (...args: string[]) =>
      spawnSync(
        'docker',
        ['compose', '--project-name', project, '-f', 'compose.yml', '-f', override, ...args],
        {
          cwd: appDir,
          encoding: 'utf8',
        },
      );
    try {
      const up = compose('up', '--build', '--detach', '--wait');
      expect(up.status, up.stderr).toBe(0);
      let health = '';
      for (let attempt = 0; attempt < 30 && health !== 'ok'; attempt += 1) {
        health = compose(
          'exec',
          '-T',
          'app',
          'wget',
          '-qO-',
          'http://127.0.0.1:3100/api/health',
        ).stdout.trim();
        if (health !== 'ok') spawnSync('sleep', ['2']);
      }
      expect(health, compose('logs', 'app', '--no-color').stdout.slice(-1500)).toBe('ok');
      const write = compose(
        'exec',
        '-T',
        'app',
        'sh',
        '-c',
        'touch /data/s3/tplnotes/probe && id -u',
      );
      expect(write.status, write.stderr).toBe(0);
      expect(write.stdout.trim()).not.toBe('0');
    } finally {
      compose('down', '--volumes', '--remove-orphans');
      rmSync(override, { force: true });
    }
  }, 300_000);
});
