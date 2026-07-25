import { NextResponse } from 'next/server';
import { getPlatformDb } from '@/src/db';
import { getSelfServiceDirectory } from '@/src/plugin-access-server';
import { getInstalledPlugins } from '@/src/registry';

/**
 * Self-service plugin directory (RFC 0065 Task 15.3), exposed for client-side
 * fetching — needed so `plugins/launcher/app/_components/LauncherOfflineView.tsx`
 * can render it without server-rendering per-user data into the Launcher's
 * now offline-capable root page (RFC 0072; see `getSelfServiceDirectory`'s
 * caller in `../route.ts`, which does the equivalent server-side gating).
 * Session-gated by the middleware (`x-sovereign-user-id`/`-role` headers) —
 * no admin key. Returns `null` (as `{ eligible: null, enabled: null }` is
 * not distinguishable from an empty result, so this returns a 200 with a
 * `null` `directory` field) when the caller lacks `plugins:self-manage`.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const directory = await getSelfServiceDirectory(pdb, userId, role, getInstalledPlugins());
  return NextResponse.json({ directory });
}
