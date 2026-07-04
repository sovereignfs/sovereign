import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getDisabledPluginIds } from '@/src/plugin-status';

/**
 * Returns the IDs of disabled plugins. Consumed by the middleware on each
 * gated request — middleware runs on the Edge runtime and cannot open the
 * SQLite database itself, so it asks this Node-runtime route instead (same
 * pattern as the auth /api/verify round-trip). Includes example plugins that are
 * off by the `SOVEREIGN_EXAMPLES_ENABLED` default, so their routes 404 too.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const disabled = await getDisabledPluginIds(await getPlatformDb());

  return NextResponse.json({ disabled });
}
