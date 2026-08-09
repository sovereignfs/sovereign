import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, getInstanceConfig, getPlatformDb } from '@sovereignfs/db';
import { fetchInstanceOAuthClients } from '@/src/instance-oauth-clients';
import { resolveInstanceName } from '@/src/instance-name';
import { getPlatformVersion } from '@/src/platform-version';

/**
 * GET /api/instance
 *
 * Public, unauthenticated instance identity and compatibility metadata
 * (RFC 0058 §"Which endpoint should the shell use for first-launch instance
 * validation and compatibility metadata?", epic task 20.2). Native shells
 * (sovereign-mobile, sovereign-desktop) call this on first launch to confirm
 * a user-entered URL is a genuine Sovereign instance and to read its display
 * name — richer than the bare `/api/health` liveness probe they used before
 * this endpoint existed, without requiring the admin-key-gated
 * `/api/admin/health`. Excluded from the middleware session gate (must be
 * reachable before the user is authenticated). Returns no sensitive
 * deployment or user data — the instance name is already public via
 * `/api/manifest` and `/api/instance/logo`.
 *
 * `oauthClients` (RFC 0072 addendum, epic task 1.24) exposes this instance's
 * generated `client_id`s for the well-known, first-party desktop/mobile OAuth
 * clients — public identifiers, not secrets, needed before login. A server-
 * to-server call to the auth server, same trust boundary as any other
 * `SOVEREIGN_AUTH_URL` call; omitted (not erroring) if the auth server can't
 * be reached, same degrade-gracefully posture as instanceName above.
 */
export async function GET(): Promise<Response> {
  let instanceName = resolveInstanceName(process.env.INSTANCE_NAME);

  try {
    const pdb = await getPlatformDb();
    const config = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
    if (config.instanceName) instanceName = config.instanceName;
  } catch {
    // Instance config is cosmetic — serve a working response even on DB failure.
  }

  const oauthClients = await fetchInstanceOAuthClients();

  return NextResponse.json({
    status: 'ok',
    product: 'sovereign',
    instanceName,
    platformVersion: getPlatformVersion(),
    ...(oauthClients && { oauthClients }),
  });
}
