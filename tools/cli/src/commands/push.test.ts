import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTES_IMAGE, setUpWorld, sv } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';
import { RELEASE } from '../release.js';

/** The core `sv setup` writes into suite.yml. */
const CORE = RELEASE.newestCore;

let world: World;
afterEach(() => world.cleanup());
const write = (name: string, text: string) => {
  mkdirSync(path.dirname(path.join(world.root, name)), { recursive: true });
  writeFileSync(path.join(world.root, name), text);
};
const read = (name: string) => readFileSync(path.join(world.root, name), 'utf8');
const committed = () => {
  try {
    world.git('rev-parse', '--verify', 'HEAD');
    return true;
  } catch {
    return false;
  }
};
const remoteLog = () =>
  execFileSync('git', ['--git-dir', world.remote, 'log', '--format=%s', 'main'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
const remoteFiles = () =>
  execFileSync('git', ['--git-dir', world.remote, 'ls-tree', '-r', '--name-only', 'main'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .sort();
const ready = async (options: Parameters<typeof makeWorld>[0] = {}) => {
  world = makeWorld({ images: { [NOTES_IMAGE]: { manifest: manifestOf() } }, ...options });
  await setUpWorld(world);
};

describe('sv push', () => {
  it('commits only the files of an instance repository and pushes them, leaving other files alone', async () => {
    await ready({ stdin: 'v' });
    write('overrides/compose/core.yml', 'services: {}\n');
    write('notes-to-self.txt', 'not part of the instance');
    const done = await sv(world, 'push', '-m', 'First deployment');
    expect(done.code).toBe(0);
    expect(remoteLog()).toEqual(['First deployment']);
    expect(remoteFiles()).toEqual([
      'overrides/compose/core.yml',
      'package.json',
      'suite.lock',
      'suite.yml',
      'sv',
    ]);
    expect(world.git('status', '--porcelain')).toContain('?? notes-to-self.txt');
    expect(done.text).toContain('Pushed');
  });

  it('says there is nothing new when nothing changed, and still pushes what is waiting', async () => {
    await ready();
    await sv(world, 'push');
    const done = await sv(world, 'push');
    expect(done.code).toBe(0);
    expect(done.text).toContain('Nothing new to commit');
    expect(remoteLog()).toEqual(['Update the instance']);
  });

  it('pushes a commit that was made by hand and not pushed', async () => {
    await ready();
    await sv(world, 'push');
    write('README.md', '# mine');
    world.git('add', 'README.md');
    world.git('commit', '-m', 'by hand');
    expect((await sv(world, 'push')).code).toBe(0);
    expect(remoteLog()).toEqual(['by hand', 'Update the instance']);
  });

  it('refuses a file that is already staged and is not the instance’s, and changes nothing', async () => {
    await ready();
    write('terraform.tfstate', '{"secret": "yes"}');
    world.git('add', 'terraform.tfstate');
    const done = await sv(world, 'push');
    expect(done.code).toBe(2);
    expect(done.text).toContain('terraform.tfstate');
    expect(done.text).toContain('sv push stages only its own files');
    expect(committed()).toBe(false);
  });

  it('refuses a suite.yml that is not valid, and one whose lock is out of date, saying what is wrong', async () => {
    await ready();
    const text = read('suite.yml');
    write('suite.yml', text.replace('domain: sovereign.example.com', 'domain: NO'));
    const bad = await sv(world, 'push');
    expect(bad.code).toBe(2);
    expect(bad.text).toContain('suite.yml is not valid');
    write('suite.yml', text.replace(`version: ${CORE}`, 'version: 0.70.0'));
    const stale = await sv(world, 'push');
    expect(stale.code).toBe(2);
    expect(stale.text).toContain(
      `images.core: is ghcr.io/sovereignfs/sovereign:${CORE}, and suite.yml wants ghcr.io/sovereignfs/sovereign:0.70.0`,
    );
    expect(committed()).toBe(false);
  });

  it('refuses a secret in plain text in secrets.age.yml and one in the open in suite.yml', async () => {
    await ready();
    write('secrets.age.yml', 'core:\n  SV_SMTP_PASSWORD: hunter2\n');
    const plain = await sv(world, 'push');
    expect(plain.code).toBe(2);
    expect(plain.text).toContain('secrets.age.yml.core.SV_SMTP_PASSWORD: is not age ciphertext');
    write('secrets.age.yml', '');
    write(
      'suite.yml',
      read('suite.yml').replace(
        `core:\n  version: ${CORE}`,
        `core:\n  version: ${CORE}\n  env:\n    SV_SMTP_USER: postgres://u:pw@h/db`,
      ),
    );
    const open = await sv(world, 'push');
    expect(open.code).toBe(2);
    expect(open.text).toContain('looks like a secret');
    expect(plain.text).toContain('a guard and not a guarantee');
  });

  it('refuses secrets that belong to something that is not in suite.yml', async () => {
    await ready({ stdin: 'v' });
    await sv(world, 'secret', 'set', 'SV_SMTP_PASSWORD');
    write('secrets.age.yml', read('secrets.age.yml').replace('core:', 'ghost:'));
    expect((await sv(world, 'push')).text).toContain(
      'belongs to something that is not core or an app',
    );
  });

  it('refuses an app whose manifest cannot be read or whose env is not allowed', async () => {
    await ready();
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    write(
      'suite.yml',
      read('suite.yml').replace(
        `image: ${NOTES_IMAGE}`,
        `image: ${NOTES_IMAGE}\n    env:\n      OTHER_X: '1'`,
      ),
    );
    const done = await sv(world, 'push');
    expect(done.code).toBe(2);
    expect(done.text).toContain('apps.notes.env.OTHER_X: must begin with NOTES_');
  });

  it('refuses without a remote or outside a git repository, and says what to do', async () => {
    await ready();
    world.git('remote', 'remove', 'origin');
    expect((await sv(world, 'push')).text).toContain('no remote');
    world.cleanup();
    world = makeWorld({ withGit: false });
    await setUpWorld(world);
    expect((await sv(world, 'push')).text).toContain('not a git repository');
  });

  it('fails, and says it is safe to run again, when git cannot push', async () => {
    await ready();
    world.git('remote', 'set-url', 'origin', '/nonexistent/remote.git');
    const done = await sv(world, 'push');
    expect(done.code).toBe(1);
    expect(done.text).toContain('git push failed');
    expect(done.text).toContain('run sv push again');
  });
});
