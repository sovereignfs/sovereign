import { NextResponse } from 'next/server';
import { listAllPluginConnectionRefs } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { toConnectionRef } from '@/src/connections';
import { getPlatformDb } from '@/src/db';

/**
 * GET /api/admin/connections — metadata-only external connection inventory.
 *
 * Authorized by the internal admin key (`checkAdminKey`), like every other
 * `/api/admin/*` route. It must NOT authorize off `x-sovereign-user-role`: the
 * middleware matcher deliberately excludes `/api/admin`, so on this path that
 * header is never platform-injected and never stripped — a caller can forge it
 * (`curl -H 'x-sovereign-user-role: platform:owner'`) and it would be trusted
 * outright. Console reaches this route server-side with the admin key.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  const rows = await listAllPluginConnectionRefs(await getPlatformDb());
  return NextResponse.json({
    connections: rows.map((row) => {
      const { secretRef: _secretRef, ...ref } = toConnectionRef(row);
      return { ...ref, pluginId: row.pluginId, userId: row.userId };
    }),
  });
}
