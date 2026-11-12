import { createFileStore, type FileStore } from '@sovereignfs/storage';
import { config, getConfig } from '../config';

/** Where core keeps people's files when `SV_STORAGE_PATH` is not set: the folder an instance mounts for it (RFC 0004 §1). */
export const CORE_FILES_PATH = '/data/s3/core';

/**
 * The largest file core takes in one upload. Core's proxy runs on every request, and Next copies a request's body into memory for it
 * and keeps only the first 10 MB (`proxyClientMaxBodySize`), so a larger body would arrive cut short. Core asks for the size first and
 * refuses past this; the store also refuses a body shorter than it said.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let store: FileStore | undefined;

/** Core's own store of people's files (core-app §4.6), made from `SV_STORAGE_*` once. */
export function getFileStore(): FileStore {
  store ??= createFileStore(getConfig(), { prefix: config.prefix, defaultPath: CORE_FILES_PATH });
  return store;
}
