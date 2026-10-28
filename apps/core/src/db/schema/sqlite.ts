import { sqliteBytes, sqliteTimestampMs } from '@sovereignfs/database';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
