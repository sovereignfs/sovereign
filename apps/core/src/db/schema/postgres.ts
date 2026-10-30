import { postgresBytes, postgresTimestampMs } from '@sovereignfs/database';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** The PostgreSQL half of the pair in `sqlite.ts`; see there. */

export const instanceSettings = pgTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: postgresTimestampMs('updated_at').notNull(),
  updatedBy: text('updated_by'),
});

export const capabilityOverrides = pgTable(
  'capability_overrides',
  {
    role: text('role').notNull(),
    capability: text('capability').notNull(),
    granted: integer('granted').notNull(),
    updatedAt: postgresTimestampMs('updated_at').notNull(),
    updatedBy: text('updated_by'),
  },
  (table) => [primaryKey({ columns: [table.role, table.capability] })],
);

const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: text('role').notNull().default('platform:user'),
    timezone: text('timezone'),
    locale: text('locale'),
    agreedToTerms: boolean('agreed_to_terms').notNull().default(false),
    termsAcceptedAt: date('terms_accepted_at'),
    termsVersion: text('terms_version'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    deactivatedAt: date('deactivated_at'),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_single_owner_idx')
      .on(table.role)
      .where(sql`role = 'platform:owner'`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: date('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = pgTable(
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
    accessTokenExpiresAt: date('access_token_expires_at'),
    refreshTokenExpiresAt: date('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: date('expires_at').notNull(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const rateLimits = pgTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: postgresTimestampMs('last_request').notNull(),
});

export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: postgresTimestampMs('created_at').notNull(),
    expiresAt: postgresTimestampMs('expires_at'),
    acceptedAt: postgresTimestampMs('accepted_at'),
    cancelledAt: postgresTimestampMs('cancelled_at'),
  },
  (table) => [index('invites_email_idx').on(table.email)],
);

export const twoFactors = pgTable(
  'two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: date('locked_until'),
  },
  (table) => [uniqueIndex('two_factors_user_id_idx').on(table.userId)],
);

export const passkeys = pgTable(
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
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: date('created_at'),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkeys_user_id_idx').on(table.userId),
    uniqueIndex('passkeys_credential_id_idx').on(table.credentialID),
  ],
);

export const avatars = pgTable('avatars', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  bytes: postgresBytes('bytes').notNull(),
  size: integer('size').notNull(),
  version: text('version').notNull(),
  updatedAt: postgresTimestampMs('updated_at').notNull(),
});

export const instanceImages = pgTable('instance_images', {
  kind: text('kind').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: postgresBytes('bytes').notNull(),
  size: integer('size').notNull(),
  version: text('version').notNull(),
  updatedAt: postgresTimestampMs('updated_at').notNull(),
  updatedBy: text('updated_by'),
});

export const tokenRevocations = pgTable(
  'token_revocations',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    revokedBefore: bigint('revoked_before', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);

/**
 * What an app told a person (core-app §4.1): one row for each notification. `client_id` is the app that sent it and is taken from
 * its token, never from the sender. Times are milliseconds since the epoch, an integer on both dialects. `idem_key` is the sender's
 * own key for the send, so a repeat within a day is the same send. Written only by `NotificationService`.
 */
export const notifications = pgTable(
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
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    readAt: bigint('read_at', { mode: 'number' }),
    dismissedAt: bigint('dismissed_at', { mode: 'number' }),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    idemKey: text('idem_key'),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.clientId, table.createdAt),
    index('notifications_idem_idx').on(table.clientId, table.userId, table.idemKey),
  ],
);

/** A person's switch for one app's notifications (core-app §4.1). Missing means on. */
export const notificationSettings = pgTable(
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
export const appMailSettings = pgTable(
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
export const appMailKeys = pgTable(
  'app_mail_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    idemKey: text('idem_key').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('app_mail_keys_idx').on(table.clientId, table.userId, table.idemKey)],
);

/**
 * When an app's own tokens (core-app §3.6.6) were last revoked: its secret was rotated, or it was switched off. An app token is a
 * signed JWT that leaves no row to mark, so the time is recorded and everything issued up to it is no longer good
 * (`isAppTokenRevoked`). One row for each app; the time is milliseconds since the epoch, an integer on both dialects.
 */
export const appTokenRevocations = pgTable('app_token_revocations', {
  clientId: text('client_id').primaryKey(),
  revokedBefore: bigint('revoked_before', { mode: 'number' }).notNull(),
});

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: date('created_at').notNull(),
  expiresAt: date('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array().default([]),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: date('created_at'),
    updatedAt: date('updated_at'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => [index('oauth_clients_user_id_idx').on(table.userId)],
);

/**
 * The key an operator command gives an app it manages (core-app §3.7.4), so the next run finds the same app again.
 * A table of its own, and not a column of the provider's, which holds only what the provider writes
 * (`oauth-schema.test.ts`). A key is a DNS label, and an app has at most one.
 */
export const managedClients = pgTable('managed_clients', {
  key: text('key').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .unique()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  createdAt: postgresTimestampMs('created_at').notNull(),
});

export const oauthResources = pgTable('oauth_resources', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: date('created_at'),
  updatedAt: date('updated_at'),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

export const oauthClientResources = pgTable(
  'oauth_client_resources',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: date('created_at'),
  },
  (table) => [
    uniqueIndex('oauth_client_resources_client_resource_idx').on(table.clientId, table.resourceId),
    index('oauth_client_resources_client_id_idx').on(table.clientId),
    index('oauth_client_resources_resource_id_idx').on(table.resourceId),
  ],
);

export const oauthRefreshTokens = pgTable(
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
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: date('expires_at').notNull(),
    createdAt: date('created_at').notNull(),
    revoked: date('revoked'),
    rotatedAt: date('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: date('rotation_replay_expires_at'),
    authTime: date('auth_time'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
    index('oauth_refresh_tokens_session_id_idx').on(table.sessionId),
    index('oauth_refresh_tokens_user_id_idx').on(table.userId),
    index('oauth_refresh_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
  ],
);

export const oauthAccessTokens = pgTable(
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
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshTokens.id, { onDelete: 'cascade' }),
    expiresAt: date('expires_at').notNull(),
    createdAt: date('created_at').notNull(),
    revoked: date('revoked'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_access_tokens_client_id_idx').on(table.clientId),
    index('oauth_access_tokens_session_id_idx').on(table.sessionId),
    index('oauth_access_tokens_user_id_idx').on(table.userId),
    index('oauth_access_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
    index('oauth_access_tokens_refresh_id_idx').on(table.refreshId),
  ],
);

export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [
    index('oauth_consents_client_id_idx').on(table.clientId),
    index('oauth_consents_user_id_idx').on(table.userId),
  ],
);

export const oauthClientAssertions = pgTable('oauth_client_assertions', {
  id: text('id').primaryKey(),
  expiresAt: date('expires_at').notNull(),
});
