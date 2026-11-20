/**
 * Fills the app template's placeholders: what `create app` writes into a new app and what `sync` writes into an existing one (research
 * 0007), so the two are the same files.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppNames } from './app.js';
import { MANAGERS, type PackageManager } from './package-manager.js';

/** Where the template is, beside `dist/` once built and beside `src/` when tested. */
export const TEMPLATE = fileURLToPath(new URL('../template/app', import.meta.url));
/** What `--encryption` writes over the app's files: the notes encrypted in the browser (RFC 0005), shared through core. */
export const ENCRYPTION_TEMPLATE = fileURLToPath(
  new URL('../template/encryption', import.meta.url),
);

/** What only an app of one package manager carries, written over the app's files: Yarn's settings, for one. */
export const managerTemplate = (manager: PackageManager) =>
  fileURLToPath(new URL(`../template/pm/${manager}`, import.meta.url));

/** The files and folders npm would not keep under their own names, and the names they are made with. */
export const RENAMED: Record<string, string> = {
  _gitignore: '.gitignore',
  _dockerignore: '.dockerignore',
  '_env.example': '.env.example',
  // A published package may not carry a file called tsconfig.json.
  '_tsconfig.json': 'tsconfig.json',
  _github: '.github',
  // Hooks are versioned here and turned on by the `prepare` script (CONTRIBUTING.md).
  _githooks: '.githooks',
  '_yarnrc.yml': '.yarnrc.yml',
};

/** Where a template file is written in an app: its path with the renamed parts. */
export const targetOf = (file: string) =>
  path.join(...file.split(/[\\/]/).map((part) => RENAMED[part] ?? part));

/** What an app's template files are filled with. */
export type Fill = {
  names: AppNames;
  port: number;
  /** The commit of sovereignfs/sovereign whose shared workflows the app calls. */
  workflowsRef: string;
  /** The app's folder from its repository's root: `.` for an app at the root. */
  directory: string;
  /** What the app's tags start with before the `v`: empty, or such as `web-`. */
  tagPrefix: string;
  /** The package manager the app is made with, which every command the files name is run with. */
  packageManager: PackageManager;
};

/**
 * A line that is there for one package manager and not another, written in the template as a comment so the file stays valid YAML and a
 * valid Dockerfile: `# __COREPACK_STEP__` in a workflow's steps, `# __COREPACK__` in the Dockerfile. The whole line is replaced, or
 * removed.
 */
const line = (text: string, placeholder: string, value: string | undefined) =>
  text.replace(new RegExp(`^([ \\t]*)# ${placeholder}\\n`, 'gm'), (_, indent: string) =>
    value === undefined ? '' : `${indent}${value}\n`,
  );

/** A template file's text with the app's values in place of the placeholders. */
export function fill(text: string, values: Fill): string {
  const { names } = values;
  const manager = MANAGERS[values.packageManager];
  let lines = line(
    text,
    '__COREPACK_STEP__',
    manager.corepack ? '- run: corepack enable' : undefined,
  );
  // The image finds pnpm or Yarn through corepack, at the version `packageManager` pins, without asking whether it may fetch it.
  lines = line(
    lines,
    '__COREPACK__',
    manager.corepack ? 'ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0\nRUN corepack enable' : undefined,
  );
  return (
    lines
      // The variables are upper case (`MYNOTES_URL`); the manifest names the app in lower case (contracts/app-manifest.md §2.4).
      .replaceAll('__PREFIX_LOWER__', names.prefix.toLowerCase())
      .replaceAll('__PREFIX__', names.prefix)
      .replaceAll('__NAME__', names.name)
      .replaceAll('__TITLE__', names.title)
      // Prettier, the repository's formatter, writes `__TITLE__` in the template's Markdown as `**TITLE**` (strong emphasis).
      .replaceAll('**TITLE**', names.title)
      .replaceAll('__PORT__', String(values.port))
      .replaceAll('__WORKFLOWS_REF__', values.workflowsRef)
      .replaceAll('__DIRECTORY__', values.directory)
      .replaceAll('__TAG_PREFIX__', values.tagPrefix)
      .replaceAll('__CI_INSTALL__', manager.ciInstall)
      .replaceAll('__INSTALL__', manager.install)
      .replaceAll('__RUN__', manager.run)
      .replaceAll('__EXEC__', manager.exec)
      .replaceAll('__INSTALL_FILES__', ['package.json', ...manager.installFiles].join(' '))
      .replaceAll('__LOCKFILE__', manager.lockfile)
  );
}
