import { NextResponse } from 'next/server';
import { disconnectPluginConnection, listUserPluginConnectionRefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** DELETE /api/account/connections/:id — disconnect one user-scoped external connection. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const row = (await listUserPluginConnectionRefs(pdb, userId)).find((conn) => conn.id === id);
  if (row) {
    await disconnectPluginConnection(pdb, id, {
      tenantId: row.tenantId,
      pluginId: row.pluginId,
      userId,
    });
  }
  return new NextResponse(null, { status: 204 });
}
