/**
 * Sovereign Relay configuration (RFC 0087, workstream 0005).
 *
 * Read-side only in leg 1 — enough for the device-token registration route
 * to capture a `relay_url` on each token at registration time (RFC 0087's
 * "Device-token schema": a later relay-URL change must not silently break
 * already-registered devices before they re-register, so the value is
 * copied onto the row, not read fresh from config at send time). Leg 2 adds
 * the Console UI (`plugins/console/app/settings/`) that actually writes
 * `RELAY_URL_SETTING`/`RELAY_DISABLED_SETTING` via `PATCH /api/admin/settings`
 * — this file still owns the settings' keys and read/resolution behavior.
 */
import { getPlatformSetting, setPlatformSetting, type PlatformDb } from '@sovereignfs/db';
import { logger } from './logger';

export const RELAY_URL_SETTING = 'push_relay_url';
export const RELAY_DISABLED_SETTING = 'push_relay_disabled';
const INSTANCE_KEY_SETTING = 'push_relay_instance_key';

/** `sovereignfs`'s own default relay — see RFC 0087's "Deployment topology". */
export const DEFAULT_RELAY_URL = 'https://relay.sovereign.openfs.io';

/**
 * The relay URL a newly-registering device token should be stored against,
 * or `null` if the relay is disabled for this instance — the registration
 * route must refuse registration in that case, per RFC 0087's opt-out
 * requirement ("an instance with the relay disabled simply never registers
 * push device tokens").
 *
 * Resolution order: an explicit disable flag wins outright; otherwise the
 * admin-configured URL (`platform_settings`), falling back to
 * `SOVEREIGN_RELAY_URL` (deployment-time override, e.g. for an operator
 * self-hosting their own relay), falling back to `sovereignfs`'s own
 * default.
 */
export async function getConfiguredRelayUrl(pdb: PlatformDb): Promise<string | null> {
  const disabled = await getPlatformSetting(pdb, RELAY_DISABLED_SETTING);
  if (disabled === 'true') return null;

  const configured = await getPlatformSetting(pdb, RELAY_URL_SETTING);
  return configured ?? process.env.SOVEREIGN_RELAY_URL ?? DEFAULT_RELAY_URL;
}

interface StoredInstanceKey {
  relayUrl: string;
  instanceKey: string;
}

/**
 * This instance's `instanceKey` for `relayUrl` (RFC 0087's "Minimal,
 * revocable per-instance authentication") — enrolls once via
 * `POST /v1/enroll` and caches the result in `platform_settings`, keyed
 * together with the `relayUrl` it was issued for. A relay-URL change (an
 * admin repointing at a different relay, e.g. taking the self-host escape
 * hatch) is detected by comparing the cached `relayUrl`, not just trusting
 * a stale key — an instanceKey from one relay is meaningless to another.
 *
 * Returns `null` (never throws) on any enrollment failure — the caller
 * (`fanOutPushToUser`'s native branch) must treat that as a normal delivery
 * failure for this fan-out, not crash the whole notification.
 */
export async function getInstanceKey(pdb: PlatformDb, relayUrl: string): Promise<string | null> {
  const stored = await getPlatformSetting(pdb, INSTANCE_KEY_SETTING);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as StoredInstanceKey;
      if (parsed.relayUrl === relayUrl && typeof parsed.instanceKey === 'string') {
        return parsed.instanceKey;
      }
    } catch {
      // Corrupt stored value — fall through and re-enroll.
    }
  }

  try {
    const res = await fetch(`${relayUrl}/v1/enroll`, { method: 'POST' });
    if (!res.ok) {
      logger.warn('push relay: enrollment failed', { relayUrl, status: res.status });
      return null;
    }
    const body = (await res.json()) as { instanceKey?: string };
    if (typeof body.instanceKey !== 'string') {
      logger.warn('push relay: enrollment response missing instanceKey', { relayUrl });
      return null;
    }
    await setPlatformSetting(
      pdb,
      INSTANCE_KEY_SETTING,
      JSON.stringify({ relayUrl, instanceKey: body.instanceKey } satisfies StoredInstanceKey),
    );
    return body.instanceKey;
  } catch (err) {
    logger.warn('push relay: enrollment request failed', {
      relayUrl,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
