import { NextResponse } from 'next/server';
import { deletePluginSecret, listUserPluginSecretRefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** DELETE /api/account/secrets/:id — revoke one user-scoped plugin vault entry. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const row = (await listUserPluginSecretRefs(pdb, userId)).find((secret) => secret.id === id);
  if (row) {
    await deletePluginSecret(pdb, id, {
      tenantId: row.tenantId,
      pluginId: row.pluginId,
      userId,
    });
  }
  return new NextResponse(null, { status: 204 });
}
