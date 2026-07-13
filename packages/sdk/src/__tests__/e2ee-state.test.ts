import { describe, expect, it } from 'vitest';
import type { E2eeDeviceEnrollment, E2eeProfile } from '../types';
import { classifyE2eeLocalState } from '../e2ee-state';

const profile: E2eeProfile = {
  id: 'profile-1',
  userId: 'user-1',
  status: 'active',
  cmkAlgorithm: 'AES-GCM-256',
  createdAt: 0,
  updatedAt: 0,
};

function enrollment(overrides: Partial<E2eeDeviceEnrollment> = {}): E2eeDeviceEnrollment {
  return {
    id: 'enrollment-1',
    userId: 'user-1',
    deviceId: 'device-1',
    deviceLabel: 'Chrome on macOS',
    wrappedCmk: 'opaque',
    algorithmVersion: 'v1',
    createdAt: 0,
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('classifyE2eeLocalState', () => {
  it('returns not-set-up when there is no profile', () => {
    const result = classifyE2eeLocalState(null, [], 'device-1', null);
    expect(result).toEqual({
      state: 'not-set-up',
      deviceId: null,
      deviceKey: null,
      activeEnrollment: null,
    });
  });

  it('returns locked when a profile exists but this device has no local key', () => {
    const result = classifyE2eeLocalState(profile, [enrollment()], 'device-1', null);
    expect(result.state).toBe('locked');
    expect(result.deviceKey).toBeNull();
  });

  it('returns locked when this device has a local key but no active enrollment record', () => {
    const fakeKey = {} as CryptoKey;
    const result = classifyE2eeLocalState(profile, [], 'device-1', fakeKey);
    expect(result.state).toBe('locked');
  });

  it('returns locked when this device has a local key but its enrollment was revoked', () => {
    const fakeKey = {} as CryptoKey;
    const result = classifyE2eeLocalState(
      profile,
      [enrollment({ revokedAt: 12345 })],
      'device-1',
      fakeKey,
    );
    expect(result.state).toBe('locked');
  });

  it('returns unlocked when this device has both a local key and an active enrollment', () => {
    const fakeKey = {} as CryptoKey;
    const activeEnrollment = enrollment();
    const result = classifyE2eeLocalState(profile, [activeEnrollment], 'device-1', fakeKey);

    expect(result).toEqual({
      state: 'unlocked',
      deviceId: 'device-1',
      deviceKey: fakeKey,
      activeEnrollment,
    });
  });

  it('only matches the enrollment for this specific device id', () => {
    const fakeKey = {} as CryptoKey;
    const otherDeviceEnrollment = enrollment({ deviceId: 'device-2' });
    const result = classifyE2eeLocalState(profile, [otherDeviceEnrollment], 'device-1', fakeKey);

    expect(result.state).toBe('locked');
  });
});
