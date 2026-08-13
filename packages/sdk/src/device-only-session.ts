/**
 * The `device-only` tier's in-memory unlock session (RFC 0093 §2's re-lock
 * policy, enforced) — web/PWA only, mirroring the role `SecureStorage.swift`'s
 * `sharedContext`/`contextStartedAt` pair and `SecureStorage.java`'s
 * key-validity window play natively (`sovereign-mobile`, task 20.13). Every
 * other module in this family only *persists* something: `device-only-storage.ts`
 * persists the wrapped key and the policy preference, `device-only-crypto.ts`
 * runs the ceremony once. Nothing before this module actually holds the
 * *unwrapped* Device Storage Key across more than one call — a plugin needing
 * it twice in a row would otherwise re-run the PRF ceremony (and its platform
 * prompt) every single time, regardless of how lenient the user's chosen
 * re-lock policy is. This module is that missing piece: the single function a
 * `device-only` plugin's own storage layer calls to get a *usable* key,
 * reusing an already-unlocked one when the policy window still allows it and
 * transparently re-deriving when it doesn't.
 *
 * Deliberately a lazy, time-comparison check on each call rather than a
 * proactively-firing timer or a `visibilitychange`/`pagehide` listener that
 * discards eagerly on backgrounding: a background tab's timers are throttled
 * or suspended unreliably across browsers, so anything relying on one to
 * *fire* to enforce the window can't be trusted to run. Comparing elapsed
 * wall-clock time against the policy window on next access needs no timer to
 * have fired at all, and correctly handles both real-world cases RFC 0093 §2
 * calls out: a browser tab that stays resident in memory while backgrounded
 * (elapsed time since `unlockedAt` is checked and found to exceed the window),
 * and one whose whole JS execution context gets discarded by the OS (this
 * module's state is gone with it — any next access starts from an empty
 * session, which is *stricter* than the policy requires, never weaker, so no
 * separate handling is needed for that case).
 */

import {
  deriveDeviceOnlyKeyViaPrf,
  fromBase64Url,
  unwrapDeviceStorageKeyWithPrfKey,
} from './device-only-crypto';
import {
  getDeviceStorageKeyStatus,
  loadReLockPolicy,
  loadWrappedDeviceStorageKeys,
  RE_LOCK_POLICY_WINDOW_MS,
} from './device-only-storage';

export type UnlockDeviceStorageKeyResult =
  | { status: 'ok'; key: CryptoKey }
  | { status: 'unsupported' } // WebAuthn/OPFS unavailable in this environment
  | { status: 'no-device-auth' } // nothing set up yet, and no platform authenticator to set it up with
  | { status: 'not-set-up' } // nothing enrolled, or enrolled material is missing/incomplete
  | { status: 'cancelled' } // the user dismissed the platform prompt
  | { status: 'failed'; error: string };

interface UnlockSession {
  key: CryptoKey;
  unlockedAt: number;
}

/**
 * Module-level, in-memory only — never persisted, by design. `unlockedAt` is
 * a `Date.now()` snapshot, not a timer; see the module doc comment for why
 * that's deliberate.
 */
let session: UnlockSession | null = null;

/**
 * Get a usable Device Storage Key: reuse the current unlock session if the
 * user's chosen re-lock policy still allows it, otherwise run the PRF
 * ceremony fresh (prompting for biometric/passcode presence) and cache the
 * result under a new session. The one function a `device-only` plugin's
 * storage layer should call before every read or write against its OPFS
 * database — never call `deriveDeviceOnlyKeyViaPrf` directly for this
 * purpose, or every access re-prompts regardless of policy.
 */
export async function getUnlockedDeviceStorageKey(): Promise<UnlockDeviceStorageKeyResult> {
  const status = await getDeviceStorageKeyStatus();
  if (status !== 'set-up') {
    session = null;
    return { status };
  }

  if (session && (await isWithinReLockWindow(session.unlockedAt))) {
    return { status: 'ok', key: session.key };
  }
  session = null;

  const wrapped = await loadWrappedDeviceStorageKeys();
  if (!wrapped.prfWrapped || !wrapped.prfCredentialId) {
    // getDeviceStorageKeyStatus() said 'set-up', but the material backing it
    // is incomplete — treat as not-set-up rather than throw. Not expected in
    // practice (both are written together at setup), but the two are read
    // independently here, and a caller shouldn't see an unexplained crash if
    // they ever do disagree.
    return { status: 'not-set-up' };
  }

  const prfResult = await deriveDeviceOnlyKeyViaPrf(
    fromBase64Url(wrapped.prfCredentialId) as BufferSource,
  );
  if (prfResult.status !== 'ok') {
    if (prfResult.status === 'unavailable') {
      return {
        status: 'failed',
        error: 'This passkey is no longer PRF-capable — re-enroll in Account → Security.',
      };
    }
    return prfResult;
  }

  const key = await unwrapDeviceStorageKeyWithPrfKey(wrapped.prfWrapped, prfResult.key);
  session = { key, unlockedAt: Date.now() };
  return { status: 'ok', key };
}

async function isWithinReLockWindow(unlockedAt: number): Promise<boolean> {
  const policy = await loadReLockPolicy();
  if (policy === 'immediate') return false;
  return Date.now() - unlockedAt < RE_LOCK_POLICY_WINDOW_MS[policy];
}

/**
 * Discard the current unlock session immediately, regardless of the re-lock
 * policy window — an explicit "Lock now" action, or a caller that also wants
 * to clear the in-memory key the moment `clearWrappedDeviceStorageKeys()`
 * ("Forget Device Storage Key") runs rather than waiting for it to self-heal
 * on the next `getUnlockedDeviceStorageKey()` call. Safe to call whether or
 * not a session is currently active.
 */
export function lockDeviceStorageKey(): void {
  session = null;
}

/**
 * Whether a call to `getUnlockedDeviceStorageKey()` right now would return
 * the current session's key without prompting — for UI that wants to show
 * "unlocked" vs. "locked" state without itself triggering a ceremony.
 */
export async function isDeviceStorageKeyUnlocked(): Promise<boolean> {
  if (!session) return false;
  return isWithinReLockWindow(session.unlockedAt);
}
