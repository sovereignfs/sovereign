/**
 * The variable names a deployment provides or refuses, so that neither `env` nor `secrets.age.yml` sets them
 * (contracts/suite.md §1.2, §3; contracts/app-manifest.md §3).
 */

/** Core's, which the deployment provides or refuses (contracts/suite.md §1.2). */
export const CORE_RESERVED = [
  'SV_URL',
  'SV_AUTH_SECRET',
  'SV_FIELD_ENCRYPTION_KEYS',
  'SV_DB_DIALECT',
  'SV_POSTGRES_URL',
  'SV_SQLD_URL',
  'SV_SQLD_ADMIN_URL',
  'SV_SQLD_NAMESPACE',
  'SV_SQLITE_URL',
  'SV_AUTH_COOKIE_DOMAIN',
  'SV_AUTH_WEBAUTHN_RP_ID',
  'SV_ENVIRONMENT',
  'SV_POSTGRES_POOL_MAX',
] as const;

/** Whether a name is one the deployment owns, in either form (`NAME` or `NAME_FILE`). */
export function isReservedCore(name: string): boolean {
  const bare = name.replace(/_FILE$/, '');
  return (CORE_RESERVED as readonly string[]).includes(bare);
}

/** An app's, under its prefix (contracts/app-manifest.md §3), and what its manifest asks to be generated. */
export function reservedForApp(prefix: string, generate: readonly string[] = []): string[] {
  return [
    `${prefix}_URL`,
    `${prefix}_CORE_URL`,
    `${prefix}_CORE_CLIENT_ID`,
    `${prefix}_CORE_CLIENT_SECRET`,
    `${prefix}_DB_DIALECT`,
    `${prefix}_POSTGRES_URL`,
    `${prefix}_POSTGRES_POOL_MAX`,
    ...generate,
  ];
}

export function isReservedForApp(
  name: string,
  prefix: string,
  generate: readonly string[] = [],
): boolean {
  const bare = name.replace(/_FILE$/, '');
  return reservedForApp(prefix, generate).includes(bare);
}

/** A name that is a secret by its ending (contracts/suite.md §1.2): it belongs in `secrets.age.yml`, not in `env`. */
export const SECRET_NAME = /_(PASSWORD|SECRET|KEY|KEYS|TOKEN)(_FILE)?$/;

/** Names an app may not be called (contracts/suite.md §1.7). */
export const RESERVED_APP_NAMES = [
  'core',
  'proxy',
  'database',
  'mailpit',
  'www',
  'api',
  'auth',
] as const;
