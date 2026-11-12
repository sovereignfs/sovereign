/**
 * Each app's folder of people's files against the real Docker (RFC 0004 §1, §6): the folders are made in one volume and owned by the
 * user the image runs as, a container that mounts one folder with `subpath` sees that folder and nothing else of the volume, writes there
 * as the image's own user, and a folder that is deleted is gone. It needs an image with a shell and a non-root user: core's, built by
 * the other Docker tests (`SV_TEST_CORE_IMAGE`), and skips itself when Docker is down, the image is missing or the volume's name is taken.
 */
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { realHost } from './host.js';
import { DATA_VOLUME, filesFolder, filesTarget } from './names.js';
import { ensureFilesFolder, filesUsage, imageUser, removeFilesFolder } from './files.js';

const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const IMAGE = process.env.SV_TEST_CORE_IMAGE ?? 'sv-test-core:local';
const runnable =
  docker('version', '--format', '{{.Server.Version}}').status === 0 &&
  docker('image', 'inspect', IMAGE).status === 0 &&
  docker('volume', 'inspect', DATA_VOLUME).status !== 0;

/** Runs a shell command in a container that mounts one app's folder, as the image's own user. */
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
    script,
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

    // beta's folder is empty of alpha's, and alpha's container has no way to name beta's.
    expect(inside('beta', 'ls -A /data/s3/beta').stdout.trim()).toBe('');
    const reach = inside('alpha', 'ls /data/s3/beta; ls /data/s3; cat ../beta/person-1/file');
    expect(reach.stdout).not.toContain('person-1');
    expect(reach.status).not.toBe(0);
    expect(inside('alpha', 'ls /data/s3').stdout.trim()).toBe('alpha');
  }, 120_000);

  it('are measured, and gone once deleted, leaving the others', async () => {
    const sizes = await filesUsage(host, IMAGE);
    expect(Object.keys(sizes).sort()).toEqual(['alpha', 'beta']);
    expect(sizes.alpha).toBeGreaterThan(0);
    await removeFilesFolder(host, IMAGE, 'alpha');
    expect(Object.keys(await filesUsage(host, IMAGE))).toEqual(['beta']);
    expect(inside('beta', 'echo ok').stdout.trim()).toBe('ok');
  }, 120_000);
});
