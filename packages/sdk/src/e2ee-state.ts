/**
 * Locked/unlocked state detection for client-side encryption (RFC 0060 SDK
 * responsibility: "returning normalized unsupported/locked/error states").
 * Consolidates the checks every consumer of `sdk.e2ee` needs before touching
 * encrypted data — browser support, this device's local wrapping key, and
 * whether this device has an active (non-revoked) enrollment — into one
 * reusable helper instead of each plugin (Account today, Wallet later)
 * reimplementing the same logic inline.
 */
import type { E2eeDeviceEnrollment, E2eeProfile, E2eeState } from './types';
import { getDeviceKey, getOrCreateDeviceId } from './e2ee-device';

export interface E2eeLocalState {
  state: E2eeState;
  /** Null only when `state` is `'unsupported'` or `'not-set-up'`. */
  deviceId: string | null;
  /** This device's local wrapping key — present only when `state` is `'unlocked'`. */
  deviceKey: CryptoKey | null;
  /** This device's active enrollment record — present only when `state` is `'unlocked'`. */
  activeEnrollment: E2eeDeviceEnrollment | null;
}

/** True when the current environment has the WebCrypto and IndexedDB primitives E2EE needs. */
export function browserSupportsE2ee(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  );
}

/**
 * Pure classification given already-resolved inputs — no IndexedDB access,
 * so it's trivially unit-testable. `getE2eeLocalState` below is the
 * convenience wrapper that actually reads this device's local key.
 */
export function classifyE2eeLocalState(
  profile: E2eeProfile | null,
  devices: E2eeDeviceEnrollment[],
  deviceId: string,
  deviceKey: CryptoKey | null,
): E2eeLocalState {
  if (!profile) {
    return { state: 'not-set-up', deviceId: null, deviceKey: null, activeEnrollment: null };
  }
  const activeEnrollment =
    devices.find((d) => d.deviceId === deviceId && d.revokedAt === null) ?? null;
  if (deviceKey && activeEnrollment) {
    return { state: 'unlocked', deviceId, deviceKey, activeEnrollment };
  }
  return { state: 'locked', deviceId, deviceKey: null, activeEnrollment: null };
}

/**
 * Resolve this device's current E2EE state against the user's profile and
 * enrollment list (typically loaded server-side and passed in by the
 * caller). Reads this device's local wrapping key from IndexedDB.
 */
export async function getE2eeLocalState(
  profile: E2eeProfile | null,
  devices: E2eeDeviceEnrollment[],
): Promise<E2eeLocalState> {
  if (!browserSupportsE2ee()) {
    return { state: 'unsupported', deviceId: null, deviceKey: null, activeEnrollment: null };
  }
  if (!profile) {
    return { state: 'not-set-up', deviceId: null, deviceKey: null, activeEnrollment: null };
  }
  const deviceId = getOrCreateDeviceId();
  const deviceKey = await getDeviceKey(deviceId);
  return classifyE2eeLocalState(profile, devices, deviceId, deviceKey);
}
