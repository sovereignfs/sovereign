import { boolean, defineConfig, integer, list, secret, string, url } from '@sovereignfs/config';
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
    authCookieDomain: string({
      name: 'AUTH_COOKIE_DOMAIN',
      description:
        "Parent domain for session cookies, so core's own pages and passkeys can be shared across subdomains. Apps signing in through OpenID Connect do not need it",
    }),
    authTrustedOrigins: list({
      name: 'AUTH_TRUSTED_ORIGINS',
      default: [],
      description: "Extra origins accepted for requests, besides core's own; comma-separated",
    }),
    authWebauthnRpId: string({
      name: 'AUTH_WEBAUTHN_RP_ID',
      description:
        "The domain passkeys are bound to: core's own host, or a parent of it that its apps share (sovereign.local). Unset means core's own host. Changing it makes existing passkeys stop working",
    }),
    authWebauthnRpName: string({
      name: 'AUTH_WEBAUTHN_RP_NAME',
      description: 'The name a device shows when asking about a passkey. Unset means Sovereign',
    }),
    authWebauthnOrigin: list({
      name: 'AUTH_WEBAUTHN_ORIGIN',
      default: [],
      description:
        "Origins passkeys may be used from, comma-separated, each on the relying party's domain. Unset means core's own address",
    }),
    authTrustedProxies: list({
      name: 'AUTH_TRUSTED_PROXIES',
      default: [],
      description:
        'Addresses or ranges (such as 10.0.0.0/8) of the reverse proxies in front of core, comma-separated. Sign-in limits count attempts per client address, read from X-Forwarded-For through these proxies; without them only a single-address header is believed, and every other request shares one limit',
    }),
    authPasswordMinLength: integer({
      name: 'AUTH_PASSWORD_MIN_LENGTH',
      default: 8,
      min: 1,
      max: 128,
      description: 'The shortest password accepted',
    }),
    authPasswordRequireUppercase: boolean({
      name: 'AUTH_PASSWORD_REQUIRE_UPPERCASE',
      default: false,
      description: 'Require an upper-case letter in a password',
    }),
    authPasswordRequireLowercase: boolean({
      name: 'AUTH_PASSWORD_REQUIRE_LOWERCASE',
      default: false,
      description: 'Require a lower-case letter in a password',
    }),
    authPasswordRequireNumber: boolean({
      name: 'AUTH_PASSWORD_REQUIRE_NUMBER',
      default: false,
      description: 'Require a digit in a password',
    }),
    authPasswordRequireSymbol: boolean({
      name: 'AUTH_PASSWORD_REQUIRE_SYMBOL',
      default: false,
      description: 'Require a character that is neither a letter nor a digit in a password',
    }),
    authRequireEmailVerification: boolean({
      name: 'AUTH_REQUIRE_EMAIL_VERIFICATION',
      default: true,
      description:
        'Block sign-in until the address is verified by a link sent by email. Needs outgoing mail (SV_SMTP_*); with it on and no mail set up, nobody can finish signing up',
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

/** Which database core uses, checked against what its dialect needs. Core cannot run without one: accounts live in it. */
export function getDatabaseSettings() {
  return resolveDatabase(getConfig(), { prefix: config.prefix, required: true });
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
