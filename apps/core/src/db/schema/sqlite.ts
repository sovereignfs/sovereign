import { sqliteBytes, sqliteTimestampMs } from '@sovereignfs/database';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Core's tables on sqld and a SQLite file. Every table is written twice, here and in
 * `postgres.ts`, and the two are kept a pair by `schema-parity.test.ts`. Change both, then
 * `pnpm --filter core db:generate`.
 */

/**
 * Settings an operator changed in the Console. A row is a saved value; no row means the
 * environment variable, or the built-in default, applies. A secret is stored as the
 * encrypted envelope, with `encrypted` set.
 */
export const instanceSettings = sqliteTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  /** 1 when `value` is an encrypted envelope. A plain integer, so every dialect agrees. */
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: sqliteTimestampMs('updated_at').notNull(),
  /** The account that saved it, when known. */
  updatedBy: text('updated_by'),
});

/**
 * Where the owner changed the capability matrix (core-app §3.2.3). A row is a difference from the
 * default matrix in code, for the admin or user role: `granted` 1 gives a capability the default
 * withholds, 0 takes one away. No row means the default applies, so a capability added to the code
 * later reaches everyone as its default says, and a matrix nobody edited has no rows at all.
 */
export const capabilityOverrides = sqliteTable(
  'capability_overrides',
  {
    role: text('role').notNull(),
    capability: text('capability').notNull(),
    /** 1 or 0. A plain integer, so every dialect agrees. */
    granted: integer('granted').notNull(),
    updatedAt: sqliteTimestampMs('updated_at').notNull(),
    /** The account that saved it, when known. */
    updatedBy: text('updated_by'),
  },
  (table) => [primaryKey({ columns: [table.role, table.capability] })],
);

/**
 * better-auth's tables. better-auth names them user, session, account, verification and rateLimit
 * and writes the camelCase keys below; the physical names are plural snake_case, which avoids
 * the reserved word `user` and matches core's own tables. The adapter is given this mapping.
 * Dates are `Date` objects on both dialects (a timestamp), which is what better-auth reads and
 * writes; only the rate limiter's counter time is a plain millisecond number.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    /** `scope:role-name` (core-app §3.2.1). Set by core when the account is made, never by a request. */
    role: text('role').notNull().default('platform:user'),
    /** An IANA time zone, taken from the browser at sign-up and checked before it is stored. */
    timezone: text('timezone'),
    locale: text('locale'),
    /** Whether the terms were accepted at sign-up. False for an account made before they were asked. */
    agreedToTerms: integer('agreed_to_terms', { mode: 'boolean' }).notNull().default(false),
    termsAcceptedAt: integer('terms_accepted_at', { mode: 'timestamp_ms' }),
    /** Which text was accepted: a digest of the Privacy Policy and Terms of Service as built. */
    termsVersion: text('terms_version'),
    /** Whether sign-in asks for a second step. Turned on only after a valid code (core-app §3.4.1). */
    twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
    /** When the account was deactivated (core-app §3.3.6), or null while it is active. */
    deactivatedAt: integer('deactivated_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    // At most one owner, whatever the code does: two sign-ups racing for the first account cannot
    // both win it.
    uniqueIndex('users_single_owner_idx')
      .on(table.role)
      .where(sql`role = 'platform:owner'`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = sqliteTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

/** The rate limiter's counters, kept in the database so every instance shares them. */
export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: sqliteTimestampMs('last_request').notNull(),
});

/**
 * The instance's own pictures (core-app §3.12, §3.15): its logo for a light and for a dark page, and its favicon.
 * One row for each. Like an avatar, a picture is judged by its bytes before it is kept, and its version (a digest
 * of the bytes) is part of the address it is served from, so a changed picture is a new address.
 */
export const instanceImages = sqliteTable('instance_images', {
  kind: text('kind').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: sqliteBytes('bytes').notNull(),
  size: integer('size').notNull(),
  version: text('version').notNull(),
  updatedAt: sqliteTimestampMs('updated_at').notNull(),
  updatedBy: text('updated_by'),
});

/**
 * When an account's tokens, or one app's tokens for it, were last revoked (core-app §3.6.3, §3.9). The provider
 * keeps a row for each token it issues except a signed JWT access token, which is checked by its signature and
 * leaves nothing to mark; a token that nothing marks is revoked by saying that everything issued up to a time is
 * no longer good. One row for each account and app, with an empty `client_id` for every app. The time is
 * milliseconds since the epoch, an integer on both dialects, so a token's `iat` is compared with it directly.
 */
export const tokenRevocations = sqliteTable(
  'token_revocations',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    revokedBefore: integer('revoked_before').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);

/**
 * What an app told a person (core-app §4.1): one row for each notification. `client_id` is the app that sent it and is taken from
 * its token, never from the sender. Times are milliseconds since the epoch, an integer on both dialects. `idem_key` is the sender's
 * own key for the send, so a repeat within a day is the same send. Written only by `NotificationService`.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    url: text('url'),
    category: text('category').notNull(),
    createdAt: integer('created_at').notNull(),
    readAt: integer('read_at'),
    dismissedAt: integer('dismissed_at'),
    expiresAt: integer('expires_at').notNull(),
    idemKey: text('idem_key'),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.clientId, table.createdAt),
    index('notifications_idem_idx').on(table.clientId, table.userId, table.idemKey),
  ],
);

/** A person's switch for one app's notifications (core-app §4.1). Missing means on. */
export const notificationSettings = sqliteTable(
  'notification_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    enabled: integer('enabled').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);

/** A person's switch for one app's emails (core-app §4.2). Missing means on. */
export const appMailSettings = sqliteTable(
  'app_mail_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    enabled: integer('enabled').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);

/**
 * The keys apps gave their emails (core-app §4.2), so a repeat of a send within a day is the same send. Only a send that carried a
 * key leaves a row, and no text of the message is kept. Written only by `MailForAppsService`.
 */
export const appMailKeys = sqliteTable(
  'app_mail_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    idemKey: text('idem_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('app_mail_keys_idx').on(table.clientId, table.userId, table.idemKey)],
);

/**
 * What apps recorded about a person (core-app §4.3): one row for each entry, the person's own record. `client_id` is the app that
 * recorded it, taken from its token. `at` is when it happened and `created_at` when core accepted it, both milliseconds since the
 * epoch. `idem_key` is the recorder's own key, so a repeat within a day is the same record. Written only by `ActivityService`,
 * read only for the person it is about.
 */
export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    summary: text('summary').notNull(),
    link: text('link'),
    at: integer('at').notNull(),
    createdAt: integer('created_at').notNull(),
    idemKey: text('idem_key'),
  },
  (table) => [
    index('activity_user_idx').on(table.userId, table.at),
    index('activity_idem_idx').on(table.clientId, table.userId, table.idemKey),
  ],
);

/**
 * Telling an app that a person who used it deleted their account (core-app §4.5): one row for each app that must be told, written by
 * the deletion's own transaction and kept until the app answers. It is not tied to the account, which is gone; `sub` is never reused.
 * `state` is `pending`, `delivered`, `given_up` or `resolved`. Times are milliseconds since the epoch. `last_failure` is the kind of
 * the last failure and never what the app said. `lease_until` stops two instances of core sending one notice at once. Written only by
 * `DeletionNotices`.
 */
export const accountDeletionNotices = sqliteTable(
  'account_deletion_notices',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    sub: text('sub').notNull(),
    deletedAt: integer('deleted_at').notNull(),
    state: text('state').notNull(),
    attempts: integer('attempts').notNull(),
    nextAttemptAt: integer('next_attempt_at'),
    leaseUntil: integer('lease_until'),
    lastFailure: text('last_failure'),
    doneAt: integer('done_at'),
  },
  (table) => [
    index('account_deletion_notices_due_idx').on(table.state, table.nextAttemptAt),
    index('account_deletion_notices_client_idx').on(table.clientId, table.sub),
  ],
);

/**
 * That an account was deleted (core-app §4.5): its `sub` and when, so that a restore can delete it again. It is written by the deletion's
 * own transaction for every deletion, including one that had no app to tell, and removed 90 days after (`purgeDoneNotices`). It holds
 * nothing else of the person, and the `sub` is never reused.
 */
export const deletedAccounts = sqliteTable('deleted_accounts', {
  sub: text('sub').primaryKey(),
  deletedAt: integer('deleted_at').notNull(),
});

/**
 * When an app's own tokens (core-app §3.6.6) were last revoked: its secret was rotated, or it was switched off. An app token is a
 * signed JWT that leaves no row to mark, so the time is recorded and everything issued up to it is no longer good
 * (`isAppTokenRevoked`). One row for each app; the time is milliseconds since the epoch, an integer on both dialects.
 */
export const appTokenRevocations = sqliteTable('app_token_revocations', {
  clientId: text('client_id').primaryKey(),
  revokedBefore: integer('revoked_before').notNull(),
});

/**
 * The OpenID Connect provider's tables (core-app §3.6): better-auth's JWT plugin keeps the signing keys, and
 * `@better-auth/oauth-provider` keeps the registered apps ("clients" inside the protocol), the tokens it
 * has issued and what each person agreed to share. better-auth names them jwks, oauthClient, oauthResource,
 * oauthClientResource, oauthRefreshToken, oauthAccessToken, oauthConsent and oauthClientAssertion and
 * writes the camelCase keys below; the physical names are plural snake_case like the others. A list or an
 * object a plugin stores is text holding JSON on SQLite and a native array or jsonb on PostgreSQL, which
 * is what the Drizzle adapter reads and writes on each. `oauth-schema.test.ts` compares every column with
 * what the installed plugin declares, so a plugin upgrade that adds one cannot slip past.
 */
export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  alg: text('alg'),
  crv: text('crv'),
});

export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    skipConsent: integer('skip_consent', { mode: 'boolean' }),
    enableEndSession: integer('enable_end_session', { mode: 'boolean' }),
    subjectType: text('subject_type'),
    scopes: text('scopes', { mode: 'json' }),
    clientCredentialsScopes: text('client_credentials_scopes', { mode: 'json' }).default([]),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts', { mode: 'json' }),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris', { mode: 'json' }).notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris', { mode: 'json' }),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: integer('backchannel_logout_session_required', {
      mode: 'boolean',
    }),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types', { mode: 'json' }),
    responseTypes: text('response_types', { mode: 'json' }),
    requirePKCE: integer('require_pkce', { mode: 'boolean' }),
    dpopBoundAccessTokens: integer('dpop_bound_access_tokens', { mode: 'boolean' }).default(false),
    referenceId: text('reference_id'),
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => [index('oauth_clients_user_id_idx').on(table.userId)],
);

/**
 * The key an operator command gives an app it manages (core-app §3.7.4), so the next run finds the same app again.
 * A table of its own, and not a column of the provider's, which holds only what the provider writes
 * (`oauth-schema.test.ts`). A key is a DNS label, and an app has at most one.
 */
export const managedClients = sqliteTable('managed_clients', {
  key: text('key').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .unique()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  createdAt: sqliteTimestampMs('created_at').notNull(),
});

export const oauthResources = sqliteTable('oauth_resources', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes', { mode: 'json' }),
  customClaims: text('custom_claims', { mode: 'json' }),
  dpopBoundAccessTokensRequired: integer('dpop_bound_access_tokens_required', {
    mode: 'boolean',
  }).default(false),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  policyVersion: integer('policy_version').default(1),
  metadata: text('metadata', { mode: 'json' }),
});

export const oauthClientResources = sqliteTable(
  'oauth_client_resources',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: 'cascade' }),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('oauth_client_resources_client_resource_idx').on(table.clientId, table.resourceId),
    index('oauth_client_resources_client_id_idx').on(table.clientId),
    index('oauth_client_resources_resource_id_idx').on(table.resourceId),
  ],
);

export const oauthRefreshTokens = sqliteTable(
  'oauth_refresh_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    revoked: integer('revoked', { mode: 'timestamp_ms' }),
    rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: integer('rotation_replay_expires_at', { mode: 'timestamp_ms' }),
    authTime: integer('auth_time', { mode: 'timestamp_ms' }),
    confirmation: text('confirmation', { mode: 'json' }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
  },
  (table) => [
    index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
    index('oauth_refresh_tokens_session_id_idx').on(table.sessionId),
    index('oauth_refresh_tokens_user_id_idx').on(table.userId),
    index('oauth_refresh_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
  ],
);

export const oauthAccessTokens = sqliteTable(
  'oauth_access_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
    refreshId: text('refresh_id').references(() => oauthRefreshTokens.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    revoked: integer('revoked', { mode: 'timestamp_ms' }),
    confirmation: text('confirmation', { mode: 'json' }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
  },
  (table) => [
    index('oauth_access_tokens_client_id_idx').on(table.clientId),
    index('oauth_access_tokens_session_id_idx').on(table.sessionId),
    index('oauth_access_tokens_user_id_idx').on(table.userId),
    index('oauth_access_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
    index('oauth_access_tokens_refresh_id_idx').on(table.refreshId),
  ],
);

export const oauthConsents = sqliteTable(
  'oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('oauth_consents_client_id_idx').on(table.clientId),
    index('oauth_consents_user_id_idx').on(table.userId),
  ],
);

export const oauthClientAssertions = sqliteTable('oauth_client_assertions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Invitations to sign up (core-app §3.10). An invite is for one email address, stored lower-case,
 * and is valid until it is used, cancelled or past `expires_at` (none: it does not expire).
 */
export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: sqliteTimestampMs('created_at').notNull(),
    expiresAt: sqliteTimestampMs('expires_at'),
    acceptedAt: sqliteTimestampMs('accepted_at'),
    cancelledAt: sqliteTimestampMs('cancelled_at'),
  },
  (table) => [index('invites_email_idx').on(table.email)],
);

/**
 * An authenticator app enrolment: the TOTP secret and the backup codes, both stored encrypted by
 * better-auth (with `SV_AUTH_SECRET`) and never returned. One row per person. `verified` is false
 * until the first valid code, so an abandoned enrolment never asks for a code at sign-in.
 */
export const twoFactors = sqliteTable(
  'two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
    /** Wrong codes at the second sign-in step since the last right one; ten lock the account's second step. */
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('two_factors_user_id_idx').on(table.userId)],
);

/**
 * Passkeys (core-app §3.4.2): a public key the person's device holds the private half of. better-auth
 * names the model `passkey`; ours is plural like the rest. `counter` is the device's signature
 * counter, which better-auth raises on every use and checks so a cloned key is noticed.
 */
export const passkeys = sqliteTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkeys_user_id_idx').on(table.userId),
    uniqueIndex('passkeys_credential_id_idx').on(table.credentialID),
  ],
);

/**
 * A person's picture (core-app §3.15), kept in the database so core's containers hold no state. One row
 * per person, replaced when the picture changes. `version` changes with the bytes: it is in the picture's
 * address and is its ETag, so a changed picture is a new address and a cache never serves the old one.
 */
export const avatars = sqliteTable('avatars', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  bytes: sqliteBytes('bytes').notNull(),
  size: integer('size').notNull(),
  version: text('version').notNull(),
  updatedAt: sqliteTimestampMs('updated_at').notNull(),
});
