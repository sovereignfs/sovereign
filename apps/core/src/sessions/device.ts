/**
 * A user agent as a person would say it: "Chrome on macOS". It is only a label to help someone tell
 * their own sessions apart, so it is read loosely and says "Unknown device" rather than guess.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (ua.trim() === '') return 'Unknown device';

  const browser = /\bEdg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(ua)
      ? 'Opera'
      : /\bFirefox\/|\bFxiOS\//.test(ua)
        ? 'Firefox'
        : /\bCriOS\/|\bChrome\//.test(ua)
          ? 'Chrome'
          : /\bSafari\//.test(ua) && /\bVersion\//.test(ua)
            ? 'Safari'
            : /^curl\//i.test(ua)
              ? 'curl'
              : undefined;

  const system = /\b(iPhone|iPad|iPod)\b/.test(ua)
    ? 'iOS'
    : /\bAndroid\b/.test(ua)
      ? 'Android'
      : /\bCrOS\b/.test(ua)
        ? 'ChromeOS'
        : /\bWindows\b/.test(ua)
          ? 'Windows'
          : /\bMac OS X\b|\bMacintosh\b/.test(ua)
            ? 'macOS'
            : /\bLinux\b/.test(ua)
              ? 'Linux'
              : undefined;

  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}

/**
 * An address as it is worth showing. better-auth keeps an IPv6 address in full ("2001:0db8:0000:…"),
 * which is hard to read, so it is shortened the usual way; and an address that only means "this
 * computer" (loopback, or all zeros) tells the person nothing, so it is left out.
 */
export function describeAddress(address: string | null | undefined): string | null {
  const text = (address ?? '').trim();
  if (text === '' || text === '127.0.0.1' || text === '::1') return null;
  if (!text.includes(':')) return text;
  const groups = text.split(':');
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return text;
  const short = groups.map((group) => group.replace(/^0+(?=.)/, '').toLowerCase());
  if (short.every((group) => group === '0')) return null;
  let best = { start: -1, length: 0 };
  for (let i = 0; i < short.length; i++) {
    let j = i;
    while (j < short.length && short[j] === '0') j++;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = Math.max(i, j);
  }
  if (best.length < 2) return short.join(':');
  const head = short.slice(0, best.start).join(':');
  const tail = short.slice(best.start + best.length).join(':');
  return `${head}::${tail}`;
}
