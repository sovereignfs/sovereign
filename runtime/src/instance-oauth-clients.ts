const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

export interface InstanceOAuthClients {
  desktop: string | null;
  mobile: string | null;
}

/**
 * This instance's generated `client_id`s for the well-known, first-party
 * desktop/mobile OAuth clients (RFC 0072 addendum, epic task 1.24). A
 * server-to-server call to the auth server's `/api/oauth-clients` — public
 * identifiers, not secrets. Returns `undefined` (never throws) if the auth
 * server can't be reached or errors, so `GET /api/instance` can omit the
 * field rather than fail.
 */
export async function fetchInstanceOAuthClients(): Promise<InstanceOAuthClients | undefined> {
  try {
    const res = await fetch(`${AUTH_URL}/api/oauth-clients`);
    if (!res.ok) return undefined;
    return (await res.json()) as InstanceOAuthClients;
  } catch {
    return undefined;
  }
}
