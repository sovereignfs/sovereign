import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { getPlatformVersion } from '@/src/platform-version';
import { assembleExport } from '@/src/portability/assemble';
import {
  eligibleExportPlugins,
  gatherPlatformExport,
  installedPluginsRoster,
} from '@/src/portability/platform';

// Public runtime URL recorded in the bundle for provenance. Read via a computed
// key so Next does not inline NEXT_PUBLIC_* at build time (the value must track
// the runtime env). Best-effort — null when unset.
function sourceInstance(): string | null {
  const key = 'NEXT_PUBLIC_RUNTIME_URL';
  return process.env[key] ?? null;
}

// RFC 0068: an explicit, documented ceiling rather than an implicit ("it'll
// probably fit") one — matches the import route's MAX_IMPORT_BYTES, so any
// export this instance produces is guaranteed re-importable on itself.
const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

/**
 * Export the current user's data as a versioned ZIP (RFC 0007 / RFC 0052 / ACC).
 * Session-gated by the middleware, which injects the verified
 * `x-sovereign-user-id`; a user can only ever export their own data.
 * Synchronous, capped at `MAX_EXPORT_BYTES` (RFC 0068) rather than
 * background-assembled — see the RFC for the size/assembly-mode decision.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const cookie = request.headers.get('cookie') ?? '';
  const platform = await gatherPlatformExport(userId, cookie);
  const [exportPlugins, installedPlugins] = await Promise.all([
    eligibleExportPlugins(),
    installedPluginsRoster(),
  ]);
  // `?includeFiles=false` lets the user skip attachments/blobs for a lighter
  // export (RFC 0052 user-selected export options); defaults to including them.
  const includeFiles = new URL(request.url).searchParams.get('includeFiles') !== 'false';

  const zip = await assembleExport({
    userId,
    tenantId: DEFAULT_TENANT_ID,
    platform,
    platformVersion: getPlatformVersion(),
    sourceInstance: sourceInstance(),
    exportPlugins,
    installedPlugins,
    options: { includeFiles },
  });

  if (zip.byteLength > MAX_EXPORT_BYTES) {
    return NextResponse.json(
      {
        error: `Export exceeds the ${String(MAX_EXPORT_BYTES / (1024 * 1024))}MB size limit. Try exporting again with "Include files and attachments" unchecked.`,
      },
      { status: 413 },
    );
  }

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
