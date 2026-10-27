import { boolean, defineConfig, integer, secret, string, url } from '@sovereignfs/config';
import { fieldEncryptionVariables, resolveFieldEncryption } from '@sovereignfs/crypto';
import { databaseVariables, resolveDatabase } from '@sovereignfs/database';

/**
 * Every environment variable core reads is declared here (rules: spec/env.md), and
 * `.env.example` lists the same ones; a test keeps the two in step. Variables for
 * mail and registration arrive with the tasks that use them. The database and
 * field-encryption variables come from their packages; core does not require a database
 * or keys yet, so without them it runs as before (they become required with the first
 * stored secret).
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
    authInviteOnly: boolean({
      name: 'AUTH_INVITE_ONLY',
      description:
        'Registration policy default: true means sign-up needs an invite. A value saved in the Console overrides it. Unset means true',
    }),
    smtpHost: string({
      name: 'SMTP_HOST',
      description: 'Outgoing mail server. A value saved in the Console overrides it',
    }),
    smtpPort: integer({ name: 'SMTP_PORT', min: 1, max: 65535, description: 'Its port' }),
    smtpUser: string({ name: 'SMTP_USER', description: 'Its user name' }),
    smtpPassword: secret({ name: 'SMTP_PASSWORD', description: 'Its password' }),
    smtpFrom: string({ name: 'SMTP_FROM', description: 'The address mail is sent from' }),
    ...databaseVariables,
    ...fieldEncryptionVariables,
  },
});

export type CoreConfig = ReturnType<typeof config.load>;

/** Which database core uses, checked against what its dialect needs; `undefined` when none is set. */
export function getDatabaseSettings() {
  return resolveDatabase(getConfig(), { prefix: config.prefix });
}

/** The cipher for stored secrets, from the key ring; `undefined` when no key ring is set. */
export function getFieldCipher() {
  return resolveFieldEncryption(getConfig(), { prefix: config.prefix });
}

let loaded: CoreConfig | undefined;

/** The validated configuration, read from the environment once. Throws a `ConfigError` listing every problem. */
export function getConfig(): CoreConfig {
  loaded ??= config.load();
  return loaded;
}
