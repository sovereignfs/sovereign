import { NextResponse } from 'next/server';
import { listAllPluginConnectionRefs } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { toConnectionRef } from '@/src/connections';
import { getPlatformDb } from '@/src/db';

/** GET /api/admin/connections — metadata-only external connection inventory. */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? '';
  if (!hasCapability(role, 'user:view')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const rows = await listAllPluginConnectionRefs(await getPlatformDb());
  return NextResponse.json({
    connections: rows.map((row) => {
      const { secretRef: _secretRef, ...ref } = toConnectionRef(row);
      return { ...ref, pluginId: row.pluginId, userId: row.userId };
    }),
  });
}
