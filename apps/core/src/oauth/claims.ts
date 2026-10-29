import { isRole } from '../auth/roles';

/** What the claims are made from: the account row, as better-auth gives it to the provider. */
export type ClaimsUser = {
  name?: unknown;
  email?: unknown;
  emailVerified?: unknown;
  image?: unknown;
  role?: unknown;
  timezone?: unknown;
  locale?: unknown;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * The claims a granted set of scopes allows (core-app §3.6.2), for the ID token and for the userinfo
 * endpoint alike, so an ordinary relying party can read them from either:
 *
 * - `profile`: `name`, `picture`, `locale`, `zoneinfo`. The picture is an absolute address (the stored
 *   one is core's own path, which means nothing on another site); `locale` and `zoneinfo` are the
 *   person's saved preferences and are left out when none is saved, never sent empty.
 * - `email`: `email` and `email_verified`.
 * - `roles`: `roles`, the account's platform role. Whether a client may ask for it at all is decided
 *   by the scopes it is allowed (§3.6.4): this only says what a granted `roles` scope shows.
 *
 * A claim of a scope that was not granted is never added.
 */
export function claimsFor(
  user: ClaimsUser,
  scopes: readonly string[],
  baseUrl: string,
): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  if (scopes.includes('profile')) {
    const name = text(user.name);
    if (name) claims.name = name;
    const image = text(user.image);
    if (image) claims.picture = new URL(image, baseUrl).href;
    const locale = text(user.locale);
    if (locale) claims.locale = locale;
    const zoneinfo = text(user.timezone);
    if (zoneinfo) claims.zoneinfo = zoneinfo;
  }
  if (scopes.includes('email')) {
    const email = text(user.email);
    if (email) claims.email = email;
    claims.email_verified = user.emailVerified === true;
  }
  if (scopes.includes('roles')) {
    claims.roles = isRole(user.role) ? [user.role] : [];
  }
  return claims;
}
