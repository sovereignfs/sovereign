import { derivePassword, fromBase64Url } from '@sovereignfs/crypto/web';

/**
 * What a browser sends where it used to send a password (core-app §5.2): the sign-in value, derived here from the password, the
 * address and the instance id, so that core never receives the password. Every form that sets or asks for a password calls this.
 *
 * Browser only, and only in a handler: never in render.
 */

let instanceId: Promise<Uint8Array> | undefined;

/** The instance id, read once from the instance document, which carries it for any client (core-app §5.2). */
function readInstanceId(): Promise<Uint8Array> {
  instanceId ??= fetch('/.well-known/sovereign-instance', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('The instance document could not be read.');
      const id = fromBase64Url(
        ((await response.json()) as { instanceId?: string }).instanceId ?? '',
      );
      if (id?.length !== 32) throw new Error('The instance document has no instance id.');
      return id;
    })
    .catch((error: unknown) => {
      instanceId = undefined;
      throw error;
    });
  return instanceId;
}

/**
 * Lets the page paint before the derivation runs. Argon2id holds the page for about a second on a phone, and without this the
 * "working" state set just before would not show until it is over.
 */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** The sign-in value for this password and address. */
export async function signInValue(password: string, address: string): Promise<string> {
  const id = await readInstanceId();
  await nextPaint();
  const { signIn } = await derivePassword({ password, address, instanceId: id });
  return signIn;
}
