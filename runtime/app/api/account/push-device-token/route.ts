import { NextResponse } from 'next/server';
import { getPushDeviceTokensForUser, savePushDeviceToken } from '@sovereignfs/db';
import { randomUUID } from 'node:crypto';
import { getPlatformDb } from '@/src/db';
import { getConfiguredRelayUrl } from '@/src/relay';

/**
 * GET /api/account/push-device-token
 * Returns whether the relay is configured for this instance and this user's
 * currently registered native devices. Used by the Account UI and by
 * `sovereign-mobile` to show the correct state.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const relayUrl = await getConfiguredRelayUrl(pdb);
  const devices = await getPushDeviceTokensForUser(pdb, userId);

  return NextResponse.json({
    relayEnabled: relayUrl !== null,
    devices: devices.map((d) => ({
      id: d.id,
      platform: d.platform,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
    })),
  });
}

/**
 * POST /api/account/push-device-token
 * Body: { platform: 'ios' | 'android' | 'macos' | 'windows', deviceToken, publicKey }
 * Registers (or re-registers) a native push device token for this user,
 * capturing the instance's currently configured relay URL onto the row —
 * see RFC 0087's "Device-token schema" for why that's captured now rather
 * than read fresh at send time. `'macos'`/`'windows'` are RFC 0087's
 * "Desktop native push" addendum (workstream 0010) — same schema, same
 * relay, same encryption scheme as the mobile platforms.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const relayUrl = await getConfiguredRelayUrl(pdb);
  if (relayUrl === null) {
    return NextResponse.json(
      { error: 'push relay is disabled for this instance' },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    platform?: string;
    deviceToken?: string;
    publicKey?: string;
  };

  const platform = body.platform?.trim();
  const deviceToken = body.deviceToken?.trim();
  const publicKey = body.publicKey?.trim();

  if (
    platform !== 'ios' &&
    platform !== 'android' &&
    platform !== 'macos' &&
    platform !== 'windows'
  ) {
    return NextResponse.json(
      { error: "platform must be 'ios', 'android', 'macos', or 'windows'" },
      { status: 400 },
    );
  }
  if (!deviceToken || !publicKey) {
    return NextResponse.json({ error: 'deviceToken and publicKey are required' }, { status: 400 });
  }

  await savePushDeviceToken(pdb, {
    id: randomUUID(),
    userId,
    platform,
    deviceToken,
    publicKey,
    relayUrl,
  });
  return NextResponse.json({ ok: true });
}
