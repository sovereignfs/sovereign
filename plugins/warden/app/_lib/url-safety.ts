import { lookup } from 'node:dns/promises';

/**
 * Guards against a user-configured provider `baseUrl` being used to make the
 * server reach places it shouldn't (RFC 0063 §3/§4, epic task 22.4). This is
 * new attack surface introduced by this task, not called out in the task's
 * own review checklist — a logged-in but otherwise unprivileged user could
 * otherwise point a provider at this instance's own internal network
 * (`sovereign_net`) and use Warden's model-list/chat requests as a blind
 * SSRF proxy against sibling containers.
 *
 * Deliberately narrow, not a general private-IP blocklist: this instance's
 * own stated design goal (RFC 0063 Motivation) is that a user can point
 * Warden at their own self-hosted model server, which for a typical home-lab
 * operator is very often itself on a private LAN address (192.168.x,
 * 10.x, ...). Blocking all of RFC1918 space would break that legitimate,
 * explicitly-supported case for every user, not just attackers. Instead this
 * blocks only:
 *
 * 1. Loopback and link-local/cloud-metadata addresses (127.0.0.0/8, ::1,
 *    169.254.0.0/16 including 169.254.169.254, fe80::/10) — there is no
 *    legitimate reason a *remote* model server would ever resolve here from
 *    this container's point of view.
 * 2. This repository's own known internal Compose service hostnames — the
 *    obvious, zero-effort attack ("point it at `harness-engine`") that
 *    someone can find just by reading `docker-compose.yml`.
 *
 * What this does **not** catch: a user who already knows this specific
 * instance's actual Docker bridge subnet or a container's resolved IP could
 * still reach it by raw IP address, since general private-range blocking is
 * deliberately not applied. Closing that fully would need either an
 * operator-controlled allowlist policy or runtime introspection of the
 * actual network CIDR — a real gap, left as a named follow-up rather than
 * solved (or silently assumed solved) here.
 */

export class UnsafeProviderUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeProviderUrlError';
  }
}

/** This repo's own docker-compose.yml service names and container_name aliases. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'auth',
  'sovereign-auth',
  'runtime',
  'sovereign-runtime',
  'relay',
  'sovereign-relay',
  'harness',
  'sovereign-harness',
  'harness-engine',
  'sovereign-harness-engine',
  'sqld',
  'sovereign-sqld',
  'mailpit',
  'sovereign-mailpit',
]);

function isLoopbackOrLinkLocal(address: string, family: number): boolean {
  if (family === 4) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true; // malformed -> reject closed
    const [a, b] = parts;
    return a === 127 || (a === 169 && b === 254) || a === 0;
  }
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — check the embedded IPv4 address too.
    return isLoopbackOrLinkLocal(normalized.slice('::ffff:'.length), 4);
  }
  return false;
}

/**
 * Throws `UnsafeProviderUrlError` if `rawUrl` isn't a safe candidate for a
 * server-side outbound request. Resolves the hostname and checks the actual
 * IP (not just the literal string) so a DNS name that merely resolves to a
 * blocked address is caught too. Call this both when saving a provider (fast
 * feedback in the form) and immediately before every outbound request
 * (defense in depth against a TTL-based DNS rebind between the two).
 */
export async function assertSafeProviderBaseUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeProviderUrlError('The base URL is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeProviderUrlError('The base URL must use http or https.');
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeProviderUrlError('This base URL is not reachable as a model provider.');
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeProviderUrlError("The base URL's host could not be resolved.");
  }
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isLoopbackOrLinkLocal(entry.address, entry.family))
  ) {
    throw new UnsafeProviderUrlError('This base URL is not reachable as a model provider.');
  }
  return url;
}
