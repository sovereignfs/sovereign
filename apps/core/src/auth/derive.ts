import { saltReader, signInDerivation } from '@sovereignfs/auth/client';

/**
 * What a browser sends where it used to send a password (core-app §5.2): the sign-in value, derived by the sign-in package from the
 * password, the address and the instance id, so that core never receives the password. Every form that sets or asks for a password
 * calls this. Browser only, and only in a handler: never in render.
 */

/** The instance id, read once from the instance document, which carries it for any client (core-app §5.2). */
export const readInstanceId = saltReader('/.well-known/sovereign-instance', 'instanceId');

const derivation = signInDerivation(readInstanceId);

/**
 * The sign-in value for this password and address, and the secret it was made from, which opens the person's keys once the server
 * has accepted the value (core-app §5.3).
 */
export const deriveForSignIn = derivation.deriveForSignIn;

/** The sign-in value alone, where nothing is opened afterwards. */
export const signInValue = derivation.signInValue;
