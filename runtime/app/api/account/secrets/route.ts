import { NextResponse } from 'next/server';
import { listUserPluginSecretRefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { toSecretRef } from '@/src/secrets';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** GET /api/account/secrets — metadata-only list of current user's plugin vault entries. */
export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const rows = await listUserPluginSecretRefs(await getPlatformDb(), userId);
  return NextResponse.json({
    secrets: rows.map((row) => ({ ...toSecretRef(row), pluginId: row.pluginId })),
  });
}
