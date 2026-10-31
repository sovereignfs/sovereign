/**
 * A backup and a restore against the real Docker: an instance with an app that holds data in its database and in a volume is backed up,
 * lost entirely (every container, volume and network, and the state directory), and brought back on a fresh state directory as a new
 * machine would have one. What the app wrote before the backup is there; what it wrote after is not; and its client secret is the same, so
 * the app still signs in. It needs the names of `apply.docker.test.ts` and its app's, and skips itself when any is taken.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decrypter } from 'age-encryption';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { Registry } from '../registry.js';
import { isBackupPath } from '../server/receive.js';
import { extract, readArchive } from '../server/tar.js';
import { makeSource, type Source } from '../testing/source.js';
import { fakeRegistry } from '../testing/world.js';
import { apply, type ApplyOptions } from './apply.js';
import { takeBackup } from './backup.js';
import { realHost, type Host } from './host.js';
import type { State } from './state.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerUp = docker('version', '--format', '{{.Server.Version}}').status === 0;
const NAMES = ['sv-core', 'sv-proxy', 'sv-database', 'sv-app-alpha'];
const NETWORKS = ['sv-net-core', 'sv-net-app-alpha'];
const taken =
  dockerUp &&
  (docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .some((name) => NAMES.includes(name)) ||
    NETWORKS.some((network) => docker('network', 'inspect', network).status === 0));
const runnable = dockerUp && !taken;

const DOMAIN = 'sv-test.example.test';
const REF = 'ghcr.io/example/testapp:1';
const PROJECTS = ['sovereign-core', 'sovereign-proxy', 'sovereign-database', 'sovereign-app-alpha'];

function loseEverything() {
  for (const project of PROJECTS)
    docker('compose', '--project-name', project, 'down', '--volumes', '--remove-orphans');
  docker('rm', '--force', ...NAMES);
  for (const network of NETWORKS) docker('network', 'rm', network);
}

describe.skipIf(!runnable)('a backup and a restore against the real Docker', () => {
  let coreImage: string;
  let appImage: string;
  let cliImage: string;
  let source: Source;
  const states: string[] = [];
  const logs: string[] = [];

  const newState = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-restore-state-'));
    states.push(dir);
    return dir;
  };
  const options = (stateDir: string, extra: Partial<ApplyOptions> = {}): ApplyOptions => ({
    from: source.dir,
    commit: 'a'.repeat(40),
    stateDir,
    publishPorts: false,
    skipDns: true,
    restore: false,
    toolkitImage: cliImage,
    imageOverrides: { core: coreImage, cli: cliImage, apps: { alpha: appImage } },
    ...extra,
  });
  const host = (): Host => ({
    ...realHost((line) => logs.push(line)),
    log: (line) => logs.push(line),
    registry: fakeRegistry({
      [REF]: {
        manifest: JSON.parse(
          readFileSync(path.join(root, 'apps/cli/test-app/manifest.json'), 'utf8'),
        ),
      },
    }).registry,
  });
  const psql = (database: string, sql: string) =>
    docker('exec', 'sv-database', 'psql', '-U', 'sovereign', '-d', database, '-t', '-A', '-c', sql);

  beforeAll(async () => {
    coreImage = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
    if (!process.env.SV_TEST_CORE_IMAGE)
      execFileSync('docker', ['build', '--tag', coreImage, root], { stdio: 'inherit' });
    execFileSync('pnpm', ['--filter', '@sovereignfs/cli', 'build'], { cwd: root, stdio: 'ignore' });
    cliImage = 'sv-test-cli:local';
    execFileSync('docker', ['build', '--quiet', '--tag', cliImage, path.join(root, 'apps/cli')], {
      stdio: 'ignore',
    });
    appImage = 'sv-test-app:local';
    execFileSync(
      'docker',
      ['build', '--quiet', '--tag', appImage, path.join(root, 'apps/cli/test-app')],
      { stdio: 'ignore' },
    );
    source = await makeSource({
      suite: { domain: DOMAIN, tls: { mode: 'internal' }, apps: { alpha: { image: REF } } },
      resolve: (ref) =>
        ref.startsWith('ghcr.io/')
          ? Promise.resolve(`sha256:${'1'.repeat(64)}`)
          : new Registry().digest(ref),
    });
  });
  afterAll(() => {
    if (process.env.SV_KEEP) return;
    loseEverything();
    for (const dir of [...states, source && path.dirname(source.dir)]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('brings back the app’s data and its secret on a machine that has nothing, and not what was written after the backup', async () => {
    const before = newState();
    await apply(host(), options(before));
    const state = JSON.parse(readFileSync(path.join(before, 'state.json'), 'utf8')) as State;
    const clientId = state.apps.alpha?.clientId as string;
    const secret = readFileSync(path.join(before, 'secrets', 'app-alpha-client-secret'), 'utf8');

    // What the app holds: a row in its database, and a file in its data volume.
    expect(
      psql('app_alpha', "CREATE TABLE kept (v text); INSERT INTO kept VALUES ('before the backup')")
        .status,
    ).toBe(0);
    expect(
      docker('exec', '--user', '0', 'sv-app-alpha', 'sh', '-c', 'echo before > /data/note.txt')
        .status,
    ).toBe(0);

    // The backup, as `sv backup` takes it, and read with the operator's key, as `sv restore` reads it.
    const file = await takeBackup(host(), {
      stateDir: before,
      recipients: source.suite.secrets.recipients,
      reason: 'manual',
      image: cliImage,
    });
    const decrypter = new Decrypter();
    decrypter.addIdentity(source.operator.identity);
    const plain = Buffer.from(
      await new Response(
        (await decrypter.decrypt(
          Readable.toWeb(Readable.from([readFileSync(file)])) as ReadableStream<Uint8Array>,
        )) as ReadableStream,
      ).arrayBuffer(),
    );
    const unpacked = path.join(newState(), 'backup');
    // Through the same list the server checks a restore against, so a backup it makes is one it accepts.
    const entries = readArchive(plain, isBackupPath, { stripDot: true });
    expect(entries.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        'databases.sql',
        'state.json',
        'volumes/sovereign-app-alpha_data-0.tar',
      ]),
    );
    await extract(
      entries.filter(
        (e) =>
          e.name === 'databases.sql' ||
          e.name.startsWith('secrets/') ||
          e.name.startsWith('volumes/'),
      ),
      unpacked,
    );

    // After the backup, and then the machine is lost.
    expect(psql('app_alpha', "INSERT INTO kept VALUES ('after the backup')").status).toBe(0);
    docker('exec', '--user', '0', 'sv-app-alpha', 'sh', '-c', 'echo after > /data/later.txt');
    loseEverything();
    expect(docker('ps', '-a', '--format', '{{.Names}}').stdout).not.toContain('sv-core');

    // A new machine: an empty state directory, and the same files of the instance.
    const fresh = newState();
    await apply(host(), options(fresh, { restoreFrom: unpacked }));
    expect(logs.join('\n')).toContain('Recorded the restore');
    expect(logs.join('\n')).toContain('will reappear');

    expect(psql('app_alpha', 'SELECT v FROM kept ORDER BY v').stdout.trim()).toBe(
      'before the backup',
    );
    const note = docker('exec', 'sv-app-alpha', 'sh', '-c', 'cat /data/note.txt; ls /data');
    expect(note.stdout).toContain('before');
    expect(note.stdout).not.toContain('later.txt');
    // The app is the same app to core: same client, same secret, so it signs in as it did.
    const restored = JSON.parse(readFileSync(path.join(fresh, 'state.json'), 'utf8')) as State;
    expect(restored.apps.alpha?.clientId).toBe(clientId);
    expect(readFileSync(path.join(fresh, 'secrets', 'app-alpha-client-secret'), 'utf8')).toBe(
      secret,
    );
    expect(docker('inspect', '--format', '{{.State.Health.Status}}', 'sv-core').stdout.trim()).toBe(
      'healthy',
    );
    expect(existsSync(path.join(fresh, 'deletions.json'))).toBe(false);
  });
});
