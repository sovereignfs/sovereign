/**
 * Whether a client is trusted (core-app §3.6.4): an operator vouched for it, so its people are not asked
 * for consent and it may receive the `roles` scope. Every client is untrusted unless the operator says
 * otherwise: the flag is the plugin's `skipConsent`, empty on a client nobody marked.
 */
export function isTrusted(client: { skipConsent?: boolean | null } | null | undefined): boolean {
  return client?.skipConsent === true;
}

/** The scope a request may keep: an untrusted client never gets `roles`, however it asks. */
export function scopesAllowedFor(
  client: { skipConsent?: boolean | null } | null | undefined,
  scopes: readonly string[],
): string[] {
  return isTrusted(client) ? [...scopes] : scopes.filter((scope) => scope !== 'roles');
}
