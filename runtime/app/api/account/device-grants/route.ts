import { NextResponse } from 'next/server';
import { grantDeviceConsent, listDeviceConsentGrants, revokeDeviceConsent } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

function parseGrantBody(
  body: unknown,
): { pluginId: string; capability: string } | { error: string } {
  const { pluginId, capability } = (body ?? {}) as { pluginId?: unknown; capability?: unknown };
  if (typeof pluginId !== 'string' || pluginId === '') {
    return { error: 'pluginId (non-empty string) is required' };
  }
  if (typeof capability !== 'string' || capability === '') {
    return { error: 'capability (non-empty string) is required' };
  }
  return { pluginId, capability };
}

/**
 * List the current user's device-bridge consent grants (RFC 0083, workstream
 * 0003 leg 2) — Account UI transparency, not an enforcement boundary.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const grants = await listDeviceConsentGrants(await getPlatformDb(), userId);
  return NextResponse.json({ grants });
}

/**
 * Record that the current user granted `pluginId` permission to use
 * `capability`. `pluginId` is self-declared by the calling plugin's own
 * client-side code — see `docs/architecture-rules.md`'s device-bridge entry.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = parseGrantBody(await request.json());
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await grantDeviceConsent(await getPlatformDb(), userId, parsed.pluginId, parsed.capability);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Revoke a device-bridge consent grant. Only the owning user may revoke. */
export async function DELETE(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = parseGrantBody(await request.json());
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await revokeDeviceConsent(await getPlatformDb(), userId, parsed.pluginId, parsed.capability);
  return new NextResponse(null, { status: 204 });
}
