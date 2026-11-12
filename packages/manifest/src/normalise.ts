import type { Manifest, SignIn } from './types';

/** The size of a secret `generate` makes when it does not say (§2.5). */
export const DEFAULT_SECRET_BYTES = 48;

/** The prefix of every variable an app reads: the manifest’s `prefix` in upper case (`contracts/env.md` §1, `app-manifest.md` §2.4). */
export function variablePrefix(manifest: Pick<Manifest, 'prefix'>): string {
  return manifest.prefix.toUpperCase();
}

/** The secrets the server makes for an app, each with its size in bytes, whichever form a `generate` entry is written in. */
export function secretsOf(manifest: Pick<Manifest, 'generate'>): { name: string; bytes: number }[] {
  return ((manifest.generate ?? []) as (string | { name: string; bytes?: number })[]).map(
    (entry) =>
      typeof entry === 'string'
        ? { name: entry, bytes: DEFAULT_SECRET_BYTES }
        : { name: entry.name, bytes: entry.bytes ?? DEFAULT_SECRET_BYTES },
  );
}

/**
 * What a manifest means, whatever its version: the form the toolkit and an app's build read, so that a later version is one more way to
 * write the same thing and nothing else has to know the versions.
 */
export type Normalised = {
  /** The `manifest` version it was written in. */
  version: Manifest['manifest'];
  /** The app’s name for itself, in lower case. */
  prefix: string;
  /** The prefix of every variable it reads: `prefix` in upper case (`contracts/env.md` §1). */
  variablePrefix: string;
  /** The name `sv app add` uses when it is given none. A manifest 2 or 3 has one (§2.4). */
  defaultName?: string;
  name: string;
  description?: string;
  icon?: string;
  port: number;
  health: string;
  /** Where the launcher sends people. */
  launch: string;
  /** Present when people sign in through core. */
  signIn?: SignIn;
  database: { enabled: boolean; pooling?: 'transaction' };
  /** The secrets the server makes, each with its size in bytes. */
  generate: { name: string; bytes: number }[];
  data: string[];
  /** Whether it keeps people's files in its folder of the instance's `sovereign-data` volume (manifest 3, RFC 0004). */
  storage: boolean;
  /** The core versions it works with, as a semver range. */
  core?: string;
};

export function normalise(manifest: Manifest): Normalised {
  const database = manifest.database;
  return {
    version: manifest.manifest,
    prefix: manifest.prefix.toLowerCase(),
    variablePrefix: variablePrefix(manifest),
    ...(manifest.manifest !== 1 ? { defaultName: manifest.prefix } : {}),
    name: manifest.name,
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
    ...(manifest.icon === undefined ? {} : { icon: manifest.icon }),
    port: manifest.port,
    health: manifest.health,
    launch: manifest.launch ?? '/',
    ...(manifest.signIn === undefined ? {} : { signIn: manifest.signIn }),
    database: {
      enabled: database !== undefined && database !== false,
      ...(typeof database === 'object' && database.pooling ? { pooling: database.pooling } : {}),
    },
    generate: secretsOf(manifest),
    data: manifest.data ?? [],
    storage: manifest.manifest === 3 && manifest.storage === true,
    ...(manifest.core === undefined ? {} : { core: manifest.core }),
  };
}
