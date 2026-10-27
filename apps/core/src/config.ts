import { defineConfig, secret, url } from '@sovereignfs/config';
import { databaseVariables, resolveDatabase } from '@sovereignfs/database';

/**
 * Every environment variable core reads is declared here (rules: spec/env.md), and
 * `.env.example` lists the same ones; a test keeps the two in step. Variables for
 * field encryption, mail and registration arrive with the tasks that use them. The
 * database variables come from `@sovereignfs/database`; core does not require a
 * database yet, so with no `SV_DB_DIALECT` it runs without one.
 */
export const config = defineConfig({
  prefix: 'SV',
  variables: {
    url: url({
      name: 'URL',
      required: true,
      origin: true,
      description:
        "Core's public address, with no path. It is also the issuer apps sign in against",
    }),
    authSecret: secret({
      name: 'AUTH_SECRET',
      required: true,
      minLength: 32,
      description: 'Signs sessions and tokens. At least 32 characters',
    }),
    ...databaseVariables,
  },
});

export type CoreConfig = ReturnType<typeof config.load>;

/** Which database core uses, checked against what its dialect needs; `undefined` when none is set. */
export function getDatabaseSettings() {
  return resolveDatabase(getConfig(), { prefix: config.prefix });
}

let loaded: CoreConfig | undefined;

/** The validated configuration, read from the environment once. Throws a `ConfigError` listing every problem. */
export function getConfig(): CoreConfig {
  loaded ??= config.load();
  return loaded;
}
