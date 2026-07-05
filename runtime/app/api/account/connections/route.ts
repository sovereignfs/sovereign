import { NextResponse } from 'next/server';
import { listUserPluginConnectionRefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { toConnectionRef } from '@/src/connections';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** GET /api/account/connections — metadata-only list of current user's external connections. */
export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const rows = await listUserPluginConnectionRefs(await getPlatformDb(), userId);
  return NextResponse.json({
    connections: rows.map((row) => {
      const { secretRef: _secretRef, ...ref } = toConnectionRef(row);
      return { ...ref, pluginId: row.pluginId };
    }),
  });
}
