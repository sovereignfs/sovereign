import { NextResponse } from 'next/server';
import { listAllConsentGrants } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';

/** List all active consent grants across all users (admin, RFC 0002). */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? '';
  if (!hasCapability(role, 'user:view')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const grants = await listAllConsentGrants(await getPlatformDb());
  return NextResponse.json({ grants });
}
