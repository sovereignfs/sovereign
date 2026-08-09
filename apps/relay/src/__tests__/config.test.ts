import { afterEach, describe, expect, it } from 'vitest';

const ENV_KEYS = [
  'RELAY_ENROLLMENT_SECRET',
  'APNS_KEY',
  'APNS_KEY_ID',
  'APNS_TEAM_ID',
  'APNS_BUNDLE_ID',
  'APNS_BUNDLE_ID_MACOS',
  'APNS_USE_SANDBOX',
  'FCM_SERVICE_ACCOUNT_JSON',
  'WNS_PACKAGE_SID',
  'WNS_CLIENT_SECRET',
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

describe('apnsMacosConfigured (RFC 0087 "Desktop native push" addendum)', () => {
  it('false when the shared APNs credential is present but APNS_BUNDLE_ID_MACOS is not', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'bundle';
    const { apnsMacosConfigured } = await import('../config');
    expect(apnsMacosConfigured()).toBe(false);
  });

  it('false when APNS_BUNDLE_ID_MACOS is set but the shared credential is not', async () => {
    process.env.APNS_BUNDLE_ID_MACOS = 'fs.sovereign.desktop';
    const { apnsMacosConfigured } = await import('../config');
    expect(apnsMacosConfigured()).toBe(false);
  });

  it("true when both the shared credential and APNS_BUNDLE_ID_MACOS are set — independent of iOS's own APNS_BUNDLE_ID", async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID_MACOS = 'fs.sovereign.desktop';
    const { apnsMacosConfigured, apnsConfigured } = await import('../config');
    expect(apnsMacosConfigured()).toBe(true);
    // iOS's own gate is unaffected — APNS_BUNDLE_ID was never set here.
    expect(apnsConfigured()).toBe(false);
  });

  it('apnsConfig().macosBundleId is undefined when unset, and reflects APNS_BUNDLE_ID_MACOS when set', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'fs.sovereign.mobile';
    const { apnsConfig } = await import('../config');
    expect(apnsConfig().macosBundleId).toBeUndefined();
    process.env.APNS_BUNDLE_ID_MACOS = 'fs.sovereign.desktop';
    expect(apnsConfig().macosBundleId).toBe('fs.sovereign.desktop');
    // iOS's own bundleId field is untouched by the addition.
    expect(apnsConfig().bundleId).toBe('fs.sovereign.mobile');
  });
});

describe('wnsServiceAccount / wnsConfigured / wnsConfig', () => {
  it('false/throws when unset', async () => {
    const { wnsConfigured, wnsConfig } = await import('../config');
    expect(wnsConfigured()).toBe(false);
    expect(() => wnsConfig()).toThrow(/WNS is not configured/);
  });

  it('false unless both WNS_PACKAGE_SID and WNS_CLIENT_SECRET are set', async () => {
    const { wnsConfigured } = await import('../config');
    process.env.WNS_PACKAGE_SID = 'sid';
    expect(wnsConfigured()).toBe(false);
    process.env.WNS_CLIENT_SECRET = 'secret';
    expect(wnsConfigured()).toBe(true);
  });

  it('wnsConfig() returns the configured values once both are set', async () => {
    process.env.WNS_PACKAGE_SID = 'ms-app://sid';
    process.env.WNS_CLIENT_SECRET = 'shh';
    const { wnsConfig } = await import('../config');
    expect(wnsConfig()).toEqual({ packageSid: 'ms-app://sid', clientSecret: 'shh' });
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
