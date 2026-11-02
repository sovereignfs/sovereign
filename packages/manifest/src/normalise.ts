import type { Manifest } from './types';

/** The size of a secret `generate` makes when it does not say (§2.5). */
export const DEFAULT_SECRET_BYTES = 48;

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
  name: string;
  description?: string;
  icon?: string;
  port: number;
  health: string;
  /** Where the launcher sends people. */
  launch: string;
  /** Present when people sign in through core. */
  signIn?: Manifest['signIn'];
  database: { enabled: boolean; pooling?: 'transaction' };
  /** The secrets the server makes, each with its size in bytes. */
  generate: { name: string; bytes: number }[];
  data: string[];
  /** The core versions it works with, as a semver range. */
  core?: string;
};

export function normalise(manifest: Manifest): Normalised {
  const database = manifest.database;
  return {
    version: manifest.manifest,
    prefix: manifest.prefix.toLowerCase(),
    variablePrefix: manifest.prefix.toUpperCase(),
    name: manifest.name,
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
    ...(manifest.icon === undefined ? {} : { icon: manifest.icon }),
    port: manifest.port,
    health: manifest.health,
    launch: manifest.launch ?? '/',
    signIn: manifest.signIn,
    database: {
      enabled: database !== undefined && database !== false,
      ...(typeof database === 'object' && database.pooling ? { pooling: database.pooling } : {}),
    },
    generate: (manifest.generate ?? []).map((name) => ({ name, bytes: DEFAULT_SECRET_BYTES })),
    data: manifest.data ?? [],
    core: manifest.core,
  };
}
