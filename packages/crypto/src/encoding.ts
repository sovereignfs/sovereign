/**
 * Strict base64 and base64url: the alphabet of one or the other (never both), correct
 * padding or none, and no stray characters. Node's own decoder silently skips what it does
 * not understand, which would let a mistyped key or a damaged value through as different
 * bytes.
 */
export function decodeBase64(text: string): Buffer | undefined {
  // An index scan, not /=+$/: an anchored quantifier is quadratic on a long run.
  let end = text.length;
  while (end > 0 && text[end - 1] === '=') end -= 1;
  const padding = text.length - end;
  const body = text.slice(0, end);
  if (padding > 2 || body === '' || body.length % 4 === 1) return undefined;
  if (padding > 0 && (body.length + padding) % 4 !== 0) return undefined;

  const standard = /^[A-Za-z0-9+/]+$/.test(body);
  const url = /^[A-Za-z0-9_-]+$/.test(body);
  if (!standard && !url) return undefined;
  return Buffer.from(body, url && !standard ? 'base64url' : 'base64');
}

export const encodeBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url');
