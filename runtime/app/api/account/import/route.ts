import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { applyPlatformImport, eligiblePluginIds } from '@/src/portability/platform';
import { applyImport } from '@/src/portability/restore';

/** Reject oversized uploads before buffering (RFC 0007 — sync import, size cap). */
const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Import / restore a previously exported bundle into the current user's account
 * (RFC 0007 / ACC). Session-gated; the verified `x-sovereign-user-id` is the
 * import subject, so a malicious bundle can only ever write into the importing
 * user's own account. Additive merge; unknown/disabled/un-permitted plugins are
 * skipped with a warning. Returns a per-section summary.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const cookie = request.headers.get('cookie') ?? '';

  const form = await request.formData();
  const file = form.get('bundle');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no bundle provided' }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: 'bundle exceeds the size limit' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const importPlugins = new Set(await eligiblePluginIds('data:import'));

  let summary;
  try {
    summary = await applyImport({
      bytes,
      userId,
      tenantId: DEFAULT_TENANT_ID,
      importPlugins,
      platformImporter: (account, avatar) => applyPlatformImport(userId, cookie, account, avatar),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid bundle' },
      { status: 400 },
    );
  }

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'account.data_imported',
    visibility: 'user',
    summary: 'Imported account data',
  });

  // The import may have changed the profile name/avatar; drop the signed session
  // cache cookies so the next request re-verifies and the chrome/profile show
  // the restored values immediately (same pattern as the avatar/name flows).
  const res = NextResponse.json(summary);
  res.cookies.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_data', '', { maxAge: 0, path: '/', secure: true });
  return res;
}
