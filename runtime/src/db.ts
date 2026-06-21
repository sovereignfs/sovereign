import { headers } from 'next/headers';
import { getPlatformDb as _getRealDb } from '@sovereignfs/db';
import { DEV_MODE_FORWARDED_HEADER, isDevModeConfigured } from './dev-mode';
import { getDevDb } from './dev-db';

/**
 * Returns the platform database for the current request (RFC 0020).
 *
 * When dev-mode is enabled (SOVEREIGN_DEV_MODE_ENABLED=true) and the incoming
 * request carries the forwarded dev-mode header set by middleware after secret
 * validation, returns the mock DB client instead of the real one. Falls back
 * to the real DB in non-request contexts (boot, instrumentation, tests) via
 * try/catch around next/headers().
 *
 * Always import getPlatformDb from this module — not from @sovereignfs/db
 * directly — so dev-mode transparency is automatic in all runtime route
 * handlers and server components.
 */
export async function getPlatformDb() {
  if (isDevModeConfigured()) {
    try {
      const hdrs = await headers();
      if (hdrs.get(DEV_MODE_FORWARDED_HEADER) === '1') {
        return getDevDb();
      }
    } catch {
      // Not in a Next.js request context (boot, instrumentation, tests) —
      // fall through to the real DB.
    }
  }
  return _getRealDb();
}
