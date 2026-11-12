/**
 * Each app's folder of people's files against the real Docker (RFC 0004 §1, §6): the folders are made in one volume and owned by the
 * user the image runs as, a container that mounts one folder with `subpath` sees that folder and nothing else of the volume, writes there
 * as the image's own user, and a folder that is deleted is gone. It needs an image with a shell and a non-root user: core's, built by
 * the other Docker tests (`SV_TEST_CORE_IMAGE`), and skips itself when Docker is down, the image is missing or the volume's name is taken.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { copyFiles } from './backup.js';
import { realHost } from './host.js';
import { restoreFiles } from './restore.js';
import { DATA_VOLUME, filesFolder, filesTarget } from './names.js';
import { ensureFilesFolder, filesUsage, imageUser, removeFilesFolder } from './files.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const IMAGE = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
const runnable =
  docker('version', '--format', '{{.Server.Version}}').status === 0 &&
  docker('image', 'inspect', IMAGE).status === 0 &&
  docker('volume', 'inspect', DATA_VOLUME).status !== 0;

/** Runs a shell command in a container that mounts one app's folder, starting in it, as the image's own user. */
const inside = (app: string, script: string) =>
  docker(
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '--mount',
    `type=volume,source=${DATA_VOLUME},target=${filesTarget(app)},volume-subpath=${filesFolder(app)}`,
    IMAGE,
    '-c',
    `cd ${filesTarget(app)} && ${script}`,
  );

describe.skipIf(!runnable)('folders of people’s files against the real Docker', () => {
  const host = realHost(() => undefined);
  afterAll(() => {
    docker('volume', 'rm', '--force', DATA_VOLUME);
  });

  it('are made for each app, owned by the image’s user, and each container sees only its own', async () => {
    const owner = await imageUser(host, IMAGE);
    expect(owner).toMatch(/^\d+:\d+$/);
    expect(owner).not.toBe('0:0');
    await ensureFilesFolder(host, IMAGE, 'alpha', owner);
    await ensureFilesFolder(host, IMAGE, 'beta', owner);
    // Doing it again changes nothing, and does not fail.
    await ensureFilesFolder(host, IMAGE, 'alpha', owner);

    const wrote = inside('alpha', 'mkdir person-1 && echo secret > person-1/file && id -u');
    expect(wrote.status, wrote.stderr).toBe(0);
    expect(wrote.stdout.trim()).toBe(owner.split(':')[0]);

    // It is kept in the volume, not in the container: another container of alpha's sees it.
    expect(inside('alpha', 'cat person-1/file').stdout.trim()).toBe('secret');
    // beta's folder holds none of alpha's, and alpha's container has no way to name beta's.
    expect(inside('beta', 'ls -A .').stdout.trim()).toBe('');
    const reach = inside('alpha', 'ls /data/s3/beta; cat ../beta/person-1/file');
    expect(reach.status).not.toBe(0);
    expect(reach.stdout).not.toContain('secret');
    // The image's own folder for core's files is part of the image (`/data/s3/core`), so the listing has it and alpha's; it has no beta.
    const listing = inside('alpha', 'ls /data/s3').stdout.trim().split('\n');
    expect(listing).toContain('alpha');
    expect(listing).not.toContain('beta');
    // And a person's folder in alpha's is not writable by someone else's user.
    expect(inside('alpha', 'stat -c %u:%g .').stdout.trim()).toBe(owner);
  }, 120_000);

  it('are measured, and gone once deleted, leaving the others', async () => {
    const sizes = await filesUsage(host, IMAGE);
    expect(Object.keys(sizes).sort()).toEqual(['alpha', 'beta']);
    expect(sizes.alpha).toBeGreaterThan(0);
    await removeFilesFolder(host, IMAGE, 'alpha');
    expect(Object.keys(await filesUsage(host, IMAGE))).toEqual(['beta']);
    expect(inside('beta', 'echo ok').stdout.trim()).toBe('ok');
  }, 120_000);

  it('are taken into a tar and put back as they were, with usage records gone and owners handed over', async () => {
    const TOOLKIT = process.env.SV_TEST_CLI_IMAGE ?? 'sv-test-cli:local';
    expect(docker('image', 'inspect', TOOLKIT).status, `${TOOLKIT} must exist`).toBe(0);
    const owner = await imageUser(host, IMAGE);
    await ensureFilesFolder(host, IMAGE, 'gamma', owner);
    const wrote = inside(
      'gamma',
      'mkdir person-1 && echo before > person-1/photo && echo \'{"bytes":1}\' > person-1/.usage.json',
    );
    expect(wrote.status, wrote.stderr).toBe(0);

    // Taken as sv backup takes it, through the toolkit's image with the volume read only.
    const work = mkdtempSync(path.join(os.tmpdir(), 'sv-files-backup-'));
    try {
      await copyFiles(host, TOOLKIT, work, ['gamma']);
      expect(existsSync(path.join(work, 'files', 'gamma.tar'))).toBe(true);

      // After the backup, and then more is written.
      expect(inside('gamma', 'echo after > person-1/later && echo x > stranger').status).toBe(0);

      // Put back as sv restore puts it: emptied, unpacked, usage records removed, then handed to the app's user at its start.
      const put = await restoreFiles(host, work, TOOLKIT, {
        all: false,
        core: false,
        apps: ['gamma'],
      });
      expect(put).toEqual(['gamma']);
      await ensureFilesFolder(host, IMAGE, 'gamma', owner, true);
      const seen = inside(
        'gamma',
        'ls -A . ; ls -A person-1; cat person-1/photo; stat -c %u:%g person-1/photo .',
      );
      expect(seen.status, seen.stderr).toBe(0);
      expect(seen.stdout.trim().split('\n')).toEqual(['person-1', 'photo', 'before', owner, owner]);
      expect(inside('gamma', 'echo mine > person-1/new').status).toBe(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 180_000);
});
