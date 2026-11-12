import { ConfigError, integer, oneOf, secret, string } from '@sovereignfs/config';
import type { ConfigValues } from '@sovereignfs/config';
import { FileStore } from './store.js';
import { FsDriver } from './fs.js';
import { FileUsageStore, type UsageStore } from './usage.js';

/** The stores there are. `s3` and `git` follow (RFC 0004 §3). */
export const STORAGE_DRIVERS = ['fs'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

/** The defaults an instance gives an app (RFC 0004, Settled in review): 200 GB and 1000 files per person. */
export const DEFAULT_QUOTA_MB = 204800;
export const DEFAULT_FILE_QUOTA = 1000;

/**
 * The storage variables of contracts/env.md, to spread into an app's `defineConfig`:
 *
 *   defineConfig({ prefix: 'NOTES', variables: { url: …, ...storageVariables } })
 */
export const storageVariables = {
  storageDriver: oneOf(STORAGE_DRIVERS, {
    name: 'STORAGE_DRIVER',
    default: 'fs',
    description: 'Where people’s files are kept: fs, a folder on this machine',
  }),
  storagePath: string({
    name: 'STORAGE_PATH',
    description:
      'The folder people’s files are kept in, with fs. An instance sets /data/s3/<app>; unset, the app’s own default',
  }),
  storageQuotaMb: integer({
    name: 'STORAGE_QUOTA_MB',
    default: DEFAULT_QUOTA_MB,
    min: 1,
    description:
      'How many megabytes of files each person may keep in this app. Default 204800 (200 GB)',
  }),
  storageFileQuota: integer({
    name: 'STORAGE_FILE_QUOTA',
    default: DEFAULT_FILE_QUOTA,
    min: 1,
    description: 'How many files each person may keep in this app. Default 1000',
  }),
  storageSigningKey: secret({
    name: 'STORAGE_SIGNING_KEY',
    minLength: 32,
    description:
      'Signs addresses that serve a file without a session, for a few minutes. At least 32 characters; unset, files are served to their owner’s session only',
  }),
};

export type StorageSettings = ConfigValues<typeof storageVariables>;

export type StoreOptions = {
  /** The app's prefix, so a problem names the real variable (`NOTES_STORAGE_PATH`). */
  prefix: string;
  /** Where files go with `fs` when `STORAGE_PATH` is unset. */
  defaultPath: string;
  /** A usage store backed by the app's database, for an app that runs more than one process. */
  usage?: UsageStore;
  now?: () => number;
};

/** Makes the store the settings describe. */
export function createFileStore(settings: StorageSettings, options: StoreOptions): FileStore {
  const root = settings.storagePath ?? options.defaultPath;
  if (root.trim() === '') {
    throw new ConfigError([
      { variable: `${options.prefix}_STORAGE_PATH`, message: 'must name a folder' },
    ]);
  }
  const driver = new FsDriver(root);
  return new FileStore({
    driver,
    usage: options.usage ?? new FileUsageStore((sub) => driver.usageFile(sub), options.now),
    quota: { bytes: settings.storageQuotaMb * 1024 * 1024, files: settings.storageFileQuota },
    ...(settings.storageSigningKey ? { signingKey: settings.storageSigningKey.reveal() } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
