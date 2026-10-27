import { sqliteTimestampMs } from '@sovereignfs/database';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

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
