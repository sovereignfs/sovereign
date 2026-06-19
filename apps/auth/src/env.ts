function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AuthEnv {
  /** Shared signing secret. No default — the server refuses to start without it. */
  secret: string;
  /** Auth database location. Defaults to a local SQLite file. */
  databaseUrl: string;
  /** When true, registration requires a valid invite (first user exempt). */
  inviteOnly: boolean;
  /** Public base URL of the auth server. */
  baseUrl: string;
  /** Shared secret for runtime→auth admin API calls. No default — must be set. */
  adminKey: string;
  /**
   * Additional origins trusted for CSRF checks, beyond baseUrl. Set to the
   * internal Docker service address (http://auth:3001) so server-to-server
   * calls from the runtime — which send Origin: SOVEREIGN_AUTH_URL — are
   * accepted even when baseUrl is set to the public domain.
   */
  trustedOrigins: string[];
}

let cached: AuthEnv | undefined;

/**
 * Resolve and validate auth environment configuration. Lazy so that importing
 * auth modules (e.g. during `next build`) does not throw — the AUTH_SECRET check
 * fires when the server first handles a request.
 */
export function getEnv(): AuthEnv {
  cached ??= {
    secret: required('AUTH_SECRET'),
    databaseUrl: process.env.AUTH_DATABASE_URL ?? 'file:./data/auth.db',
    inviteOnly: process.env.AUTH_INVITE_ONLY === 'true',
    // `||` (not `??`): Docker Compose interpolates an unset `${AUTH_BASE_URL}`
    // to an empty string, which `??` would not catch — leaving better-auth with
    // an empty baseURL and failing the CSRF origin check on login. Treat empty
    // the same as unset and fall back to the default.
    baseUrl: process.env.AUTH_BASE_URL || 'http://localhost:3001',
    adminKey: required('SOVEREIGN_ADMIN_KEY'),
    trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}
