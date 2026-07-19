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
  /**
   * When true (default), a new account must click an emailed verification
   * link before signing in. Opt-out, not opt-in — `!== 'false'` so an unset
   * var defaults to required.
   */
  requireEmailVerification: boolean;
  /** Public base URL of the auth server. */
  baseUrl: string;
  /** Shared secret for runtime→auth admin API calls. No default — must be set. */
  adminKey: string;
  /**
   * Where the auth server reaches the runtime for server-to-server calls (the
   * reverse of SOVEREIGN_AUTH_URL) — currently used to record email-delivery-
   * failure activity log entries. Defaults to localhost for native dev; Docker
   * Compose sets it to the internal service name (http://runtime:3000).
   */
  runtimeUrl: string;
  /**
   * Cookie domain for cross-subdomain session sharing. When auth and runtime
   * live on different subdomains (e.g. auth.example.com and example.com),
   * set this to the shared parent domain (e.g. ".example.com") so session
   * cookies are readable by both. Unset in single-domain / localhost dev.
   */
  cookieDomain: string | undefined;
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
   * All browser-facing origins where WebAuthn challenges occur. Must include
   * the runtime public URL (primary sign-in and passkey management via proxy).
   * Keep the auth server public URL included while compatibility routes remain
   * exposed. Comma-separated list.
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
  const defaultAuthUrl = `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
  const defaultRuntimeUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  const baseUrl = process.env.AUTH_BASE_URL || defaultAuthUrl;

  // Derive rpID from baseUrl hostname if not explicitly set.
  let defaultRpId = 'localhost';
  try {
    defaultRpId = new URL(baseUrl).hostname;
  } catch {
    // keep 'localhost'
  }

  // WebAuthn origin must include EVERY browser-facing origin where a WebAuthn
  // challenge can occur. There are two supported origins:
  //   1. The runtime origin (http://localhost:3000 in dev) — passkey management
  //      and the primary sign-in UI are proxied through the runtime, so the
  //      browser creates/presents credentials from the runtime origin.
  //   2. The auth server's public origin (http://localhost:3001 in dev) — the
  //      auth app still exposes compatibility pages/routes.
  // In production, set AUTH_WEBAUTHN_ORIGIN to a comma-separated list of both
  // your runtime URL and auth server URL (e.g. https://app.example.com,https://auth.example.com).
  const runtimeOrigin = process.env.NEXT_PUBLIC_RUNTIME_URL || defaultRuntimeUrl;
  const authPublicOrigin = process.env.SOVEREIGN_AUTH_PUBLIC_URL || baseUrl;
  const defaultWebAuthnOrigins =
    runtimeOrigin === authPublicOrigin ? runtimeOrigin : `${runtimeOrigin},${authPublicOrigin}`;
  const webAuthnOriginRaw = process.env.AUTH_WEBAUTHN_ORIGIN || defaultWebAuthnOrigins;

  cached ??= {
    secret: required('AUTH_SECRET'),
    databaseUrl: process.env.AUTH_DATABASE_URL ?? 'file:./data/auth.db',
    inviteOnly: process.env.AUTH_INVITE_ONLY === 'true',
    requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== 'false',
    // `||` (not `??`): Docker Compose interpolates an unset `${AUTH_BASE_URL}`
    // to an empty string, which `??` would not catch — leaving better-auth with
    // an empty baseURL and failing the CSRF origin check on login. Treat empty
    // the same as unset and fall back to the default.
    baseUrl,
    adminKey: required('SOVEREIGN_ADMIN_KEY'),
    runtimeUrl: process.env.SOVEREIGN_RUNTIME_URL || defaultRuntimeUrl,
    trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    webAuthnRpId: process.env.AUTH_WEBAUTHN_RP_ID || defaultRpId,
    webAuthnRpName: process.env.AUTH_WEBAUTHN_RP_NAME || 'Sovereign',
    webAuthnOrigin: webAuthnOriginRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}
