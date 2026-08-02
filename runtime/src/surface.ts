/**
 * Native shell surface detection from the request User-Agent (RFC 0080).
 *
 * Native shells append a `Sovereign-Shell/<mobile|desktop>-<platform>
 * <version>` token to their WebView User-Agent (e.g.
 * `Sovereign-Shell/mobile-ios 1.0.0`). `runtime/middleware.ts` calls
 * {@link resolveSurface} once per request and injects the result as
 * `x-sovereign-surface` / `x-sovereign-shell-version` headers, stripping any
 * inbound value first so a caller cannot forge them — the same discipline
 * already applied to the `x-sovereign-user-*` family.
 *
 * Kept in sync by hand with `packages/sdk/src/device-client.ts`'s
 * client-side copy of this grammar, which cannot import this module (it
 * must stay dependency-free and browser-only).
 */

export type Surface = 'browser' | 'mobile' | 'desktop';

export interface ResolvedSurface {
  surface: Surface;
  /** The native shell's version, or null for `browser` / an unrecognized token. */
  shellVersion: string | null;
}

const SHELL_UA_TOKEN = /Sovereign-Shell\/(mobile|desktop)-[\w-]+ ([\d.]+)/;

/** Unrecognized or absent User-Agent resolves to `browser`, never throws. */
export function resolveSurface(userAgent: string | null): ResolvedSurface {
  const match = userAgent ? SHELL_UA_TOKEN.exec(userAgent) : null;
  if (!match) return { surface: 'browser', shellVersion: null };
  const [, surface, version] = match;
  return { surface: surface as Surface, shellVersion: version ?? null };
}

/**
 * Applies the resolved surface to a request-forwarding `Headers` object,
 * unconditionally overwriting any inbound `x-sovereign-surface` /
 * `x-sovereign-shell-version` — call this on every path that forwards a
 * request to a page or route, so `sdk.device.getSurface()` is trustworthy
 * everywhere, not just the authenticated main path.
 */
export function applySurfaceHeaders(headers: Headers, userAgent: string | null): void {
  const { surface, shellVersion } = resolveSurface(userAgent);
  headers.set('x-sovereign-surface', surface);
  if (shellVersion) headers.set('x-sovereign-shell-version', shellVersion);
  else headers.delete('x-sovereign-shell-version');
}
