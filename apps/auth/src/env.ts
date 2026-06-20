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
  /**
   * WebAuthn Relying Party ID — the registrable domain shared between the
   * auth server and the runtime (e.g. "example.com"). Must match the domain
   * browsers use to access the site. Defaults to the hostname from baseUrl.
   * Not valid for cross-origin auth setups where auth and runtime are on
   * different registrable domains — set explicitly in that case.
   */
  webAuthnRpId: string;
  /** Human-readable name shown in browser passkey prompts. Defaults to "Sovereign". */
  webAuthnRpName: string;
  /**
   * Full origin(s) the runtime is served from, for WebAuthn challenge binding.
   * Defaults to the auth server's baseUrl. Set to the runtime's public URL
   * when the runtime and auth server are on different ports/subdomains.
   * Accepts a single URL string or comma-separated list.
   */
  webAuthnOrigin: string[];
}

let cached: AuthEnv | undefined;

/**
 * Resolve and validate auth environment configuration. Lazy so that importing
 * auth modules (e.g. during `next build`) does not throw — the AUTH_SECRET check
 * fires when the server first handles a request.
 */
export function getEnv(): AuthEnv {
  const baseUrl = process.env.AUTH_BASE_URL || 'http://localhost:3001';

  // Derive rpID from baseUrl hostname if not explicitly set.
  let defaultRpId = 'localhost';
  try {
    defaultRpId = new URL(baseUrl).hostname;
  } catch {
    // keep 'localhost'
  }

  // WebAuthn origin MUST be the browser-facing runtime origin (where the
  // credential was created), NOT the auth server URL. The browser sends
  // its own origin in the WebAuthn response; the auth server verifies it
  // matches. SOVEREIGN_AUTH_PUBLIC_URL is the auth server's public URL —
  // wrong here. NEXT_PUBLIC_RUNTIME_URL is the runtime's public URL — right.
  // Falls back to http://localhost:3000 for zero-config local dev.
  const webAuthnOriginRaw =
    process.env.AUTH_WEBAUTHN_ORIGIN ||
    process.env.NEXT_PUBLIC_RUNTIME_URL ||
    'http://localhost:3000';

  cached ??= {
    secret: required('AUTH_SECRET'),
    databaseUrl: process.env.AUTH_DATABASE_URL ?? 'file:./data/auth.db',
    inviteOnly: process.env.AUTH_INVITE_ONLY === 'true',
    // `||` (not `??`): Docker Compose interpolates an unset `${AUTH_BASE_URL}`
    // to an empty string, which `??` would not catch — leaving better-auth with
    // an empty baseURL and failing the CSRF origin check on login. Treat empty
    // the same as unset and fall back to the default.
    baseUrl,
    adminKey: required('SOVEREIGN_ADMIN_KEY'),
    trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    webAuthnRpId: process.env.AUTH_WEBAUTHN_RP_ID || defaultRpId,
    webAuthnRpName: process.env.AUTH_WEBAUTHN_RP_NAME || 'Sovereign',
    webAuthnOrigin: webAuthnOriginRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}
