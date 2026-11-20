import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CreateError, DEFAULT_APP_PORT, checkEmpty, type CreateIo, type Exec } from './create.js';
import { ENCRYPTION_TEMPLATE, fill, managerTemplate, TEMPLATE, targetOf } from './fill.js';
import { DEFAULT_PACKAGE_MANAGER, MANAGERS, type PackageManager } from './package-manager.js';
import { TOOL_COMMANDS } from './commands.js';
import { DEFAULT_REQUIRED_CHECKS, repositorySettings } from './settings-file.js';
import {
  APP_DEPENDENCIES,
  APP_DEV_DEPENDENCIES,
  CREATE_VERSION,
  ENCRYPTION_DEPENDENCIES,
  ENCRYPTION_LEAVES_OUT,
  SHARED_WORKFLOWS_REF,
} from './versions.js';

/** A name an app can have: what `sv app add` accepts, since it is also the app's subdomain and its database. */
const NAME = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

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
  if ((TOOL_COMMANDS as readonly string[]).includes(name)) {
    throw new CreateError(
      `${name} is a command of npm create @sovereignfs app, so no app can be called that.`,
      2,
      'Choose another name.',
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

/** The file of an overlay that names the base app's files it leaves out, one path to a line; `#` starts a comment. */
const SKIP_FILE = '_skip';

async function skipList(overlay: string): Promise<Set<string>> {
  const text = await readFile(path.join(overlay, SKIP_FILE), 'utf8').catch(() => '');
  return new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#')),
  );
}

/** The `package.json` of a new app. */
export function appPackageJson(
  names: AppNames,
  port: number = DEFAULT_APP_PORT,
  options: { encryption?: boolean; packageManager?: PackageManager } = {},
): string {
  const manager = MANAGERS[options.packageManager ?? DEFAULT_PACKAGE_MANAGER];
  return `${JSON.stringify(
    {
      // Every app of the suite is named in the @sovereignfs scope. It is private, so the name claims nothing on npm.
      name: `@sovereignfs/${names.name}`,
      version: '0.1.0',
      private: true,
      description: `${names.title}, an app for a Sovereign instance`,
      engines: { node: '>=24.15' },
      // The manager and its version, which corepack runs in the image and in CI. An app made with npm has none.
      ...(manager.pin ? { packageManager: manager.pin } : {}),
      scripts: {
        // The manifest's port, so `dev` and the image listen where the instance and .env.example say.
        dev: `next dev --port ${port}`,
        build: 'next build',
        start: `PORT=\${PORT:-${port}} node .next/standalone/server.js`,
        typecheck: 'tsc --noEmit',
        'manifest:check': 'sovereign-manifest check',
        // What the pre-push hook runs: CI does not run for `develop` or a feature branch (CONTRIBUTING.md).
        verify: `${manager.run} typecheck && ${manager.run} manifest:check`,
        // Turns the versioned hooks on for whoever installs; harmless where there is no repository (the image's build).
        [manager.hookScript]: 'git config core.hooksPath .githooks || true',
      },
      dependencies: options.encryption
        ? Object.fromEntries(
            Object.entries({ ...APP_DEPENDENCIES, ...ENCRYPTION_DEPENDENCIES }).filter(
              ([name]) => !(ENCRYPTION_LEAVES_OUT as readonly string[]).includes(name),
            ),
          )
        : APP_DEPENDENCIES,
      // `@sovereignfs/create` is pinned exactly: `npm create @sovereignfs sync` and the shared workflows run this version (research 0007).
      devDependencies: { ...APP_DEV_DEPENDENCIES, '@sovereignfs/create': CREATE_VERSION },
      // What the shared files need of this app: its tag prefix, the checks its main requires, and any shared file it keeps as its own.
      sovereign: { tagPrefix: '', requiredChecks: [...DEFAULT_REQUIRED_CHECKS], unmanaged: [] },
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
  options: { encryption?: boolean; packageManager?: PackageManager } = {},
): Promise<string[]> {
  await checkEmpty(target);
  const written = new Set<string>();
  const packageManager = options.packageManager ?? DEFAULT_PACKAGE_MANAGER;
  const values = {
    names,
    port,
    workflowsRef: SHARED_WORKFLOWS_REF,
    directory: '.',
    tagPrefix: '',
    packageManager,
  };
  const replace = (text: string) => fill(text, values);

  // With `--encryption`, its files are written over the app's: the same names replace, new ones are added, and the app's files its
  // `_skip` names are left out. The manager's own files (Yarn's settings) are written last, over both.
  const managerFiles = managerTemplate(packageManager);
  const sources = [
    TEMPLATE,
    ...(options.encryption ? [ENCRYPTION_TEMPLATE] : []),
    ...(existsSync(managerFiles) ? [managerFiles] : []),
  ];
  const skipped = options.encryption ? await skipList(ENCRYPTION_TEMPLATE) : new Set<string>();
  for (const source of sources)
    for await (const file of walk(source)) {
      if (file === SKIP_FILE) continue;
      const out = targetOf(file);
      if (source === TEMPLATE && skipped.has(out.split(path.sep).join('/'))) continue;
      const target_ = path.join(target, out);
      await mkdir(path.dirname(target_), { recursive: true });
      let text = replace(await readFile(path.join(source, file), 'utf8'));
      // The template's manifest stays valid JSON (it is formatted and checked as such), so its port is a number and not a placeholder.
      if (out === 'sovereign.manifest.json') text = text.replace(/"port": \d+/, `"port": ${port}`);
      if (out === path.join('.github', 'repository.json'))
        text = repositorySettings(text, DEFAULT_REQUIRED_CHECKS);
      // A hook runs only when it is executable.
      await writeFile(target_, text, {
        mode: out.startsWith(`.githooks${path.sep}`) ? 0o755 : 0o644,
      });
      written.add(out);
    }
  await writeFile(
    path.join(target, 'package.json'),
    appPackageJson(names, port, { ...options, packageManager }),
  );
  written.add('package.json');
  return [...written].sort();
}

/**
 * Makes an app (operator-cli §2.2): a Next.js app that signs people in through core and meets the app manifest, so an instance can host it
 * as it stands. The files, `git init`, the lockfile, the first commit on `main`, and `develop` checked out. It does not install or build.
 */
export async function createApp(
  request: { dir: string; port?: number; encryption?: boolean; packageManager?: PackageManager },
  io: CreateIo,
  exec: Exec,
  cwd: string,
): Promise<void> {
  const target = path.resolve(cwd, request.dir);
  const names = namesOf(target);
  const port = request.port ?? DEFAULT_APP_PORT;
  const packageManager = request.packageManager ?? DEFAULT_PACKAGE_MANAGER;
  const manager = MANAGERS[packageManager];
  const written = await writeApp(target, names, port, {
    encryption: request.encryption ?? false,
    packageManager,
  });
  io.err(
    `Wrote the files of ${names.name}, on port ${port}, with ${packageManager}${request.encryption ? ', with its notes encrypted' : ''}.`,
  );

  const failed = (label: string, done: { stdout: string; stderr: string }, hint: string) =>
    new CreateError(
      `${label} failed: ${(done.stderr || done.stdout).trim().split('\n').slice(-3).join(' ')}`,
      1,
      hint,
    );
  const step = async (label: string, command: string, args: string[], hint: string) => {
    const done = await exec(command, args, { cwd: target });
    if (done.code !== 0) throw failed(label, done, hint);
  };
  await step(
    'git init',
    'git',
    ['init', '--initial-branch=main'],
    'Is git installed? Then run the rest by hand: see README.md.',
  );
  // pnpm and Yarn are often not installed, but come with Node through corepack, which runs the version `packageManager` pins.
  const [command, ...args] = manager.lockfileOnly as [string, ...string[]];
  const resolving = `Check the network, and that ${packageManager} is installed (${
    manager.corepack ? `corepack enable ${packageManager}, or ` : ''
  }choose another with --package-manager); then run ${manager.install} in ${request.dir}.`;
  const direct = await exec(command, args, { cwd: target });
  if (direct.code !== 0) {
    if (!(manager.corepack && /ENOENT/.test(direct.stderr)))
      throw failed('Resolving the packages', direct, resolving);
    await step('Resolving the packages', 'corepack', [command, ...args], resolving);
  }
  await step('git add', 'git', ['add', '--', ...written, manager.lockfile], '');
  await step(
    'The first commit',
    'git',
    ['commit', '-m', 'Create the app'],
    'git needs a name and an email: git config --global user.name ... and user.email ..., then commit by hand.',
  );
  // Work lands on `develop` and `main` takes release pull requests (CONTRIBUTING.md), so the app starts on `develop`.
  await step(
    'Making develop',
    'git',
    ['switch', '--create', 'develop'],
    'Run git switch --create develop by hand.',
  );
  io.err(
    `Made ${names.name}, on the branch develop (CONTRIBUTING.md: main takes release pull requests). Next:\n  cd ${request.dir}\n  ${manager.install} && ${manager.run} dev   (http://localhost:${port})\n  ${manager.run} build\n  eval "docker build $(${manager.exec} sovereign-manifest docker-args) -t ${names.name} ."\nThen host it with ./sv app add ${names.name} --image <the image> in your instance. See README.md.`,
  );
}
