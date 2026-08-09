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

/** The APNs JWT credential (key/keyId/teamId) is shared across every Apple
 *  platform under the same Developer Team — iOS and macOS each additionally
 *  need their own bundle-ID topic on top of this, checked separately by
 *  `apnsConfigured()`/`apnsMacosConfigured()` below, so that an operator can
 *  enable one platform without the other. */
function apnsSharedCredentialConfigured(): boolean {
  return Boolean(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

/** True when APNs credentials are present for iOS specifically (the shared
 *  credential plus iOS's own `APNS_BUNDLE_ID`). */
export function apnsConfigured(): boolean {
  return apnsSharedCredentialConfigured() && Boolean(process.env.APNS_BUNDLE_ID);
}

/** True when the shared APNs JWT credential AND macOS's own bundle-ID topic
 *  (`APNS_BUNDLE_ID_MACOS`) are both present — independent of whether iOS's
 *  own `APNS_BUNDLE_ID` is set. See RFC 0087's "Desktop native push"
 *  addendum: an operator can enable macOS push without iOS, or vice versa. */
export function apnsMacosConfigured(): boolean {
  return apnsSharedCredentialConfigured() && Boolean(process.env.APNS_BUNDLE_ID_MACOS);
}

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  /** iOS's `apns-topic` — `undefined` unless `APNS_BUNDLE_ID` is set;
   *  callers that need iOS specifically should also check `apnsConfigured()`. */
  bundleId?: string;
  /** macOS's own `apns-topic`, additive (RFC 0087's "Desktop native push"
   *  addendum) — `undefined` unless `APNS_BUNDLE_ID_MACOS` is set. Same
   *  Apple Developer Team and JWT credential as iOS, distinct app identity. */
  macosBundleId?: string;
  useSandbox: boolean;
}

/** Only the shared JWT credential is required to construct this — either
 *  bundle-ID field may be absent, since a relay may have only one platform's
 *  topic configured. Callers select and null-check the topic they need. */
export function apnsConfig(): ApnsConfig {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) {
    throw new Error('APNs is not configured (APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID)');
  }
  return {
    key,
    keyId,
    teamId,
    bundleId: process.env.APNS_BUNDLE_ID,
    macosBundleId: process.env.APNS_BUNDLE_ID_MACOS,
    useSandbox: process.env.APNS_USE_SANDBOX === 'true',
  };
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

/** True when WNS (Windows Notification Service) credentials are present —
 *  see RFC 0087's "Desktop native push" addendum. */
export function wnsConfigured(): boolean {
  return Boolean(process.env.WNS_PACKAGE_SID && process.env.WNS_CLIENT_SECRET);
}

export interface WnsConfig {
  /** Partner Center-issued Package SID — used as the OAuth2 `client_id`. */
  packageSid: string;
  clientSecret: string;
}

export function wnsConfig(): WnsConfig {
  const packageSid = process.env.WNS_PACKAGE_SID;
  const clientSecret = process.env.WNS_CLIENT_SECRET;
  if (!packageSid || !clientSecret) {
    throw new Error('WNS is not configured (WNS_PACKAGE_SID/WNS_CLIENT_SECRET)');
  }
  return { packageSid, clientSecret };
}
