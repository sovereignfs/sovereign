import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateError, DEFAULT_APP_PORT, checkEmpty, type CreateIo, type Exec } from './create.js';
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from './versions.js';

/** Where the template is, beside `dist/` once built and beside `src/` when tested. */
const TEMPLATE = fileURLToPath(new URL('../template/app', import.meta.url));

/** A name an app can have: what `sv app add` accepts, since it is also the app's subdomain and its database. */
const NAME = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/** The files and folders npm would not keep under their own names, and the names they are made with. */
const RENAMED: Record<string, string> = {
  _gitignore: '.gitignore',
  _dockerignore: '.dockerignore',
  '_env.example': '.env.example',
  // A published package may not carry a file called tsconfig.json.
  '_tsconfig.json': 'tsconfig.json',
  _github: '.github',
};

export type AppNames = { name: string; prefix: string; title: string };

/** What an app is called everywhere, from the folder it is made in. */
export function namesOf(dir: string): AppNames {
  const name = path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!NAME.test(name)) {
    throw new CreateError(
      `“${path.basename(dir)}” is not a name an app can have.`,
      2,
      'Use 2 to 32 lower-case letters, digits and hyphens, starting with a letter. Nothing was written.',
    );
  }
  const prefix = name.replace(/-/g, '').toUpperCase();
  if (prefix === 'SV') {
    throw new CreateError(
      'SV is core’s own prefix, so no app can be called sv.',
      2,
      'Choose another name.',
    );
  }
  const title = name
    .split('-')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
  return { name, prefix, title };
}

async function* walk(dir: string, base = dir): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else yield path.relative(base, full);
  }
}

/** The `package.json` of a new app. */
export function appPackageJson(names: AppNames, port: number = DEFAULT_APP_PORT): string {
  return `${JSON.stringify(
    {
      name: names.name,
      version: '0.1.0',
      private: true,
      description: `${names.title}, an app for a Sovereign instance`,
      engines: { node: '>=24.15' },
      scripts: {
        // The manifest's port, so `npm run dev` and the image listen where the instance and .env.example say.
        dev: `next dev --port ${port}`,
        build: 'next build',
        start: `PORT=\${PORT:-${port}} node .next/standalone/server.js`,
        typecheck: 'tsc --noEmit',
        'manifest:check': 'sovereign-manifest check',
      },
      dependencies: APP_DEPENDENCIES,
      devDependencies: APP_DEV_DEPENDENCIES,
    },
    null,
    2,
  )}\n`;
}

/** Writes the files of an app into `target`, which must be empty or absent, and returns what it wrote. */
export async function writeApp(
  target: string,
  names: AppNames,
  port: number = DEFAULT_APP_PORT,
): Promise<string[]> {
  await checkEmpty(target);
  const written: string[] = [];
  const replace = (text: string) =>
    text
      // The variables are upper case (`MYNOTES_URL`); the manifest names the app in lower case (contracts/app-manifest.md §2.4).
      .replaceAll('__PREFIX_LOWER__', names.prefix.toLowerCase())
      .replaceAll('__PREFIX__', names.prefix)
      .replaceAll('__NAME__', names.name)
      .replaceAll('__TITLE__', names.title)
      .replaceAll('__PORT__', String(port));

  for await (const file of walk(TEMPLATE)) {
    const out = path.join(...file.split(path.sep).map((part) => RENAMED[part] ?? part));
    const target_ = path.join(target, out);
    await mkdir(path.dirname(target_), { recursive: true });
    let text = replace(await readFile(path.join(TEMPLATE, file), 'utf8'));
    // The template's manifest stays valid JSON (it is formatted and checked as such), so its port is a number and not a placeholder.
    if (out === 'sovereign.manifest.json') text = text.replace(/"port": \d+/, `"port": ${port}`);
    await writeFile(target_, text);
    written.push(out);
  }
  await writeFile(path.join(target, 'package.json'), appPackageJson(names, port));
  written.push('package.json');
  return written.sort();
}

/**
 * Makes an app (operator-cli §2.2): a Next.js app that signs people in through core and meets the app manifest, so an instance can host it
 * as it stands. The files, `git init`, the lockfile, and the first commit. It does not install or build.
 */
export async function createApp(
  request: { dir: string; port?: number },
  io: CreateIo,
  exec: Exec,
  cwd: string,
): Promise<void> {
  const target = path.resolve(cwd, request.dir);
  const names = namesOf(target);
  const port = request.port ?? DEFAULT_APP_PORT;
  const written = await writeApp(target, names, port);
  io.err(`Wrote the files of ${names.name}, on port ${port}.`);

  const step = async (label: string, command: string, args: string[], hint: string) => {
    const done = await exec(command, args, { cwd: target });
    if (done.code !== 0) {
      throw new CreateError(
        `${label} failed: ${(done.stderr || done.stdout).trim().split('\n').slice(-3).join(' ')}`,
        1,
        hint,
      );
    }
  };
  await step(
    'git init',
    'git',
    ['init', '--initial-branch=main'],
    'Is git installed? Then run the rest by hand: see README.md.',
  );
  await step(
    'Resolving the packages',
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    `Check the network, then run npm install in ${request.dir}.`,
  );
  await step('git add', 'git', ['add', '--', ...written, 'package-lock.json'], '');
  await step(
    'The first commit',
    'git',
    ['commit', '-m', 'Create the app'],
    'git needs a name and an email: git config --global user.name ... and user.email ..., then commit by hand.',
  );
  io.err(
    `Made ${names.name}. Next:\n  cd ${request.dir}\n  npm install && npm run dev   (http://localhost:${port})\n  npm run build\n  docker build -t ${names.name} .\nThen host it with ./sv app add ${names.name} --image <the image> in your instance. See README.md.`,
  );
}
