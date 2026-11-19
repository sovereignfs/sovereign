import type { Executor } from '@sovereignfs/database';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';

/**
 * Checking one of the person's passkeys for the session they are in, without signing in (RFC 0006 B1, B4): turning the lock on, and
 * unlocking. A passkey sign-in would open a new session and end the locked one, which would end every app's session with it (§3.6.5);
 * this checks the passkey against the session that is there instead. The check is the one better-auth's passkey sign-in makes, with the
 * same library: one of the account's own passkeys, a challenge core gave this session and takes back once, the instance's relying party
 * and origins, and the person verified on the device.
 *
 * The only writer of `lock_challenges`.
 */

/** How long a challenge may wait for its answer. */
export const CHALLENGE_MS = 5 * 60_000;

type Run = Pick<Executor, 'run'>;
type WebAuthn = { rpId: string; origins: string[] };

/** What the browser needs to ask for a passkey: the challenge, and which passkeys are the account's. */
export type PasskeyRequest = { challenge: string; rpId: string; credentialIds: string[] };

/** A challenge for this session, replacing any it had; `undefined` when the account has no passkey. */
export async function passkeyChallenge(
  db: Run,
  webauthn: WebAuthn,
  who: { sessionId: string; userId: string },
  now: number = Date.now(),
): Promise<PasskeyRequest | undefined> {
  const { rows } = await db.run('select credential_id from passkeys where user_id = ?', [
    who.userId,
  ]);
  const credentialIds = rows.map((row) => String(row.credential_id));
  if (credentialIds.length === 0) return undefined;
  const options = await generateAuthenticationOptions({
    rpID: webauthn.rpId,
    allowCredentials: credentialIds.map((id) => ({ id })),
    userVerification: 'required',
  });
  await db.run(
    `insert into lock_challenges (session_id, challenge, expires_at) values (?, ?, ?)
     on conflict (session_id) do update set challenge = ?, expires_at = ?`,
    [who.sessionId, options.challenge, now + CHALLENGE_MS, options.challenge, now + CHALLENGE_MS],
  );
  return { challenge: options.challenge, rpId: webauthn.rpId, credentialIds };
}

/**
 * Whether `answer` is one of the account's passkeys answering this session's challenge, with the person verified. The challenge is taken
 * whatever the outcome, so an answer counts once. `false` for anything that does not hold, never an error.
 */
export async function checkPasskey(
  db: Run,
  webauthn: WebAuthn,
  who: { sessionId: string; userId: string },
  answer: unknown,
  now: number = Date.now(),
): Promise<boolean> {
  const taken = await db.run(
    'delete from lock_challenges where session_id = ? returning challenge, expires_at',
    [who.sessionId],
  );
  const challenge = taken.rows[0];
  if (!challenge || Number(challenge.expires_at) < now) return false;
  const response = asAssertion(answer);
  if (!response) return false;
  const { rows } = await db.run(
    'select id, public_key, counter, transports from passkeys where user_id = ? and credential_id = ?',
    [who.userId, response.id],
  );
  const passkey = rows[0];
  if (!passkey) return false;
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: String(challenge.challenge),
      expectedOrigin: webauthn.origins,
      expectedRPID: webauthn.rpId,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(Buffer.from(String(passkey.public_key), 'base64')),
        counter: Number(passkey.counter),
        ...(typeof passkey.transports === 'string' && passkey.transports
          ? { transports: passkey.transports.split(',') as never }
          : {}),
      },
      requireUserVerification: true,
    });
  } catch {
    return false;
  }
  if (!verification.verified || !verification.authenticationInfo.userVerified) return false;
  await db.run('update passkeys set counter = ? where id = ?', [
    verification.authenticationInfo.newCounter,
    passkey.id,
  ]);
  return true;
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** The answer as the library takes it, when it has the shape of an assertion; nothing else is passed on. */
function asAssertion(answer: unknown): AuthenticationResponseJSON | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined;
  const { id, rawId, type, response } = answer as Record<string, unknown>;
  if (!text(id) || !text(rawId) || type !== 'public-key') return undefined;
  if (typeof response !== 'object' || response === null) return undefined;
  const { clientDataJSON, authenticatorData, signature, userHandle } = response as Record<
    string,
    unknown
  >;
  if (!text(clientDataJSON) || !text(authenticatorData) || !text(signature)) return undefined;
  return {
    id,
    rawId,
    type,
    clientExtensionResults: {},
    response: {
      clientDataJSON,
      authenticatorData,
      signature,
      ...(text(userHandle) ? { userHandle } : {}),
    },
  };
}
