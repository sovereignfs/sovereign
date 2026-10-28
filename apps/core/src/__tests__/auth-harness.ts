import type { Database } from '@sovereignfs/database';
import { createAuth, type Auth } from '../auth/auth';
import type { AuthMail } from '../auth/mail';
import type { RegistrationPolicy } from '../auth/registration';
import { resolveAuthSettings } from '../auth/settings';
import { config } from '../config';

export const BASE_URL = 'http://localhost:3000';
export const SECRET = 'a-secret-that-is-long-enough-to-pass-validation';
export const PASSWORD = 'correct horse battery';

// Verification is off here so the sign-in tests need no mail; `verification.suite.ts` turns it on.
const BASE_ENV = {
  SV_URL: BASE_URL,
  SV_AUTH_SECRET: SECRET,
  SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
};

export const authSettings = (env: Record<string, string> = {}) =>
  resolveAuthSettings(config.load({ ...BASE_ENV, ...env }));

/** Sign-up open to anyone, so the sign-in tests need no invitation. `registration.suite.ts` tests the policy. */
export const OPEN: RegistrationPolicy = { inviteOnly: () => Promise.resolve(false) };
export const INVITE_ONLY: RegistrationPolicy = { inviteOnly: () => Promise.resolve(true) };

/** No mail at all: sends vanish, and mail is never "not set up". */
export const NO_MAIL: AuthMail = {
  unavailable: () => Promise.resolve(undefined),
  verification: () => Promise.resolve(),
  passwordReset: () => Promise.resolve(),
  accountCreated: () => Promise.resolve(),
};

export const makeAuth = (
  database: Database,
  env: Record<string, string> = {},
  registration: RegistrationPolicy = OPEN,
): Auth => createAuth(database, authSettings(env), { registration, mail: NO_MAIL });

/** The parts of better-auth's JSON answers the tests read. */
export type AuthBody = {
  code?: string;
  message?: string;
  user?: { id: string; name: string; email: string };
  token?: string | null;
  status?: boolean;
  session?: { id: string; userId: string } | null;
  [key: string]: unknown;
};

export type Reply = {
  status: number;
  /** The parsed JSON body, or an empty object when there is none. */
  body: AuthBody;
  /** Every `Set-Cookie` header, whole. */
  setCookies: string[];
  headers: Headers;
};

/** Cookies by name: sending them back is what a browser does. */
export class Jar {
  readonly #cookies = new Map<string, string>();

  absorb(setCookies: readonly string[]): void {
    for (const line of setCookies) {
      const [pair = '', ...attributes] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired || value === '') this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  get(name: string): string | undefined {
    return this.#cookies.get(name);
  }

  without(...names: string[]): Jar {
    const copy = new Jar();
    for (const [name, value] of this.#cookies)
      if (!names.includes(name)) copy.#cookies.set(name, value);
    return copy;
  }

  header(): string | undefined {
    if (this.#cookies.size === 0) return undefined;
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

let nextAddress = 1;
/** A client address nobody else in the run has used, so tests do not share a rate limit. */
export const freshAddress = () => `198.51.100.${nextAddress++ % 250}`;

export type Call = {
  body?: unknown;
  jar?: Jar;
  /** The client address, as a trusted proxy would put it in X-Forwarded-For. */
  address?: string;
  origin?: string | null;
  /** The address core is served at; the default is {@link BASE_URL}. */
  baseUrl?: string;
  headers?: Record<string, string>;
};

/** One request to better-auth's HTTP handler, the way the route handler passes it on. */
export async function call(
  auth: Auth,
  method: 'GET' | 'POST',
  path: string,
  options: Call = {},
): Promise<Reply> {
  const headers = new Headers({ 'x-forwarded-for': options.address ?? freshAddress() });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const baseUrl = options.baseUrl ?? BASE_URL;
  if (options.origin !== null) headers.set('origin', options.origin ?? baseUrl);
  const cookie = options.jar?.header();
  if (cookie) headers.set('cookie', cookie);
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);

  const response = await auth.handler(
    new Request(`${baseUrl}/api/auth${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
  const text = await response.text();
  let body: AuthBody = {};
  try {
    // `null` is a real answer (get-session without a session); keep it distinct from nothing.
    if (text) body = JSON.parse(text) as AuthBody;
  } catch {
    body = { message: text };
  }
  const setCookies = response.headers.getSetCookie();
  options.jar?.absorb(setCookies);
  return { status: response.status, body, setCookies, headers: response.headers };
}

/** Who `get-session` says is signed in: `null` when nobody is (its answer is then JSON `null`). */
export const signedInAs = (reply: Reply) => (reply.body as AuthBody | null)?.user ?? null;

let nextEmail = 1;
export const freshEmail = () => `person${nextEmail++}@example.com`;

export async function signUp(
  auth: Auth,
  options: { email?: string; password?: string; name?: string; jar?: Jar } = {},
) {
  const email = options.email ?? freshEmail();
  const password = options.password ?? PASSWORD;
  const jar = options.jar ?? new Jar();
  const reply = await call(auth, 'POST', '/sign-up/email', {
    jar,
    body: { name: options.name ?? 'Ada Lovelace', email, password },
  });
  return { reply, email, password, jar };
}
