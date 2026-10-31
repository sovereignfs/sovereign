/**
 * The server's side of `sv deploy`, against the real Docker: the toolkit built into its image, started the way the server's wrapper
 * starts it, given a real archive, and left to run `sv apply` on it in a container of its own. Core's image is not published until the
 * first release, so the base cannot come up here and this stops where it must: it proves the image, the mounts, the Docker client inside
 * it, the archive, the detached run, the log following and the exit code. The base itself is `apply.docker.test.ts`.
 *
 * It uses the names `sv apply` uses, and skips itself when they are taken. Run it with `pnpm test:docker`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { realReceiverHost } from '../apply/host.js';
import { makeSource, type Source } from '../testing/source.js';
import { receive, APPLY_CONTAINER } from './receive.js';
import { makeArchive } from './tar.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerUp = docker('version', '--format', '{{.Server.Version}}').status === 0;
const NAMES = ['sv-core', 'sv-proxy', 'sv-database', APPLY_CONTAINER];
const taken =
  dockerUp &&
  (docker('ps', '-a', '--format', '{{.Names}}')
    .stdout.split('\n')
    .some((name) => NAMES.includes(name)) ||
    docker('network', 'inspect', 'sv-net-core').status === 0);
const runnable = dockerUp && !taken;

describe.skipIf(!runnable)('the server receiving a deployment against the real Docker', () => {
  const image = 'sv-test-cli:local';
  let source: Source;
  let state: string;
  const lines: string[] = [];

  beforeAll(async () => {
    execFileSync('pnpm', ['--filter', '@sovereignfs/cli', 'build'], { cwd: root, stdio: 'ignore' });
    execFileSync('docker', ['build', '--quiet', '--tag', image, path.join(root, 'apps/cli')], {
      stdio: 'ignore',
    });
    source = await makeSource({ suite: { domain: 'sv-test.example.test' } });
    state = mkdtempSync(path.join(os.tmpdir(), 'sv-recv-state-'));
  });
  afterAll(() => {
    docker('rm', '--force', ...NAMES);
    docker('compose', '--project-name', 'sovereign-database', 'down', '--volumes');
    docker('network', 'rm', 'sv-net-core');
    for (const dir of [state, source && path.dirname(source.dir)]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  const deploy = (commit: string, archive: Buffer) =>
    receive(
      realReceiverHost((line) => lines.push(line)),
      {
        line: `deploy ${commit}`,
        deployOnly: true,
        stateDir: state,
        stdin: async () => archive,
        out: (text) => lines.push(text),
        imageOverride: image,
        applyFlags: ['--skip-dns', '--no-publish-ports'],
      },
    );

  it('runs sv apply from the toolkit image on the files it was sent, follows it to the end, and ends with its exit code', async () => {
    const commit = 'c'.repeat(40);
    const code = await deploy(
      commit,
      makeArchive({
        'suite.yml': readFileSync(path.join(source.dir, 'suite.yml'), 'utf8'),
        'suite.lock': readFileSync(path.join(source.dir, 'suite.lock'), 'utf8'),
      }),
    );
    const text = lines.join('');
    // It got as far as the base, which cannot come up with an image that is not published; that is a failure, exit 1, and says so.
    expect(text).toContain(`Received 2 files for ${commit.slice(0, 12)}`);
    expect(text).toContain('Checked suite.yml, suite.lock, the manifests and the overrides.');
    expect(text).toContain('Docker, disk space and DNS are as they should be.');
    expect(code).toBe(1);
    // The deployment stays readable afterwards.
    const kept = docker('logs', APPLY_CONTAINER);
    expect(`${kept.stdout}${kept.stderr}`).toContain('Checked suite.yml');
    // It ran in the state directory it was given, as root, with the Docker socket: the release it rendered is there.
    expect(docker('inspect', '--format', '{{.State.Running}}', APPLY_CONTAINER).stdout.trim()).toBe(
      'false',
    );
  });
});
