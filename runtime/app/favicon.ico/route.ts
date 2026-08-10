import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';
import { instanceAssetPath, instanceContentType } from '@/src/instance';

/**
 * GET /favicon.ico
 *
 * RFC 0027 Phase 3: browsers request this exact path regardless of the
 * `<link rel="icon">` metadata in layout.tsx, so the fallback only becomes
 * transparent if this route itself owns `/favicon.ico`. Serves the uploaded
 * instance favicon when configured; otherwise falls back to the committed
 * default. The default lives at public/icons/favicon.ico rather than
 * public/favicon.ico — Next.js rejects a public file and an app route
 * sharing one path (a build-time "conflicting public file and page file"
 * error), and this route needs `/favicon.ico` for itself.
 * Excluded from the middleware session gate (runtime/middleware.ts matcher).
 *
 * `force-dynamic` is required: Next.js treats the `favicon.ico` path as its
 * built-in icon-generation convention and defaults it to static, build-time
 * output (like `icon.tsx`/`apple-icon.tsx`) even though this is a plain route
 * handler — confirmed by inspecting `.next/server/app/favicon.ico.body` after
 * a build without this flag, which snapshots whatever was on disk at build
 * time instead of re-reading `instanceAssetPath('favicon')` per request. That
 * would silently freeze the favicon at the value present when the image was
 * built, defeating the whole point of Console-configurable branding.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const configured = instanceAssetPath('favicon');
  const filePath =
    configured ?? join(findWorkspaceRoot(), 'runtime', 'public', 'icons', 'favicon.ico');
  const bytes = readFileSync(filePath);
  return new Response(bytes, {
    headers: {
      'content-type': instanceContentType(filePath),
      // Matches /api/instance/favicon and /api/instance/logo's cache policy.
      'cache-control': 'public, max-age=86400',
    },
  });
}
