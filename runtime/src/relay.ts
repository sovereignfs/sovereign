/**
 * Sovereign Relay configuration (RFC 0087, workstream 0005).
 *
 * Read-side only in leg 1 — enough for the device-token registration route
 * to capture a `relay_url` on each token at registration time (RFC 0087's
 * "Device-token schema": a later relay-URL change must not silently break
 * already-registered devices before they re-register, so the value is
 * copied onto the row, not read fresh from config at send time). The
 * Console UI to actually view/change these settings, and the "distinct,
 * explicit full opt-out" semantics, are workstream 0005 leg 2's own
 * deliverable — this file only defines the settings' keys and read
 * behavior so leg 1 has something real to call.
 */
import { getPlatformSetting, type PlatformDb } from '@sovereignfs/db';

const RELAY_URL_SETTING = 'push_relay_url';
const RELAY_DISABLED_SETTING = 'push_relay_disabled';

/** `sovereignfs`'s own default relay — see RFC 0087's "Deployment topology". */
const DEFAULT_RELAY_URL = 'https://relay.sovereign.openfs.io';

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
