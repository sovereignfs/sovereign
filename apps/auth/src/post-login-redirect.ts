/**
 * Guards the `returnUrl` query param carried through /login (and /login/2fa)
 * against open-redirect abuse — only a same-origin absolute path is safe to
 * hand to `window.location.href`.
 */
export function sanitizeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.includes('://')) return null;
  return raw;
}

/**
 * `runtimeUrl` is the browser-facing runtime origin (see runtimePublicUrl).
 * The protected resource the user originally requested always lives on the
 * runtime, never on this auth app, so a validated `returnUrl` is resolved
 * against that origin rather than this app's own.
 */
export function resolveRuntimeRedirect(runtimeUrl: string, returnUrl: string | null): string {
  const safe = sanitizeRedirectPath(returnUrl);
  return safe ? runtimeUrl + safe : runtimeUrl;
}
