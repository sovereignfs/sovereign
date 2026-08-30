import { headers } from 'next/headers';

/** Where the current request originated (RFC 0080). */
export type Surface = 'browser' | 'mobile' | 'desktop';

function parseSurface(value: string | null): Surface {
  return value === 'mobile' || value === 'desktop' ? value : 'browser';
}

async function safeHeaders(): Promise<Headers | null> {
  try {
    return await headers();
  } catch {
    // Outside a Next.js request context (e.g. a background job/schedule
    // handler, a unit test) — next/headers() throws. Callers fall back to
    // their own documented safe default rather than propagating this.
    return null;
  }
}

/**
 * Server-side surface detection (RFC 0080).
 *
 * **A presentation hint only, never a security boundary** — see
 * `docs/architecture-rules.md`. The signal derives from the shell's own
 * User-Agent, which any caller can set to anything; it must never gate
 * authorization, entitlement, paywall, or data-access decisions.
 *
 * Reads the `x-sovereign-surface` / `x-sovereign-shell-version` headers the
 * runtime middleware injects, stripping any inbound value first so a caller
 * cannot forge them. Returns the safe default (`'browser'` / `null`)
 * outside a plugin route context, in a unit test, anywhere — never throws,
 * matching `env.ts`'s discipline rather than `data.ts`'s `requireHost()`
 * RPC style.
 */
export const device = {
  /** The current request's surface. */
  async getSurface(): Promise<Surface> {
    const h = await safeHeaders();
    return parseSurface(h?.get('x-sovereign-surface') ?? null);
  },
  /** The native shell's version, or null outside a native shell. */
  async getShellVersion(): Promise<string | null> {
    const h = await safeHeaders();
    return h?.get('x-sovereign-shell-version') ?? null;
  },
  /** True when running inside any native shell (mobile or desktop). */
  async isNativeShell(): Promise<boolean> {
    const h = await safeHeaders();
    return parseSurface(h?.get('x-sovereign-surface') ?? null) !== 'browser';
  },
};
