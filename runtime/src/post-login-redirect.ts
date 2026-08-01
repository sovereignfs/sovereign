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
