/**
 * `@sovereignfs/auth/client` — the sign-in in a page (auth.md §2): the browser's better-auth client, the sign-in value, and signing
 * in with a passkey. Browser only; nothing here holds a secret of the app's.
 */
import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { derivePassword, fromBase64Url, type WebKey } from '@sovereignfs/crypto/web';
import { newPasswordProblem, PAGE_NOT_READY, type PasswordPolicy } from '../password-policy.js';
import { DEACTIVATED, emailRequestProblem } from './messages.js';

export { DEACTIVATED, emailRequestProblem, passkeyProblem } from './messages.js';

/**
 * The browser's client for the app's sign-in is better-auth's `createAuthClient` (from `better-auth/react`), called by the app so its
 * types are the app's own, with what the package gives (auth.md §2):
 *
 * ```ts
 * createAuthClient({
 *   ...SIGN_IN_CLIENT,
 *   plugins: [...signInClientPlugins(), inferAdditionalFields({ user: { ...SIGN_IN_USER_FIELDS } })],
 * });
 * ```
 *
 * `SIGN_IN_CLIENT` turns better-auth's own redirect off (auth.md §4, rule 14): it sends the browser to the address of any
 * `{ redirect, url }` answer by itself, and the forms follow it too, so an app's callback was requested twice with one authorization
 * code and the second request failed. The forms are the only ones that navigate.
 */
export const SIGN_IN_CLIENT = { disableDefaultFetchPlugins: true } as const;

/** The client plugins of the package's sign-in: the second step and passkeys. */
export function signInClientPlugins(): [
  ReturnType<typeof twoFactorClient>,
  ReturnType<typeof passkeyClient>,
] {
  return [twoFactorClient(), passkeyClient()];
}

/** What a sign-up and a profile may send, besides better-auth's own: the package's account fields. */
export const SIGN_IN_USER_FIELDS = {
  timezone: { type: 'string', required: false },
  locale: { type: 'string', required: false },
} as const;

/**
 * Reads the salt the sign-in value is derived with from a document of the app's (core's instance document, an app's vault id), once
 * per page: a 32-byte value in base64url under `field`.
 */
export function saltReader(address: string, field: string): () => Promise<Uint8Array> {
  let salt: Promise<Uint8Array> | undefined;
  return () => {
    salt ??= fetch(address, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('The document with the sign-in salt could not be read.');
        const value = fromBase64Url(
          (((await response.json()) as Record<string, unknown>)[field] as string) ?? '',
        );
        if (value?.length !== 32) throw new Error('The document has no sign-in salt.');
        return value;
      })
      .catch((error: unknown) => {
        salt = undefined;
        throw error;
      });
    return salt;
  };
}

/**
 * Lets the page paint before the derivation runs. Argon2id holds the page for about a second on a phone, and without this the
 * "working" state set just before would not show until it is over.
 */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * What a browser sends where it used to send a password (auth.md §4, rule 1): the sign-in value, derived from the password, the
 * address and the app's salt, so the server never receives the password. Every form that sets or asks for a password calls it, in a
 * handler, never in render.
 */
export function signInDerivation(readSalt: () => Promise<Uint8Array>) {
  /**
   * The sign-in value for this password and address, and the secret it was made from, which opens the person's keys once the server
   * has accepted the value. The secret is a key that cannot be exported; it never leaves the browser.
   */
  async function deriveForSignIn(
    password: string,
    address: string,
  ): Promise<{ signIn: string; secret: WebKey }> {
    const salt = await readSalt();
    await nextPaint();
    return derivePassword({ password, address, instanceId: salt });
  }
  /** The sign-in value alone, where nothing is opened afterwards. */
  async function signInValue(password: string, address: string): Promise<string> {
    return (await deriveForSignIn(password, address)).signIn;
  }
  return { deriveForSignIn, signInValue };
}

/** A refusal from better-auth, as a form reads it. */
export type Refusal = { status: number; code?: string; message?: string };

/** What signing in with a passkey needs of the client: its passkey sign-in. */
type PasskeyClient = {
  signIn: {
    passkey(input: { extensions?: unknown; returnWebAuthnResponse: true }): Promise<
      | {
          error?: Refusal | null;
          data?: unknown;
          webauthn?: { response: { id: string }; clientExtensionResults: unknown };
        }
      | null
      | undefined
    >;
  };
};

/**
 * The key store's part in a passkey sign-in (auth.md §7.2): the PRF extension to ask for, reading its output, and what to do with it
 * once the server has accepted the passkey. An app with no encryption gives none.
 */
export type PasskeyKeys = {
  extension(): Promise<unknown>;
  output(results: unknown): Uint8Array | undefined;
  accepted(credentialId: string, output: Uint8Array): Promise<void>;
};

/**
 * Signing in with a passkey, the same on the sign-in page and on its second step: the PRF extension is asked for when the app has a key
 * store, so the same touch unlocks the person's keys. A page that cannot read what the extension needs still signs in, without it, and
 * so does a passkey that does not answer it, with the keys left locked. What comes back is the server's answer, or the refusal.
 */
export async function signInWithPasskey(
  client: PasskeyClient,
  keys?: PasskeyKeys,
): Promise<{ error: Refusal; data?: undefined } | { error?: undefined; data: unknown }> {
  const extensions = keys ? await keys.extension().catch(() => undefined) : undefined;
  const result = await client.signIn.passkey({
    ...(extensions ? { extensions } : {}),
    returnWebAuthnResponse: true,
  });
  if (result?.error) return { error: result.error };
  if (keys && result?.webauthn) {
    const output = keys.output(result.webauthn.clientExtensionResults);
    if (output) await keys.accepted(result.webauthn.response.id, output);
  }
  return { data: result?.data };
}

/** What signing in with a password needs of the client: its email sign-in. */
type PasswordClient = {
  signIn: {
    email(input: { email: string; password: string }): Promise<{
      error?: Refusal | null;
      data?: unknown;
    }>;
  };
};

/** What signing in with a password came to, for the page to act on. */
export type PasswordSignIn =
  | { outcome: 'signed-in'; data: unknown; secret: WebKey }
  | { outcome: 'second-step'; secret: WebKey }
  | { outcome: 'unverified' }
  | { outcome: 'refused'; message: string }
  | { outcome: 'not-ready' }
  | { outcome: 'other'; error: Refusal };

/**
 * Signing in with a password (auth.md §4, rule 1): the sign-in value is derived from it and sent, never the password. The answer is
 * told apart the way the page needs it, and the same sentence goes to an address with an account and one without. `isOther` lets the
 * app take a refusal of its own first (core: an app's sign-in request that ran out), before anything about the account is said.
 */
export async function signInWithPassword(
  client: PasswordClient,
  derive: ReturnType<typeof signInDerivation>['deriveForSignIn'],
  { email, password }: { email: string; password: string },
  isOther: (error: Refusal) => boolean = () => false,
): Promise<PasswordSignIn> {
  let value: string;
  let secret: WebKey;
  try {
    // The password never leaves the browser: what is sent is made from it.
    ({ signIn: value, secret } = await derive(password, email));
  } catch {
    return { outcome: 'not-ready' };
  }
  const result = await client.signIn.email({ email, password: value });
  if (result.error) {
    // Checked before the password, so it says nothing about the account.
    if (isOther(result.error)) return { outcome: 'other', error: result.error };
    // Said only to someone who gave the right password, so it tells nobody else anything.
    if (result.error.code === 'ACCOUNT_DEACTIVATED')
      return { outcome: 'refused', message: DEACTIVATED };
    if (result.error.code === 'EMAIL_NOT_VERIFIED') return { outcome: 'unverified' };
    // The same sentence whether the address has an account or not.
    return {
      outcome: 'refused',
      message:
        result.error.status === 429
          ? 'Too many attempts. Wait a minute, then try again.'
          : 'The email or password is incorrect.',
    };
  }
  // The password was right but a second step is asked for: no session exists yet.
  const data = result.data as { twoFactorRedirect?: unknown } | undefined;
  if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect)
    return { outcome: 'second-step', secret };
  return { outcome: 'signed-in', data: result.data, secret };
}

/** What asking for a reset link needs of the client. */
type ResetRequestClient = {
  requestPasswordReset(input: {
    email: string;
    redirectTo: string;
  }): Promise<{ error?: Refusal | null }>;
};

/**
 * Asking for a link to reset the password (auth.md §4, rule 9): the answer is the same whether or not the address has an account, so
 * only a refusal that says nothing about it (too many requests, no mail set up) comes back as a sentence.
 */
export async function requestPasswordReset(
  client: ResetRequestClient,
  input: { email: string; redirectTo: string },
): Promise<{ sent: true } | { sent: false; message: string }> {
  const result = await client.requestPasswordReset(input);
  if (result.error) {
    return {
      sent: false,
      message:
        emailRequestProblem(result.error) ??
        'The request could not be sent. Check the address and try again.',
    };
  }
  return { sent: true };
}

/** What setting a new password from a reset link needs of the client. */
type ResetClient = {
  resetPassword(input: { newPassword: string; token: string }): Promise<{ error?: Refusal | null }>;
};

/**
 * Setting a new password from a reset link (auth.md §4, rule 1): checked against the policy, typed twice, then sent as the sign-in
 * value made with the account's address, never as the password. A link that has run out or was used says so.
 */
export async function resetPassword(
  client: ResetClient,
  signInValue: (password: string, address: string) => Promise<string>,
  input: {
    password: string;
    confirm: string;
    address: string;
    token: string;
    policy: PasswordPolicy;
  },
): Promise<{ outcome: 'done' } | { outcome: 'expired' } | { outcome: 'refused'; message: string }> {
  const problem = newPasswordProblem(input.password, input.confirm, input.policy);
  if (problem) return { outcome: 'refused', message: problem };
  let value: string;
  try {
    value = await signInValue(input.password, input.address);
  } catch {
    return { outcome: 'refused', message: PAGE_NOT_READY };
  }
  const result = await client.resetPassword({ newPassword: value, token: input.token });
  if (!result.error) return { outcome: 'done' };
  if (result.error.code === 'INVALID_TOKEN') return { outcome: 'expired' };
  const common = emailRequestProblem(result.error);
  if (common) return { outcome: 'refused', message: common };
  if (result.error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && result.error.message) {
    return { outcome: 'refused', message: result.error.message };
  }
  return { outcome: 'refused', message: 'The password could not be changed. Try again.' };
}

/**
 * What is wrong with a sign-up before anything is sent, in one sentence, or nothing: the terms when the app asks for them, then the
 * password against the policy, typed twice. The server refuses these too; this saves the person a round trip.
 */
export function signUpProblem(input: {
  agreed: boolean;
  password: string;
  confirm: string;
  policy: PasswordPolicy;
}): string | undefined {
  if (!input.agreed)
    return 'Accept the Terms of Service and the Privacy Policy to create an account.';
  return newPasswordProblem(input.password, input.confirm, input.policy);
}

/** What signing up needs of the client: its sign-up, and signing in for an address an invitation verified. */
type SignUpClient = PasswordClient & {
  signUp: {
    email(
      input: Record<string, unknown> & { name: string; email: string; password: string },
    ): Promise<{
      error?: Refusal | null;
      data?: { token?: string | null; user?: { emailVerified?: boolean } } | null;
    }>;
  };
};

/** What signing up came to, for the page to act on. */
export type SignUpOutcome =
  | { outcome: 'signed-in'; secret: WebKey; data?: unknown }
  | { outcome: 'waiting' }
  | { outcome: 'refused'; message: string };

/** What a sign-up refusal says, in words a person can act on. The server's password and terms messages already are. */
export function signUpRefusal(error: Refusal): string {
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.code === 'EMAIL_NOT_AVAILABLE') {
    return "Email isn't set up on this instance, so accounts can't be verified yet. Ask whoever runs it.";
  }
  if (error.code === 'INVITE_REQUIRED')
    return 'There is no valid invitation for this email address. Ask whoever runs this instance to invite you.';
  if (error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && error.message) return error.message;
  if (error.code === 'TERMS_NOT_ACCEPTED' && error.message) return error.message;
  if (error.code === 'INVALID_TIMEZONE') {
    return 'Your browser reported a time zone this instance does not recognise. Try again in another browser.';
  }
  if (error.code === 'USER_ALREADY_EXISTS' || error.code?.startsWith('USER_ALREADY_EXISTS'))
    return 'An account with this email address already exists. Try signing in instead.';
  if (error.code === 'INVALID_EMAIL') return 'Enter a valid email address.';
  return 'The account could not be created. Check what you entered and try again.';
}

/**
 * Signing up (auth.md §4, rule 1): the sign-in value is derived and sent with the browser's time zone and whatever else the app adds
 * (`extra`: core's terms and invitation), never the password. An address still to verify waits for its link; one an invitation verified
 * is signed in with the value just made; otherwise the person is signed in at once.
 */
export async function signUp(
  client: SignUpClient,
  derive: ReturnType<typeof signInDerivation>['deriveForSignIn'],
  input: { name: string; email: string; password: string; callbackURL: string },
  extra: Record<string, unknown> = {},
): Promise<SignUpOutcome | { outcome: 'not-ready' }> {
  let value: string;
  let secret: WebKey;
  try {
    ({ signIn: value, secret } = await derive(input.password, input.email));
  } catch {
    return { outcome: 'not-ready' };
  }
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = await client.signUp.email({
    name: input.name,
    email: input.email,
    password: value,
    ...extra,
    ...(timezone ? { timezone } : {}),
    callbackURL: input.callbackURL,
  });
  if (result.error) return { outcome: 'refused', message: signUpRefusal(result.error) };
  // No session and an address not yet verified: the next step is the inbox.
  if (!result.data?.token && !result.data?.user?.emailVerified) return { outcome: 'waiting' };
  // Verified already while verification is required: better-auth opens no session at sign-up then, so the person is signed in with the
  // value just made, and goes straight on.
  if (!result.data?.token) {
    const signedIn = await client.signIn.email({ email: input.email, password: value });
    if (signedIn.error) return { outcome: 'refused', message: signUpRefusal(signedIn.error) };
    return { outcome: 'signed-in', secret, data: signedIn.data };
  }
  return { outcome: 'signed-in', secret };
}
