import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createConsentGrant, listConsentGrants } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** List the current user's active consent grants (RFC 0002). */
export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const grants = await listConsentGrants(await getPlatformDb(), userId);
  return NextResponse.json({ grants });
}

/** Grant consent for a (consumer, provider, contract, version) tuple (RFC 0002). */
export async function POST(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as {
    consumerId?: unknown;
    providerId?: unknown;
    contract?: unknown;
    version?: unknown;
  };

  const { consumerId, providerId, contract, version } = body;
  if (
    typeof consumerId !== 'string' ||
    typeof providerId !== 'string' ||
    typeof contract !== 'string' ||
    typeof version !== 'number'
  ) {
    return NextResponse.json(
      { error: 'consumerId, providerId, contract (string) and version (number) are required' },
      { status: 400 },
    );
  }

  const id = randomUUID();
  await createConsentGrant(
    await getPlatformDb(),
    id,
    userId,
    consumerId,
    providerId,
    contract,
    version,
  );
  return NextResponse.json({ id }, { status: 201 });
}
