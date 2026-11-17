/**
 * Fills the app template's placeholders: what `create app` writes into a new app and what `sync` writes into an existing one (research
 * 0007), so the two are the same files.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppNames } from './app.js';

/** Where the template is, beside `dist/` once built and beside `src/` when tested. */
export const TEMPLATE = fileURLToPath(new URL('../template/app', import.meta.url));
/** What `--encryption` writes over the app's files: the notes encrypted in the browser (RFC 0005), shared through core. */
export const ENCRYPTION_TEMPLATE = fileURLToPath(
  new URL('../template/encryption', import.meta.url),
);

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
};

/** A template file's text with the app's values in place of the placeholders. */
export function fill(text: string, values: Fill): string {
  const { names } = values;
  return (
    text
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
  );
}
