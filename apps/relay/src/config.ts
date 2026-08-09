/**
 * Environment-gated configuration (RFC 0087, workstream 0005 leg 2).
 *
 * Every capability here degrades to a clear "not configured" response rather
 * than throwing or pretending to succeed — the same discipline
 * `runtime/src/push.ts`'s `pushEnabled()` already established for VAPID web
 * push. A relay with no credentials configured is a normal, supported state
 * (e.g. freshly deployed, or an operator who hasn't finished Apple/Google
 * setup yet), not an error state.
 */

/** True when the relay can issue and verify enrollment tokens at all. */
export function enrollmentConfigured(): boolean {
  return Boolean(process.env.RELAY_ENROLLMENT_SECRET);
}

export function enrollmentSecret(): string {
  const secret = process.env.RELAY_ENROLLMENT_SECRET;
  if (!secret) throw new Error('RELAY_ENROLLMENT_SECRET is not configured');
  return secret;
}

/** True when APNs credentials are present. */
export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_BUNDLE_ID,
  );
}

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  useSandbox: boolean;
}

export function apnsConfig(): ApnsConfig {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!key || !keyId || !teamId || !bundleId) {
    throw new Error('APNs is not configured (APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID)');
  }
  return { key, keyId, teamId, bundleId, useSandbox: process.env.APNS_USE_SANDBOX === 'true' };
}

export interface FcmServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

/** Parses `FCM_SERVICE_ACCOUNT_JSON` — the Google-issued service-account key
 *  file's content, verbatim. Returns `undefined` (never throws) on absence
 *  or malformed JSON, matching this file's "gate, don't throw" discipline —
 *  callers check `fcmConfigured()` first, not this parse result directly. */
export function fcmServiceAccount(): FcmServiceAccount | undefined {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'project_id' in parsed &&
      'private_key' in parsed &&
      'client_email' in parsed
    ) {
      return parsed as FcmServiceAccount;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function fcmConfigured(): boolean {
  return fcmServiceAccount() !== undefined;
}
