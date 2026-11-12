import path from 'node:path';
import { createFileStore, type FileStore } from '@sovereignfs/storage';
import { config, getConfig } from '../config';

/**
 * Where core keeps people's files when `SV_STORAGE_PATH` is not set (RFC 0004 §1): the folder an instance mounts for it. Running
 * from source (`pnpm dev`, a test) there is no such folder and `/data` is not one a developer can write, so it is `data/s3/core` beside
 * where core runs, which git ignores.
 */
export const CORE_FILES_PATH =
  process.env.NODE_ENV === 'production'
    ? '/data/s3/core'
    : path.join(process.cwd(), 'data', 's3', 'core');

/**
 * The largest file core takes in one upload. Core's proxy runs on every request, and Next copies a request's body into memory for it
 * and keeps only the first `proxyClientMaxBodySize` of it (set in `next.config.ts` to this number, which Next reads when core is built),
 * so a larger body would arrive cut short. Core asks for the size first and refuses past this; the store also refuses a body shorter than
 * it said. A file is held in memory while it is received, so this is the most one upload costs the process.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

let store: FileStore | undefined;

/** Core's own store of people's files (core-app §4.6), made from `SV_STORAGE_*` once. */
export function getFileStore(): FileStore {
  store ??= createFileStore(getConfig(), { prefix: config.prefix, defaultPath: CORE_FILES_PATH });
  return store;
}
