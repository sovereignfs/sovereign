/**
 * Where to go after signing in: the page the person asked for, if it is a path on this site.
 * Anything else (another site, a protocol-relative `//host`, a backslash that browsers read as a
 * slash) falls back to the home page, so a crafted sign-in link cannot send someone elsewhere.
 */
export function safeReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.length > 2048) return '/';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\'))
    return '/';
  // Control characters (a tab or newline inside "/\t/host") are dropped by URL parsing, which
  // would turn a path into an address.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return '/';
  return candidate;
}
