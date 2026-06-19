import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { getPlatformVersion } from '@/src/platform-version';
import { assembleExport } from '@/src/portability/assemble';
import { eligiblePluginIds, gatherPlatformExport } from '@/src/portability/platform';

// Public runtime URL recorded in the bundle for provenance. Read via a computed
// key so Next does not inline NEXT_PUBLIC_* at build time (the value must track
// the runtime env). Best-effort — null when unset.
function sourceInstance(): string | null {
  const key = 'NEXT_PUBLIC_RUNTIME_URL';
  return process.env[key] ?? null;
}

/**
 * Export the current user's data as a versioned ZIP (RFC 0007 / ACC). Session-
 * gated by the middleware, which injects the verified `x-sovereign-user-id`;
 * a user can only ever export their own data. Synchronous with a size implied by
 * the data; large/async export is deferred (RFC 0007 open question).
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const cookie = request.headers.get('cookie') ?? '';
  const platform = await gatherPlatformExport(userId, cookie);
  const exportPlugins = await eligiblePluginIds('data:export');

  const zip = await assembleExport({
    userId,
    tenantId: DEFAULT_TENANT_ID,
    platform,
    platformVersion: getPlatformVersion(),
    sourceInstance: sourceInstance(),
    exportPlugins,
  });

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'account.data_exported',
    visibility: 'user',
    summary: 'Exported account data',
  });

  const filename = `sovereign-export-${new Date().toISOString().slice(0, 10)}.zip`;
  // Copy into a plain ArrayBuffer for the response body — a bare
  // Uint8Array<ArrayBufferLike> (fflate's return) doesn't satisfy BodyInit under
  // the current TS lib types.
  const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zip.byteLength),
    },
  });
}
