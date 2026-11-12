import { Refused } from '../errors.js';
import { CORE_DATABASE, CORE_ROLE } from './names.js';

/**
 * What a backup holds, or a restore puts back (operator-cli §10.2): the whole instance, or core and some apps on their own. The whole
 * instance also holds what belongs to no one part: the database server's administrator, `state.json`, and every secret.
 */
export type BackupScope = { all: true } | { all: false; core: boolean; apps: string[] };

export const ALL: BackupScope = { all: true };

const APP_NAME = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/** The file at the head of every archive, naming what it holds. An archive without one is a whole instance, from before it was written. */
export const MANIFEST_FILE = 'backup.json';

export type BackupManifest = {
  /** 2 since backups carry people's files; 1 is read as before, with none (operator-cli §10.2). */
  format: 1 | 2;
  scope: BackupScope;
  takenAt: string;
  /** Core's version and each hosted app's when the backup was taken, as `state.json` recorded them. */
  core?: string;
  apps: Record<string, string>;
  /** The folders of people's files the archive holds, as `files/<name>.tar`: `core` and apps. Absent in format 1. */
  files?: string[];
  /** Apps whose files are kept in a store of their own (`s3`, `git`) and so are not in the archive, with where each is. */
  elsewhere?: Record<string, string>;
};

/** A scope of core and apps, checked; none named is the whole instance. */
export function scopeOf(input: { core?: boolean; apps?: readonly string[] }): BackupScope {
  const apps = [...new Set(input.apps ?? [])].sort();
  for (const name of apps) {
    if (!APP_NAME.test(name)) throw new Refused(`“${name.slice(0, 40)}” is not an app’s name.`);
  }
  if (!input.core && apps.length === 0) return ALL;
  return { all: false, core: input.core === true, apps };
}

/** The words a scope travels as in a request to the server: `core`, `app NAME`, … ; none for the whole instance. */
export function scopeWords(scope: BackupScope): string[] {
  if (scope.all) return [];
  return [...(scope.core ? ['core'] : []), ...scope.apps.flatMap((name) => ['app', name])];
}

/** Reads the words `scopeWords` makes, or nothing when they are not exactly of that shape. */
export function parseScopeWords(words: readonly string[]): BackupScope | undefined {
  let core = false;
  const apps: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === 'core' && !core) core = true;
    else if (word === 'app' && APP_NAME.test(words[i + 1] ?? '')) apps.push(words[++i] as string);
    else return undefined;
  }
  if (new Set(apps).size !== apps.length) return undefined;
  return scopeOf({ core, apps });
}

/** For a file name: `all`, `core`, `core+app-notes`, `app-notes+app-tasks`. */
export function scopeLabel(scope: BackupScope): string {
  if (scope.all) return 'all';
  return [...(scope.core ? ['core'] : []), ...scope.apps.map((name) => `app-${name}`)].join('+');
}

/** For a person: “the whole instance”, “core and notes”. */
export function describeScope(scope: BackupScope): string {
  if (scope.all) return 'the whole instance';
  const parts = [...(scope.core ? ['core'] : []), ...scope.apps];
  return parts.length === 1
    ? (parts[0] as string)
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) as string}`;
}

/** Whether everything `inner` names is held by `outer`. */
export function holds(outer: BackupScope, inner: BackupScope): boolean {
  if (outer.all) return true;
  if (inner.all) return false;
  return (!inner.core || outer.core) && inner.apps.every((name) => outer.apps.includes(name));
}

/** Whether a scope reaches core: core's database, its secrets, and the sessions and deletions a restore must look after. */
export const touchesCore = (scope: BackupScope) => scope.all || scope.core;

/** An app's database, and its role, which has the same name (`apply/apps.ts`). */
export const appDatabaseOf = (name: string) => `app_${name.replace(/-/g, '_')}`;

/** The databases a scope holds, each with the role that owns it and the secret holding that role's password. */
export function databasesOf(scope: { core: boolean; apps: readonly string[] }) {
  return [
    ...(scope.core
      ? [{ database: CORE_DATABASE, role: CORE_ROLE, passwordSecret: 'role-core-password' }]
      : []),
    ...scope.apps.map((name) => ({
      database: appDatabaseOf(name),
      role: appDatabaseOf(name),
      passwordSecret: `role-app-${name}-password`,
    })),
  ];
}

/** Core's own generated secrets; the rest of what is in `secrets/` for core is written again from `secrets.age.yml` by each deployment. */
export const CORE_SECRET_FILES = [
  'role-core-password',
  'SV_AUTH_SECRET',
  'SV_FIELD_ENCRYPTION_KEYS',
];

/**
 * What follows `app-<name>-` in the name of one of that app's secret files (`apply/apps.ts`): the files `sv apply` writes for it, or a
 * variable, which a manifest names in capitals. A prefix alone would also match an app whose name begins with this one's
 * (`notes` and `notes-extra`), whose own suffixes start with a lowercase word.
 */
const APP_SECRET_SUFFIX =
  /^(?:client-secret|postgres-url|postgres-direct-url|(?:op-)?[A-Z][A-Z0-9_]*)$/;

/** The generated secrets that are one app's: its role's password, its client secret, and what its manifest asked to be made. */
export const isAppSecretFile = (name: string, file: string) =>
  file === `role-app-${name}-password` ||
  (file.startsWith(`app-${name}-`) && APP_SECRET_SUFFIX.test(file.slice(`app-${name}-`.length)));

/** An app's client secret, which core's database holds the other half of. */
export const appClientSecretFile = (name: string) => `app-${name}-client-secret`;

/**
 * The secrets a scope takes or puts back. Restoring an app without core leaves its client secret as it is: core's record of the client is
 * not restored, so the secret that matches it is the one the server holds now.
 */
export function secretInScope(scope: BackupScope, file: string, restoring = false): boolean {
  if (scope.all) return true;
  if (scope.core && CORE_SECRET_FILES.includes(file)) return true;
  return scope.apps.some(
    (name) =>
      isAppSecretFile(name, file) &&
      !(restoring && !scope.core && file === appClientSecretFile(name)),
  );
}

/** The data volumes a scope holds: `sovereign-app-<name>_data-<n>`. */
export function volumeInScope(scope: BackupScope, volume: string): boolean {
  if (scope.all) return true;
  return scope.apps.some((name) => volume.startsWith(`sovereign-app-${name}_data-`));
}

/** The folders of people's files a scope holds, out of those there are: all of them, or core's and the named apps' (RFC 0004 §6). */
export function filesInScope(scope: BackupScope, existing: readonly string[]): string[] {
  if (scope.all) return [...existing].sort();
  const wanted = new Set([...(scope.core ? ['core'] : []), ...scope.apps]);
  return existing.filter((name) => wanted.has(name)).sort();
}

const FOLDER = /^[a-z0-9-]{1,63}$/;

/** Reads `backup.json`, refusing one this toolkit does not know. */
export function readManifest(text: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Refused('The backup’s backup.json cannot be read.', 'The backup may be damaged.');
  }
  const value = parsed as Partial<BackupManifest> | null;
  if (value?.format !== 1 && value?.format !== 2) {
    throw new Refused(
      'The backup was taken by a newer toolkit than this one.',
      'Run sv upgrade, then restore it.',
    );
  }
  const scope = value.scope as Partial<{ all: boolean; core: boolean; apps: string[] }> | undefined;
  // What names a folder is checked here, since a name from a backup ends up in a path on the server.
  const files = Array.isArray(value.files)
    ? value.files.filter((name): name is string => typeof name === 'string' && FOLDER.test(name))
    : undefined;
  if (files) (value as BackupManifest).files = files;
  if (scope?.all === true) return { ...(value as BackupManifest), scope: ALL };
  if (scope?.all !== false || !Array.isArray(scope.apps)) {
    throw new Refused('The backup’s backup.json does not say what it holds.');
  }
  return {
    ...(value as BackupManifest),
    scope: scopeOf({ core: scope.core === true, apps: scope.apps.map(String) }),
  };
}
