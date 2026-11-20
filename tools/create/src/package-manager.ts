/**
 * The package managers an app can be made with (operator-cli §2.2): pnpm by default, npm or Yarn on request. Everything the template and
 * `create app` write that names a manager comes from this table, so the Dockerfile, the workflows, the hook and the guides of an app all
 * use the one it was made with, and `app sync` writes the same files again from its `packageManager` field.
 */
import { CreateError } from './create.js';
import { PNPM_VERSION, YARN_VERSION } from './versions.js';

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** What a new app is made with when none is named, whatever tool started `create`. */
export const DEFAULT_PACKAGE_MANAGER: PackageManager = 'pnpm';

export type ManagerCommands = {
  /** The `packageManager` field of the app's `package.json`, which corepack reads; npm has none. */
  pin: string | undefined;
  lockfile: string;
  /** What the install reads beside `package.json`, which the image copies before installing: the lockfile and the manager's settings. */
  installFiles: readonly string[];
  /** What a developer runs to install. */
  install: string;
  /** The install from the lockfile and nothing else, without scripts: what the image and CI run. */
  ciInstall: string;
  /** Writes the lockfile without installing, as `create app` does: the command and its arguments. */
  lockfileOnly: readonly string[];
  /** Runs a script of `package.json`. */
  run: string;
  /** Runs a binary of a dependency. */
  exec: string;
  /** The script a manager runs after a developer's install, which turns the versioned hooks on. Yarn 4 does not run `prepare`. */
  hookScript: 'prepare' | 'postinstall';
  /** Whether the image and CI have to turn corepack on to find the manager. */
  corepack: boolean;
};

export const MANAGERS: Record<PackageManager, ManagerCommands> = {
  pnpm: {
    pin: `pnpm@${PNPM_VERSION}`,
    lockfile: 'pnpm-lock.yaml',
    installFiles: ['pnpm-lock.yaml'],
    install: 'pnpm install',
    ciInstall: 'pnpm install --frozen-lockfile --ignore-scripts',
    lockfileOnly: ['pnpm', 'install', '--lockfile-only', '--ignore-scripts'],
    run: 'pnpm run',
    exec: 'pnpm exec',
    hookScript: 'prepare',
    corepack: true,
  },
  npm: {
    pin: undefined,
    lockfile: 'package-lock.json',
    installFiles: ['package-lock.json'],
    install: 'npm install',
    ciInstall: 'npm ci --ignore-scripts --no-audit --no-fund',
    lockfileOnly: [
      'npm',
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    run: 'npm run',
    exec: 'npx',
    hookScript: 'prepare',
    corepack: false,
  },
  yarn: {
    pin: `yarn@${YARN_VERSION}`,
    lockfile: 'yarn.lock',
    installFiles: ['yarn.lock', '.yarnrc.yml'],
    install: 'yarn install',
    ciInstall: 'yarn install --immutable --mode=skip-build',
    lockfileOnly: ['yarn', 'install', '--mode=update-lockfile'],
    run: 'yarn run',
    exec: 'yarn exec',
    hookScript: 'postinstall',
    corepack: true,
  },
};

/** A manager by its name, or a refusal that says which there are. */
export function parsePackageManager(value: string): PackageManager {
  if ((PACKAGE_MANAGERS as readonly string[]).includes(value)) return value as PackageManager;
  throw new CreateError(
    `${value || '(nothing)'} is not a package manager an app can be made with.`,
    2,
    `Use one of ${PACKAGE_MANAGERS.join(', ')} (${DEFAULT_PACKAGE_MANAGER} when none is named).`,
  );
}

/**
 * The manager an existing app uses, from its `packageManager` field. An app made before there was a choice has none and was made with npm,
 * so that is what it keeps.
 */
export function managerOf(field: unknown): PackageManager {
  if (typeof field !== 'string' || field === '') return 'npm';
  const name = field.split('@')[0] ?? '';
  return (PACKAGE_MANAGERS as readonly string[]).includes(name) ? (name as PackageManager) : 'npm';
}
