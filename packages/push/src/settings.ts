import { readFileSync } from 'node:fs';
import { keyPairOf } from './keys.js';

/**
 * The app's push settings (RFC 0009 §1.1): its key, the public key derived from it, and the contact push services see. Read once at
 * start-up with {@link pushSettings}; `undefined` means the app has no push, and says so.
 */
export interface PushSettings {
  /** The P-256 private key, 32 bytes in URL-safe base64. */
  readonly privateKey: string;
  /** The public key a browser subscribes with, 65 bytes in URL-safe base64. */
  readonly publicKey: string;
  /** `mailto:` or `https:`: whom a push service can tell when the app misbehaves. */
  readonly subject: string;
}

/** A push setting that is wrong: thrown at start-up, naming the variable and never its value. */
export class PushSettingsError extends Error {
  override readonly name = 'PushSettingsError';
}

type Environment = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const isLocal = (host: string) => LOCAL_HOSTS.has(host) || host.endsWith('.localhost');

/**
 * A secret as `NAME` or `NAME_FILE` (contracts/env.md §3): both is an error; from a file one trailing newline is dropped; a file
 * that cannot be read is named without its cause; a value given directly is used as written.
 */
function readSecret(env: Environment, name: string): string | undefined {
  const direct = env[name];
  const file = env[`${name}_FILE`];
  if (direct !== undefined && file !== undefined)
    throw new PushSettingsError(`${name} and ${name}_FILE are both set: set one.`);
  if (file === undefined) return direct === '' ? undefined : direct;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new PushSettingsError(`${name}_FILE names a file that cannot be read.`);
  }
  return text.replace(/\r?\n$/, '');
}

/** Whether a contact is one Apple's push service, the strictest, accepts: `mailto:` an address, or an `https` address not on this machine. */
export function isValidSubject(subject: string): boolean {
  if (subject.startsWith('mailto:'))
    return /^mailto:[^\s@/?#]+@[^\s@/?#.]+(\.[^\s@/?#.]+)+$/.test(subject);
  let url: URL;
  try {
    url = new URL(subject);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.hostname.includes('.') &&
    !isLocal(url.hostname)
  );
}

/**
 * Reads `<PREFIX>_VAPID_PRIVATE_KEY` (or its `_FILE` form) and `<PREFIX>_VAPID_SUBJECT`, which defaults to `<PREFIX>_URL` when that
 * is an `https` address. Returns `undefined` when there is no key. Throws {@link PushSettingsError} for a key that is not a P-256
 * private key, or when a key is set and the contact is missing, `localhost` or malformed.
 */
export function pushSettings(
  prefix: string,
  env: Environment = process.env,
): PushSettings | undefined {
  const p = prefix.replace(/_$/, '');
  const keyName = `${p}_VAPID_PRIVATE_KEY`;
  const key = readSecret(env, keyName);
  if (key === undefined) return undefined;
  const pair = keyPairOf(key);
  if (!pair)
    throw new PushSettingsError(
      `${keyName} is not a P-256 private key: 32 bytes in URL-safe base64. Make one with \`npx @sovereignfs/push keys\`.`,
    );

  const subjectName = `${p}_VAPID_SUBJECT`;
  const given = env[subjectName];
  if (given !== undefined && given !== '') {
    if (!isValidSubject(given))
      throw new PushSettingsError(
        `${subjectName} must be a mailto: address or an https address that is not localhost.`,
      );
    return { ...pair, subject: given };
  }
  const url = env[`${p}_URL`];
  if (url !== undefined && isValidSubject(url)) return { ...pair, subject: url };
  throw new PushSettingsError(
    `${keyName} is set, so push needs a contact: set ${subjectName} (mailto: or https), or ${p}_URL to the app's https address.`,
  );
}
