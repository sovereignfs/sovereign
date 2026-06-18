import { NextResponse } from 'next/server';
import { listAllConsentGrants } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** List all active consent grants across all users (admin, RFC 0002). */
export async function GET(request: Request): Promise<Response> {
  if (request.headers.get('x-sovereign-user-role') !== 'platform:admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const grants = await listAllConsentGrants(await getPlatformDb());
  return NextResponse.json({ grants });
}
