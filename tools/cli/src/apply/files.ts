import { Failed } from '../errors.js';
import { docker } from './docker.js';
import type { Host } from './host.js';
import { DATA_VOLUME, filesFolder } from './names.js';

/**
 * The folders of people's files in `sovereign-data` (RFC 0004 §6). A folder is made before the container that mounts it starts, since a
 * `subpath` mount refuses one that is not there, and is owned by the user that container runs as, so it can write there and nothing
 * else can. The work is done in a container of the image given, run as root with `sh`: core's image, which has it.
 */

const NAME = /^[a-z0-9-]{1,63}$/;
const NUMERIC_USER = /^\d+(:\d+)?$/;
const USER_NAME = /^[a-z_][a-z0-9_-]{0,31}$/;

const check = (name: string) => {
  if (!NAME.test(name)) throw new Error(`${name} is not a folder name`);
};

/** Makes the volume when it is not there. */
export async function ensureDataVolume(host: Host): Promise<void> {
  if ((await host.docker(['volume', 'inspect', DATA_VOLUME])).code === 0) return;
  await docker(host, 'Making the volume for people’s files', [
    'volume',
    'create',
    '--label',
    'io.github.sovereignfs.role=files',
    DATA_VOLUME,
  ]);
}

/**
 * The `uid:gid` an image runs as: its `Config.User` when that is numeric, the ids of the name it gives as the image itself says them, and
 * root when it gives none.
 */
export async function imageUser(host: Host, image: string): Promise<string> {
  const inspected = await docker(host, 'Reading the image’s user', [
    'image',
    'inspect',
    '--format',
    '{{.Config.User}}',
    image,
  ]);
  const user = inspected.stdout.trim();
  if (user === '') return '0:0';
  if (NUMERIC_USER.test(user)) return user.includes(':') ? user : `${user}:${user}`;
  const [name, group] = user.split(':');
  if (!name || !USER_NAME.test(name) || (group !== undefined && !USER_NAME.test(group))) {
    throw new Failed(
      `The image ${image} runs as “${user.slice(0, 40)}”, which is not a user name.`,
      'Its USER must be a name or a numeric id.',
    );
  }
  const id = async (flag: '-u' | '-g') =>
    (
      await docker(host, 'Reading the image’s user', [
        'run',
        '--rm',
        '--user',
        '0',
        '--entrypoint',
        'id',
        image,
        flag,
        name,
      ])
    ).stdout.trim();
  const [uid, gid] = await Promise.all([id('-u'), id('-g')]);
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(gid)) {
    throw new Failed(
      `The image ${image} runs as ${name}, whose id it does not say.`,
      'Give its USER as a numeric id, such as 1000.',
    );
  }
  return `${uid}:${gid}`;
}

/** Runs `script` in a container of `image` as root, with the volume at `/v`. `$1`, `$2`… are `args`, never part of the script. */
async function inVolume(
  host: Host,
  what: string,
  image: string,
  script: string,
  args: string[],
  readOnly = false,
) {
  return docker(host, what, [
    'run',
    '--rm',
    '--user',
    '0',
    '--entrypoint',
    'sh',
    '--volume',
    `${DATA_VOLUME}:/v${readOnly ? ':ro' : ''}`,
    image,
    '-c',
    script,
    'sh',
    ...args,
  ]);
}

/** Makes `s3/<name>` when it is not there, and gives it to `owner` (`uid:gid`), readable by it alone. */
export async function ensureFilesFolder(
  host: Host,
  helperImage: string,
  name: string,
  owner: string,
  /** Hand over everything in it, not only the folder: after a restore, which brings back the owners of the machine it was taken on. */
  recursive = false,
): Promise<void> {
  check(name);
  if (!NUMERIC_USER.test(owner)) throw new Error(`${owner} is not a uid:gid`);
  await ensureDataVolume(host);
  await inVolume(
    host,
    `Making the folder for ${name}’s files`,
    helperImage,
    recursive
      ? 'mkdir -p "/v/$1" && chown -R "$2" "/v/$1" && chmod 0700 "/v/$1"'
      : 'mkdir -p "/v/$1" && chown "$2" "/v/$1" && chmod 0700 "/v/$1"',
    [filesFolder(name), owner],
  );
}

/** Deletes `s3/<name>` and everything in it, for an app that is purged. */
export async function removeFilesFolder(
  host: Host,
  helperImage: string,
  name: string,
): Promise<void> {
  check(name);
  if ((await host.docker(['volume', 'inspect', DATA_VOLUME])).code !== 0) return;
  await inVolume(host, `Deleting ${name}’s files`, helperImage, 'rm -rf "/v/$1"', [
    filesFolder(name),
  ]);
}

/** The names of the folders there are, quickly: nothing is measured. */
export async function filesFolders(host: Host, helperImage: string): Promise<string[]> {
  if ((await host.docker(['volume', 'inspect', DATA_VOLUME])).code !== 0) return [];
  const done = await inVolume(
    host,
    'Listing people’s files',
    helperImage,
    'cd /v/s3 2>/dev/null && for d in */; do [ -d "$d" ] && echo "${d%/}"; done; true',
    [],
    true,
  );
  return done.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => NAME.test(name));
}

/** How many bytes each folder holds, by name. */
export async function filesUsage(host: Host, helperImage: string): Promise<Record<string, number>> {
  if ((await host.docker(['volume', 'inspect', DATA_VOLUME])).code !== 0) return {};
  const done = await inVolume(
    host,
    'Measuring people’s files',
    helperImage,
    'cd /v/s3 2>/dev/null && for d in */; do [ -d "$d" ] && printf "%s %s\\n" "${d%/}" "$(du -sk "$d" | cut -f1)"; done; true',
    [],
    true,
  );
  const sizes: Record<string, number> = {};
  for (const line of done.stdout.split('\n')) {
    const [name, kb] = line.trim().split(' ');
    if (name && NAME.test(name) && kb && /^\d+$/.test(kb)) sizes[name] = Number(kb) * 1024;
  }
  return sizes;
}
