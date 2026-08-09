import { afterEach, describe, expect, it } from 'vitest';

const ENV_KEYS = [
  'RELAY_ENROLLMENT_SECRET',
  'APNS_KEY',
  'APNS_KEY_ID',
  'APNS_TEAM_ID',
  'APNS_BUNDLE_ID',
  'APNS_USE_SANDBOX',
  'FCM_SERVICE_ACCOUNT_JSON',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key);
});

describe('enrollmentConfigured', () => {
  it('false when unset, true when set', async () => {
    const { enrollmentConfigured } = await import('../config');
    expect(enrollmentConfigured()).toBe(false);
    process.env.RELAY_ENROLLMENT_SECRET = 'x';
    expect(enrollmentConfigured()).toBe(true);
  });
});

describe('apnsConfigured / apnsConfig', () => {
  it('false unless all four env vars are set', async () => {
    const { apnsConfigured } = await import('../config');
    expect(apnsConfigured()).toBe(false);
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    expect(apnsConfigured()).toBe(false);
    process.env.APNS_BUNDLE_ID = 'bundle';
    expect(apnsConfigured()).toBe(true);
  });

  it('apnsConfig() throws with a clear message when incomplete', async () => {
    const { apnsConfig } = await import('../config');
    expect(() => apnsConfig()).toThrow(/APNs is not configured/);
  });

  it('apnsConfig() defaults useSandbox to false, honors APNS_USE_SANDBOX=true', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'bundle';
    const { apnsConfig } = await import('../config');
    expect(apnsConfig().useSandbox).toBe(false);
    process.env.APNS_USE_SANDBOX = 'true';
    expect(apnsConfig().useSandbox).toBe(true);
  });
});

describe('fcmServiceAccount / fcmConfigured', () => {
  it('undefined/false when unset', async () => {
    const { fcmServiceAccount, fcmConfigured } = await import('../config');
    expect(fcmServiceAccount()).toBeUndefined();
    expect(fcmConfigured()).toBe(false);
  });

  it('undefined/false on malformed JSON, without throwing', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = 'not json';
    const { fcmServiceAccount, fcmConfigured } = await import('../config');
    expect(fcmServiceAccount()).toBeUndefined();
    expect(fcmConfigured()).toBe(false);
  });

  it('undefined/false when required fields are missing', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'p' });
    const { fcmServiceAccount, fcmConfigured } = await import('../config');
    expect(fcmServiceAccount()).toBeUndefined();
    expect(fcmConfigured()).toBe(false);
  });

  it('parses a well-formed service account', async () => {
    const account = {
      project_id: 'p',
      private_key: 'key',
      client_email: 'a@b.iam.gserviceaccount.com',
    };
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(account);
    const { fcmServiceAccount, fcmConfigured } = await import('../config');
    expect(fcmServiceAccount()).toEqual(account);
    expect(fcmConfigured()).toBe(true);
  });
});
