/**
 * `@sovereignfs/auth/client` — the sign-in in a page (auth.md §2): the browser's better-auth client, the sign-in value, and signing
 * in with a passkey. Browser only; nothing here holds a secret of the app's.
 */
import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { derivePassword, fromBase64Url, type WebKey } from '@sovereignfs/crypto/web';

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
