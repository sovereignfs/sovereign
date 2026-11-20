import { ExportError } from './errors.js';

/** The longest path an export may hold, in bytes (`contracts/export.md` §1). */
export const MAX_PATH_BYTES = 1024;

const PREFIX = /^[a-z][a-z0-9-]*$/;
const KIND = /^[a-z][a-z0-9_]*$/;

/** Says what is wrong with a path inside an export, or nothing when it may be used. */
export function pathProblem(path: string): string | undefined {
  if (path.length === 0) return 'is empty';
  if (Buffer.byteLength(path, 'utf8') > MAX_PATH_BYTES)
    return `is longer than ${MAX_PATH_BYTES} bytes`;
  if (path.includes('\0')) return 'holds NUL';
  if (path.includes('\\')) return 'holds a backslash';
  if (path.startsWith('/')) return 'is absolute';
  for (const segment of path.split('/')) {
    if (segment === '') return 'has an empty segment';
    if (segment === '.' || segment === '..') return `has a "${segment}" segment`;
  }
  return undefined;
}

/** Throws unless `path` may be used inside an export. */
export function checkPath(path: string): string {
  const problem = pathProblem(path);
  if (problem)
    throw new ExportError('invalid_path', `The path ${JSON.stringify(path)} ${problem}.`);
  return path;
}

/** Whether a data path is under `core/` or `apps/<prefix>/`, the only places data goes (`contracts/export.md` §3). */
export function isDataPath(path: string): boolean {
  if (path.startsWith('core/')) return path.length > 'core/'.length;
  const match = /^apps\/([^/]+)\/./.exec(path);
  return match !== null && PREFIX.test(match[1] ?? '');
}

/** The folder a part's data is under: `core/` for core, `apps/<prefix>/` for an app. */
export function partFolder(name: string): string {
  return name === 'core' ? 'core/' : `apps/${name}/`;
}

export function isPrefix(value: string): boolean {
  return PREFIX.test(value);
}

export function isKind(value: string): boolean {
  return KIND.test(value);
}
