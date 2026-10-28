import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/**
 * A software authenticator for tests: it makes the registration and sign-in answers a device would,
 * from the standard (WebAuthn level 2, "none" attestation, ES256), sharing no code with the library
 * under test. It stands in for a browser's virtual authenticator.
 */

const b64url = (bytes: Buffer): string => bytes.toString('base64url');
const fromB64url = (text: string): Buffer => Buffer.from(text, 'base64url');
const sha256 = (data: Buffer | string): Buffer => createHash('sha256').update(data).digest();

// -- the little CBOR that attestation needs ---------------------------------------------------------

type Cbor = number | string | Buffer | Cbor[] | Map<Cbor, Cbor>;

function head(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  const bytes = Buffer.alloc(3);
  bytes[0] = (major << 5) | 25;
  bytes.writeUInt16BE(value, 1);
  return bytes;
}

export function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, text.length), text]);
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}

// -- the authenticator ------------------------------------------------------------------------------

/** What a site asks a device to make a passkey with, as it arrives as JSON. */
export type CreationOptions = {
  challenge: string;
  rp: { id?: string; name: string };
  authenticatorSelection?: { residentKey?: string; userVerification?: string };
};
export type RequestOptions = { challenge: string; rpId?: string; userVerification?: string };

export type AuthenticatorSettings = {
  /** Whether the person unlocked the device (a PIN or biometric). Core requires it. */
  userVerified?: boolean;
  /** Whether the passkey is synced between the person's devices (the BE and BS flags). */
  backedUp?: boolean;
  /** The origin the browser would put in the signed data: normally the site's own. */
  origin: string;
};

const FLAG = {
  userPresent: 0x01,
  userVerified: 0x04,
  backupEligible: 0x08,
  backedUp: 0x10,
  attested: 0x40,
};

export class VirtualAuthenticator {
  readonly credentialId = randomBytes(32);
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;
  counter = 0;
  /** Changed between calls to model an unlocked device, a locked one, or another site's page. */
  settings: AuthenticatorSettings;

  constructor(settings: AuthenticatorSettings) {
    this.settings = { userVerified: true, backedUp: true, ...settings };
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  #flags(extra = 0): number {
    return (
      FLAG.userPresent |
      (this.settings.userVerified ? FLAG.userVerified : 0) |
      (this.settings.backedUp ? FLAG.backupEligible | FLAG.backedUp : 0) |
      extra
    );
  }

  /** What the browser hands back after `navigator.credentials.create()`. */
  register(options: CreationOptions) {
    const rpId = options.rp.id ?? new URL(this.settings.origin).hostname;
    const jwk = this.#publicKey.export({ format: 'jwk' });
    const cose = new Map<Cbor, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, fromB64url(String(jwk.x))],
      [-3, fromB64url(String(jwk.y))],
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([this.#flags(FLAG.attested)]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      idLength,
      this.credentialId,
      cbor(cose),
    ]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const clientData = JSON.stringify({
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: this.settings.origin,
      crossOrigin: false,
    });
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        attestationObject: b64url(attestationObject),
        clientDataJSON: b64url(Buffer.from(clientData)),
        transports: ['internal'],
      },
    };
  }

  /** What the browser hands back after `navigator.credentials.get()`. */
  authenticate(options: RequestOptions, tamper = false) {
    const rpId = options.rpId ?? new URL(this.settings.origin).hostname;
    this.counter += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(rpId), Buffer.from([this.#flags()]), counter]);
    const clientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: options.challenge,
        origin: this.settings.origin,
        crossOrigin: false,
      }),
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientData)]),
      this.#privateKey,
    );
    if (tamper) signature[signature.length - 1] = (signature.at(-1) ?? 0) ^ 0xff;
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        authenticatorData: b64url(authData),
        clientDataJSON: b64url(clientData),
        signature: b64url(signature),
      },
    };
  }
}
