import { defineConfig } from '@sovereignfs/config';
import {
  createFileStore,
  StorageError,
  storageVariables,
  type FileStore,
} from '@sovereignfs/storage';
import { required } from './config';

/**
 * The files people upload to this app (contracts/app-manifest.md §2.7): a folder per person and a quota per person, kept by
 * `@sovereignfs/storage`. An instance mounts this app's own folder at /data/s3/__NAME__ and sets the variables; running it yourself, set
 * __PREFIX___STORAGE_PATH (see .env.example). Made when first used, so building the app needs none of it.
 */
const config = defineConfig({ prefix: '__PREFIX__', variables: { ...storageVariables } });
let store: FileStore | undefined;

export function files(): FileStore {
  store ??= createFileStore(config.load(), {
    prefix: '__PREFIX__',
    defaultPath: '/data/s3/__NAME__',
  });
  return store;
}

/**
 * A route that changes something answers only a request that came from this app's own pages: the cookie is sent with a request from
 * anywhere, so without this a page on another site could make the signed-in person upload or delete.
 */
export function refuseCrossOrigin(request: Request): Response | undefined {
  const origin = request.headers.get('origin');
  if (origin !== null && origin === new URL(required('__PREFIX___URL')).origin) return undefined;
  return Response.json(
    { error: 'forbidden', message: 'This request did not come from this app.' },
    { status: 403 },
  );
}

/** What a store's refusal looks like to a page: a code, and words a person can act on. Anything else is not caught here. */
export function failure(error: unknown): Response | undefined {
  if (!(error instanceof StorageError)) return undefined;
  return Response.json({ error: error.code, message: error.message }, { status: error.status });
}

export const unauthorised = () =>
  Response.json({ error: 'unauthorised', message: 'Sign in first.' }, { status: 401 });
