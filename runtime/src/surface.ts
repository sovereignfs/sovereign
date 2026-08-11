/**
 * Native shell surface detection from the request User-Agent (RFC 0080,
 * extended by RFC 0082 for focused apps).
 *
 * Native shells append a `Sovereign-Shell/<mobile|desktop>-<platform>
 * <version>` token to their WebView User-Agent (e.g.
 * `Sovereign-Shell/mobile-ios 1.0.0`). A focused native app (RFC 0082) adds
 * an optional `(focus=<pluginId>)` suffix to the *same* token —
 * `Sovereign-Shell/mobile-ios 1.0.0 (focus=fs.sovereign.tally)` — rather
 * than inventing a second User-Agent grammar, since it is the same signal
 * at the same injection point. `runtime/middleware.ts` calls
 * {@link resolveSurface} once per request and injects the result as
 * `x-sovereign-surface` / `x-sovereign-shell-version` /
 * `x-sovereign-focus-plugin` headers, stripping any inbound value first so a
 * caller cannot forge them — the same discipline already applied to the
 * `x-sovereign-user-*` family. `x-sovereign-focus-plugin` is a
 * presentation/UX signal only (`runtime/src/route-lock.ts`'s redirect is a
 * product-scoping mechanism, never a security boundary) — see
 * `docs/architecture-rules.md`.
 *
 * Kept in sync by hand with `packages/sdk/src/device-client.ts`'s
 * client-side copy of this grammar, which cannot import this module (it
 * must stay dependency-free and browser-only). That copy only checks the
 * `mobile-`/`desktop-` prefix — it has no need for the focus suffix, so it
 * is unaffected by this extension.
 */

export type Surface = 'browser' | 'mobile' | 'desktop';

export interface ResolvedSurface {
  surface: Surface;
  /** The native shell's version, or null for `browser` / an unrecognized token. */
  shellVersion: string | null;
  /** The focused plugin ID (RFC 0082), or null when the shell isn't focused / isn't a native shell. */
  focusPlugin: string | null;
}

const SHELL_UA_TOKEN = /Sovereign-Shell\/(mobile|desktop)-[\w-]+ ([\d.]+)(?: \(focus=([\w.-]+)\))?/;

/** Unrecognized or absent User-Agent resolves to `browser`, never throws. */
export function resolveSurface(userAgent: string | null): ResolvedSurface {
  const match = userAgent ? SHELL_UA_TOKEN.exec(userAgent) : null;
  if (!match) return { surface: 'browser', shellVersion: null, focusPlugin: null };
  const [, surface, version, focusPlugin] = match;
  return {
    surface: surface as Surface,
    shellVersion: version ?? null,
    focusPlugin: focusPlugin ?? null,
  };
}

/**
 * Applies the resolved surface to a request-forwarding `Headers` object,
 * unconditionally overwriting any inbound `x-sovereign-surface` /
 * `x-sovereign-shell-version` / `x-sovereign-focus-plugin` — call this on
 * every path that forwards a request to a page or route, so
 * `sdk.device.getSurface()` is trustworthy everywhere, not just the
 * authenticated main path.
 */
export function applySurfaceHeaders(headers: Headers, userAgent: string | null): void {
  const { surface, shellVersion, focusPlugin } = resolveSurface(userAgent);
  headers.set('x-sovereign-surface', surface);
  if (shellVersion) headers.set('x-sovereign-shell-version', shellVersion);
  else headers.delete('x-sovereign-shell-version');
  if (focusPlugin) headers.set('x-sovereign-focus-plugin', focusPlugin);
  else headers.delete('x-sovereign-focus-plugin');
}

/**
 * Reads the already-trustworthy `x-sovereign-surface` header a Node-runtime
 * route or server component receives (injected by `applySurfaceHeaders`
 * above on every path middleware forwards through — never present as
 * meaningful caller input, since middleware strips any inbound copy first).
 * Falls back to `browser` for a missing/unrecognized value, matching
 * `resolveSurface`'s own safe-default discipline — never throws.
 */
export function parseSurfaceHeader(value: string | null): Surface {
  return value === 'mobile' || value === 'desktop' ? value : 'browser';
}
