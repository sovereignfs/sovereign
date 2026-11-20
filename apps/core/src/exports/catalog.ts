/**
 * What each export carries of core's database (core-app §4.7), decided for every table and every column: a table is exported with the
 * columns named, each column it leaves out says why, and a table that is never exported says why. A test fails when a table or a
 * column exists that this has not decided, so a new one cannot reach an export by accident (`contracts/export.md` §6).
 */
export type Exported = {
  /** The columns exported, in order. */
  columns: readonly string[];
  /** The columns left out, each with why. */
  omit?: Readonly<Record<string, string>>;
  /** A condition on the rows, for the owner's export: rows that would have to be ended again by a restore. */
  where?: string;
  /** Whether the rows hold end-to-end ciphertext as stored (RFC 0005). */
  endToEnd?: boolean;
  /** For a person's export: the column that names them, and the columns they are given if fewer. */
  person?: { by: string; columns?: readonly string[] };
};

export type Decision = Exported | { never: string };

const SECRET = 'a secret of the instance or a credential: never exported (contracts/export.md §6)';
const SESSION = 'a session or what keeps one: never exported';
const TOKEN = 'a token or a revocation, which a restore would end again';
const BOOKKEEPING = 'bookkeeping that means nothing outside this instance';

export const CATALOG: Readonly<Record<string, Decision>> = {
  users: {
    columns: [
      'id',
      'name',
      'email',
      'email_verified',
      'image',
      'role',
      'timezone',
      'locale',
      'agreed_to_terms',
      'terms_accepted_at',
      'terms_version',
      'two_factor_enabled',
      'deactivated_at',
      'created_at',
      'updated_at',
    ],
    person: {
      by: 'id',
      columns: [
        'id',
        'name',
        'email',
        'email_verified',
        'image',
        'role',
        'timezone',
        'locale',
        'terms_accepted_at',
        'terms_version',
        'two_factor_enabled',
        'created_at',
      ],
    },
  },
  avatars: {
    columns: ['user_id', 'content_type', 'bytes', 'size', 'version', 'updated_at'],
    person: { by: 'user_id' },
  },
  activity: {
    columns: ['id', 'user_id', 'client_id', 'summary', 'link', 'at', 'created_at'],
    omit: { idem_key: BOOKKEEPING },
    person: { by: 'user_id' },
  },
  notifications: {
    columns: [
      'id',
      'user_id',
      'client_id',
      'title',
      'body',
      'url',
      'category',
      'created_at',
      'read_at',
      'dismissed_at',
      'expires_at',
    ],
    omit: { idem_key: BOOKKEEPING },
    person: { by: 'user_id' },
  },
  notification_settings: {
    columns: ['user_id', 'client_id', 'enabled'],
    person: { by: 'user_id' },
  },
  app_mail_settings: { columns: ['user_id', 'client_id', 'enabled'], person: { by: 'user_id' } },
  launcher_shortcuts: {
    columns: [
      'id',
      'owner_id',
      'name',
      'url',
      'app_url',
      'description',
      'icon_symbol',
      'icon_type',
      'icon_bytes',
      'icon_size',
      'icon_version',
      'created_at',
      'created_by',
    ],
    person: { by: 'owner_id' },
  },
  oauth_consents: {
    columns: ['id', 'client_id', 'user_id', 'scopes', 'created_at', 'updated_at'],
    omit: {
      reference_id: BOOKKEEPING,
      resources: BOOKKEEPING,
      requested_user_info_claims: BOOKKEEPING,
    },
    person: { by: 'user_id' },
  },
  key_accounts: {
    columns: [
      'user_id',
      'suite',
      'unlock_salt',
      'signing_public',
      'signing_private',
      'kit_confirmed',
      'created_at',
    ],
    endToEnd: true,
    person: { by: 'user_id' },
  },
  key_apps: {
    columns: ['user_id', 'client_id', 'app_key', 'identity', 'signature', 'created_at'],
    endToEnd: true,
    person: { by: 'user_id' },
  },
  key_wraps: {
    columns: ['user_id', 'way', 'wrap_id', 'record', 'prf_salt', 'created_at'],
    endToEnd: true,
    person: { by: 'user_id' },
  },
  capability_overrides: { columns: ['role', 'capability', 'granted', 'updated_at', 'updated_by'] },
  instance_settings: {
    columns: ['key', 'value', 'encrypted', 'updated_at', 'updated_by'],
    where: "key <> 'instance.restored_at'",
  },
  instance_images: {
    columns: ['kind', 'content_type', 'bytes', 'size', 'version', 'updated_at', 'updated_by'],
  },
  invites: {
    columns: [
      'email',
      'invited_by',
      'created_at',
      'expires_at',
      'accepted_at',
      'cancelled_at',
      'emailed_at',
    ],
    omit: { id: 'what the invitation link carries, which would let a copy be used' },
  },
  deleted_accounts: { columns: ['sub', 'deleted_at'] },
  managed_clients: { columns: ['key', 'client_id', 'created_at'] },
  oauth_clients: {
    columns: [
      'id',
      'client_id',
      'disabled',
      'skip_consent',
      'enable_end_session',
      'subject_type',
      'scopes',
      'client_credentials_scopes',
      'user_id',
      'created_at',
      'updated_at',
      'name',
      'uri',
      'icon',
      'contacts',
      'tos',
      'policy',
      'redirect_uris',
      'post_logout_redirect_uris',
      'backchannel_logout_uri',
      'backchannel_logout_session_required',
      'token_endpoint_auth_method',
      'application_type',
      'grant_types',
      'response_types',
      'require_pkce',
      'metadata',
    ],
    omit: {
      client_secret: SECRET,
      client_discovery_id: BOOKKEEPING,
      software_id: BOOKKEEPING,
      software_version: BOOKKEEPING,
      software_statement: BOOKKEEPING,
      jwks: BOOKKEEPING,
      jwks_uri: BOOKKEEPING,
      dpop_bound_access_tokens: BOOKKEEPING,
      reference_id: BOOKKEEPING,
    },
  },
  oauth_resources: {
    columns: [
      'id',
      'identifier',
      'name',
      'access_token_ttl',
      'refresh_token_ttl',
      'allowed_scopes',
      'disabled',
      'created_at',
      'updated_at',
    ],
    omit: {
      signing_algorithm: BOOKKEEPING,
      signing_key_id: BOOKKEEPING,
      custom_claims: BOOKKEEPING,
      dpop_bound_access_tokens_required: BOOKKEEPING,
      policy_version: BOOKKEEPING,
      metadata: BOOKKEEPING,
    },
  },
  oauth_client_resources: { columns: ['id', 'client_id', 'resource_id', 'metadata', 'created_at'] },

  accounts: { never: `${SECRET}: the password's stored hash and providers' tokens` },
  two_factors: { never: `${SECRET}: TOTP secrets and backup codes` },
  passkeys: { never: `${SECRET}: passkeys' credentials` },
  jwks: { never: `${SECRET}: core's signing keys` },
  verifications: { never: `${SECRET}: verification and reset tokens` },
  sessions: { never: SESSION },
  session_locks: { never: SESSION },
  device_locks: { never: SESSION },
  lock_challenges: { never: SESSION },
  key_session_secrets: { never: SESSION },
  rate_limits: { never: BOOKKEEPING },
  app_mail_keys: { never: BOOKKEEPING },
  oauth_client_assertions: { never: BOOKKEEPING },
  oauth_access_tokens: { never: TOKEN },
  oauth_refresh_tokens: { never: TOKEN },
  token_revocations: { never: TOKEN },
  app_token_revocations: { never: TOKEN },
  logout_notices: { never: 'notices that a restore would send again' },
  account_deletion_notices: { never: 'notices that a restore would send again' },
  export_jobs: { never: BOOKKEEPING },
};

export function isExported(decision: Decision): decision is Exported {
  return 'columns' in decision;
}
