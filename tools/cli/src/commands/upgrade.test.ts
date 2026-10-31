import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { RELEASE } from '../release.js';
import { NOTES_IMAGE, sv, setUpWorld } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';
import type { Lock, Suite } from '../suite/types.js';

let world: World;
afterEach(() => world.cleanup());
const read = (name: string) => readFileSync(path.join(world.root, name), 'utf8');
const suite = () => parse(read('suite.yml')) as Suite;
const lock = () => parse(read('suite.lock')) as Lock;
const ready = async () => {
  world = makeWorld({ images: { [NOTES_IMAGE]: { manifest: manifestOf() } } });
  await setUpWorld(world, '--deploy', 'ssh');
  await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
};
/** package.json as `npm create` leaves it, pinned to the toolkit that is running. */
const pinTo = (version: string) =>
  writeFileSync(
    path.join(world.root, 'package.json'),
    JSON.stringify({ name: 'x', private: true, dependencies: { '@sovereignfs/cli': version } }),
  );
/** Makes the repository look as it does after a release: an older core and the previous toolkit in the lock. */
function atAnOlderRelease() {
  const text = read('suite.yml').replace(`version: ${RELEASE.newestCore}`, 'version: 0.60.0');
  writeFileSync(path.join(world.root, 'suite.yml'), text);
  const locked = read('suite.lock')
    .replace(
      new RegExp(`(ghcr\\.io/sovereignfs/cli:)${RELEASE.version.replace(/\./g, '\\.')}`),
      '$10.0.9',
    )
    .replace(/(sovereign:)\d+\.\d+\.\d+/, '$10.60.0');
  writeFileSync(path.join(world.root, 'suite.lock'), locked);
}

describe('sv upgrade --finish', () => {
  it('moves core to the newest this toolkit was made for and refreshes the lock, and nothing else', async () => {
    await ready();
    pinTo(RELEASE.version);
    atAnOlderRelease();
    const apps = JSON.stringify(suite().apps);
    const database = suite().database.version;
    const done = await sv(world, 'upgrade', '--finish');
    expect(done.code).toBe(0);
    expect(suite().core.version).toBe(RELEASE.newestCore);
    expect(lock().images.core.ref).toBe(`ghcr.io/sovereignfs/sovereign:${RELEASE.newestCore}`);
    expect(lock().images.cli.ref).toBe(`ghcr.io/sovereignfs/cli:${RELEASE.version}`);
    expect(JSON.stringify(suite().apps)).toBe(apps);
    expect(suite().database.version).toBe(database);
    expect(done.text).toContain(`core: 0.60.0 → ${RELEASE.newestCore}`);
    expect(done.text).toContain('toolkit: 0.0.9');
    expect(done.text).toContain('App versions and database.version are not moved');
  });

  it('moves the pin of the workflow that deploys from GitHub with the toolkit, and leaves one that calls something else', async () => {
    await ready();
    pinTo(RELEASE.version);
    const file = path.join(world.root, '.github', 'workflows', 'deploy.yml');
    (await import('node:fs')).mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      'jobs:\n  deploy:\n    uses: sovereignfs/sovereign/.github/workflows/deploy.yml@cli-v0.0.9\n',
    );
    const done = await sv(world, 'upgrade', '--finish');
    expect(done.code).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain(`deploy.yml@cli-v${RELEASE.version}`);
    expect(done.text).toContain('.github/workflows/deploy.yml: calls the toolkit’s workflow');
    writeFileSync(file, 'jobs:\n  deploy:\n    uses: someone/else/.github/workflows/x.yml@v1\n');
    await sv(world, 'upgrade', '--finish');
    expect(readFileSync(file, 'utf8')).toContain('someone/else');
  });

  it('keeps what the operator wrote in suite.yml, comments included', async () => {
    await ready();
    pinTo(RELEASE.version);
    atAnOlderRelease();
    writeFileSync(path.join(world.root, 'suite.yml'), `# my instance\n${read('suite.yml')}`);
    await sv(world, 'upgrade', '--finish');
    expect(read('suite.yml')).toMatch(/^# my instance\n/);
  });

  it('never takes core backward', async () => {
    await ready();
    pinTo(RELEASE.version);
    const text = read('suite.yml').replace(`version: ${RELEASE.newestCore}`, 'version: 0.99.0');
    writeFileSync(path.join(world.root, 'suite.yml'), text);
    const done = await sv(world, 'upgrade', '--finish');
    expect(suite().core.version).toBe('0.99.0');
    expect(done.code).toBe(0);
    // The lock follows the file it was edited under; core's version is not touched.
    expect(done.text).not.toMatch(/^ {2}core: /m);
  });

  it('says there is nothing to change when the repository is already at this release', async () => {
    await ready();
    pinTo(RELEASE.version);
    const done = await sv(world, 'upgrade', '--finish');
    expect(done.code).toBe(0);
    expect(done.text).toContain('Nothing to change');
  });

  it('refuses when package.json pins another toolkit than the one running, changing nothing', async () => {
    await ready();
    pinTo('9.9.9');
    const before = read('suite.yml');
    const done = await sv(world, 'upgrade', '--finish');
    expect(done.code).toBe(2);
    expect(done.text).toContain('pins the toolkit to 9.9.9');
    expect(read('suite.yml')).toBe(before);
  });

  it('refuses a suite.yml from a newer schema than it reads, and one it has no migration for', async () => {
    await ready();
    pinTo(RELEASE.version);
    writeFileSync(
      path.join(world.root, 'suite.yml'),
      read('suite.yml').replace('schema: 1', 'schema: 2'),
    );
    const done = await sv(world, 'upgrade', '--finish');
    expect(done.code).toBe(2);
  });
});

describe('sv upgrade', () => {
  it('installs the release asked for, exactly, and hands the rest to it', async () => {
    await ready();
    pinTo(RELEASE.version);
    const ran: { command: string; args: string[] }[] = [];
    world.ctx.exec = async (command, args) => {
      ran.push({ command, args: [...args] });
      return {
        code: 0,
        stdout: command === 'node' ? 'finished by the new toolkit' : '',
        stderr: '',
      };
    };
    // The new toolkit is on disk once npm has installed it.
    const cli = path.join(world.root, 'node_modules', '@sovereignfs', 'cli', 'dist');
    (await import('node:fs')).mkdirSync(cli, { recursive: true });
    writeFileSync(path.join(cli, 'sv.mjs'), '');
    const done = await sv(world, 'upgrade', '--to', 'v0.2.0');
    expect(done.code).toBe(0);
    expect(ran[0]).toEqual({
      command: 'npm',
      args: [
        'install',
        '--save-exact',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '@sovereignfs/cli@0.2.0',
      ],
    });
    expect(ran[1]).toEqual({
      command: 'node',
      args: [path.join(cli, 'sv.mjs'), 'upgrade', '--finish'],
    });
    expect(done.text).toContain('finished by the new toolkit');
  });

  it('asks npm for the newest release when told none, and does nothing when this is it', async () => {
    await ready();
    pinTo(RELEASE.version);
    world.ctx.fetch = (async () =>
      new Response(JSON.stringify({ 'dist-tags': { latest: RELEASE.version } }))) as typeof fetch;
    const done = await sv(world, 'upgrade');
    expect(done.code).toBe(0);
    expect(done.text).toContain('Nothing to change');
  });

  it('says what to pass when npm cannot be asked', async () => {
    await ready();
    const done = await sv(world, 'upgrade');
    expect(done.code).toBe(2);
    expect(done.text).toContain('--to vX.Y.Z');
  });

  it('reports a failed install without touching the repository, and refuses what is not a release', async () => {
    await ready();
    pinTo(RELEASE.version);
    const before = read('suite.yml');
    world.ctx.exec = async () => ({ code: 1, stdout: '', stderr: 'npm error 404 Not Found' });
    const failed = await sv(world, 'upgrade', '--to', '0.2.0');
    expect(failed.code).toBe(1);
    expect(failed.text).toContain('404 Not Found');
    expect(read('suite.yml')).toBe(before);
    expect((await sv(world, 'upgrade', '--to', 'latest')).code).toBe(2);
    expect((await sv(world, 'upgrade', '--to', '1.0.0-rc.1')).code).toBe(2);
  });
});
