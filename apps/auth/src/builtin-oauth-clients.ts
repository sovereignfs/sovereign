import { randomUUID } from 'node:crypto';
import { authGet, authRun } from './db';

/**
 * Well-known, first-party OAuth clients for the official native shells
 * (RFC 0072's addendum — proposed while scoping sovereign-desktop epic task
 * 17.4, itself blocked on this). A single published binary talking to an
 * arbitrary self-hosted instance has no way to become a registered OAuth
 * client without an admin hand-registering one in Console first — unworkable
 * for a store app. This seeds one native, secretless, PKCE-required client
 * per shell at startup instead, idempotently, per instance.
 *
 * **Not implemented via `@better-auth/oauth-provider`'s `adminCreateOAuthClient`
 * endpoint, despite being `SERVER_ONLY`** — verified live (not assumed) that its
 * handler still calls `assertClientPrivileges`, which throws `UNAUTHORIZED`
 * without a real user session (`getSessionFromCtx(ctx)`, checked against
 * `clientPrivileges` in `apps/auth/src/auth.ts`). There is no session at server
 * boot. This inserts the row directly instead — the same pattern
 * `instrumentation.ts`'s RFC 0021 owner-migration already uses for
 * `better-auth`-owned tables, and the only way to seed a client with no acting
 * user. The row shape below (columns, JSON-encoded array fields, boolean
 * handling) was reverse-engineered from a real client created through the
 * legitimate `adminCreateOAuthClient` path with a genuine session and
 * inspected directly, not guessed from the package's `.d.mts` types alone.
 */

interface BuiltinClientSpec {
  /** Stable marker stored in the `name` column — doubles as the idempotency key. */
  name: string;
  redirectUri: string;
}

export const BUILTIN_OAUTH_CLIENTS = {
  desktop: { name: 'sovereign-desktop (built-in)', redirectUri: 'sovereign://oauth/callback' },
  mobile: { name: 'sovereign-mobile (built-in)', redirectUri: 'sovereign://oauth/callback' },
} as const satisfies Record<string, BuiltinClientSpec>;

interface OAuthClientIdRow {
  clientId: string;
}

/**
 * Seed one built-in native OAuth client, idempotently. Returns its
 * `client_id` — the row's own if it already existed, or a freshly generated
 * one otherwise. `userId` is left `NULL`: the column is an `ON DELETE CASCADE`
 * foreign key to `user`, and a platform-level built-in client must not be
 * deleted just because whichever admin happened to exist at seed time is
 * later removed.
 */
export async function seedBuiltinOAuthClient(spec: BuiltinClientSpec): Promise<string> {
  const existing = await authGet<OAuthClientIdRow>(
    'SELECT "clientId" FROM "oauthClient" WHERE "name" = ?',
    [spec.name],
  );
  if (existing) return existing.clientId;

  const id = randomUUID();
  const clientId = randomUUID();
  const now = new Date().toISOString();

  await authRun(
    `INSERT INTO "oauthClient" (
      "id", "clientId", "clientSecret", "disabled", "skipConsent", "enableEndSession",
      "subjectType", "scopes", "userId", "createdAt", "updatedAt", "name", "uri", "icon",
      "contacts", "tos", "policy", "softwareId", "softwareVersion", "softwareStatement",
      "redirectUris", "postLogoutRedirectUris", "tokenEndpointAuthMethod", "grantTypes",
      "responseTypes", "public", "type", "requirePKCE", "referenceId", "metadata"
    ) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      id,
      clientId,
      false, // disabled
      now, // createdAt
      now, // updatedAt
      spec.name,
      JSON.stringify([spec.redirectUri]), // redirectUris
      'none', // tokenEndpointAuthMethod — public client, no secret
      JSON.stringify(['authorization_code', 'refresh_token']), // grantTypes
      JSON.stringify(['code']), // responseTypes
      true, // public
      'native', // type
      true, // requirePKCE
    ],
  );

  return clientId;
}

/** Seed both shells' built-in clients. Called once at auth server startup. */
export async function seedBuiltinOAuthClients(): Promise<
  Record<keyof typeof BUILTIN_OAUTH_CLIENTS, string>
> {
  const desktop = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.desktop);
  const mobile = await seedBuiltinOAuthClient(BUILTIN_OAUTH_CLIENTS.mobile);
  return { desktop, mobile };
}
