import { NextResponse } from 'next/server';
import { listAllConsentGrants } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/**
 * List all active consent grants across all users (admin, RFC 0002).
 *
 * Authorized by the internal admin key (`checkAdminKey`), like every other
 * `/api/admin/*` route. It must NOT authorize off `x-sovereign-user-role`: the
 * middleware matcher deliberately excludes `/api/admin`, so on this path that
 * header is never platform-injected and never stripped — a caller can forge it
 * and it would be trusted outright, exposing every user's consent grants.
 * Console reaches this route server-side with the admin key.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const grants = await listAllConsentGrants(await getPlatformDb());
  return NextResponse.json({ grants });
}
