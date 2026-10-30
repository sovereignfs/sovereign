/**
 * What the app keeps for the SDK's sign-in (sdk §9.1). The app owns its data, so the SDK ships no store outside `/testing`; a
 * database row or a cache entry with an expiry is enough.
 */
export type StoredRecord = {
  kind: 'session' | 'pending' | 'seen';
  /** Whose session it is, so a logout notice naming only the person can end every one. */
  sub?: string;
  /** The core session it belongs to, so a logout notice can end just it. */
  sid?: string;
  /** What the SDK keeps; the store keeps it as it is. */
  data: Record<string, unknown>;
};

export interface SessionStore {
  /** The record, or nothing when there is none or it has expired. A store MUST NOT return a record after its `expiresAt`. */
  get(id: string): Promise<StoredRecord | undefined> | StoredRecord | undefined;
  set(id: string, record: StoredRecord, expiresAt: number): Promise<void> | void;
  delete(id: string): Promise<void> | void;
  /** Removes every session of a person (`sub`), or the ones of one core session (`sid`). */
  deleteMatching(match: { sub?: string; sid?: string }): Promise<void> | void;
}

/** A signed-in person, as the app sees them (sdk §9). The claims are those of the scopes granted. */
export type Session = {
  /** Who the person is. It is stable: identify a person by it and by nothing else. */
  readonly sub: string;
  /** The core session this one belongs to, when core gave one. */
  readonly sid: string | undefined;
  /** What the ID token said: `name`, `email`, `picture`, and so on, for the scopes granted. */
  readonly claims: Readonly<Record<string, unknown>>;
  /** The scopes granted. */
  readonly scopes: readonly string[];
  /** The roles core gave a trusted app, or none. */
  readonly roles: readonly string[];
  /** When this session ends, in milliseconds. */
  readonly expiresAt: number;
};

/** True when core said the person has this role. An app that was not given `roles` has none (sdk §9). */
export function hasRole(session: Pick<Session, 'roles'>, role: string): boolean {
  return session.roles.includes(role);
}

// ---- cookies ----------------------------------------------------------------------

/** The cookie an app's session lives in: host-only with the `__Host-` prefix over https (core-app §3.5). */
export const cookieName = (kind: 'session' | 'signin', secure: boolean): string =>
  `${secure ? '__Host-' : ''}sv_${kind}`;

export function setCookie(
  name: string,
  value: string,
  options: { secure: boolean; maxAgeSeconds: number },
): string {
  // No `Domain`: that is what makes it host-only. `Path=/` and `Secure` are what the `__Host-` prefix requires.
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}; Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`;
}

export const clearCookie = (name: string, secure: boolean): string =>
  setCookie(name, '', { secure, maxAgeSeconds: 0 });

/** The cookies of a request, by name. */
export function readCookies(header: string | null): Record<string, string> {
  const found: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!(name in found)) found[name] = part.slice(at + 1).trim();
  }
  return found;
}

/** A random id for a record, 256 bits. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A path on the app and nothing else, so a sign-in cannot be used to send a person elsewhere. */
export function localPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u001f]/.test(value)) return '/';
  return value;
}
